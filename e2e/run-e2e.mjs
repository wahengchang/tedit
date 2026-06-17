// M5 端到端同像素(D11 的終極驗收,非樣本而是真實流程):
//   編輯器頁(server 載入模板,人所見)  vs  真正的 `tedit render` CLI 出圖
//   兩者 pixelmatch threshold=0 必須 diff=0。
// 這條打通 = 編輯器與 CLI 走同一 engine.bundle + 同一 Chromium 的結構保證成立。
// 前置:npm run build。

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const run = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'dist', 'web', 'server.js');
const CLI = path.join(ROOT, 'dist', 'cli', 'index.js');
const PORT = 5195;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.error(`ok    ${name}`);
  else { failures++; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

function waitServer(port, tries = 50) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/project' }, (res) => { res.resume(); resolve(); });
      req.on('error', () => (n <= 0 ? reject(new Error('server 未就緒')) : setTimeout(() => tick(n - 1), 100)));
    };
    tick(tries);
  });
}

// D23:一資料夾一專案一模板 → 每個範本一個專案夾,各起一個 server 比對
let browser;
const cleanups = [];
try {
  browser = await chromium.launch();

  for (const [i, tpl] of ['card', 'multibind'].entries()) {
    const port = PORT + i;
    const proj = mkdtempSync(path.join(tmpdir(), `tedit-e2e-${tpl}-`));
    cpSync(path.join(ROOT, 'examples', 'demo', tpl), proj, { recursive: true });
    const server = spawn(process.execPath, [SERVER, '--port', String(port), '--dir', proj], { stdio: 'ignore' });
    cleanups.push(() => { server.kill(); rmSync(proj, { recursive: true, force: true }); });
    await waitServer(port);

    // 視窗要夠寬,讓中間欄(總寬 - 左 200 - 右 240)容得下最寬畫布(card 1200),
    // 否則 #stage 溢出被裁,截圖右側不完整(測試假象,非真 bug)
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => document.querySelectorAll('#layers-list .layer-row').length > 0, { timeout: 10000 });
    // 隱藏綁定角標(僅 UI 覆蓋層,不該進比對);不選取任何元素(無控制柄)
    await page.evaluate(() => { const b = document.getElementById('badge-layer'); if (b) b.style.display = 'none'; });
    await page.waitForTimeout(150);
    const editorBuf = await page.locator('#stage').screenshot();
    await page.close();

    // 真正的 CLI 出圖(無資料 → 設計時值,與編輯器所見對齊)
    const cliOut = path.join(proj, `cli-${tpl}.png`);
    await run(process.execPath, [CLI, 'render', proj, '-o', cliOut]);

    const a = PNG.sync.read(editorBuf);
    const b = PNG.sync.read(readFileSync(cliOut));
    let diff = -1;
    if (a.width === b.width && a.height === b.height) {
      const out = new PNG({ width: a.width, height: a.height });
      diff = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0 });
      if (diff !== 0) writeFileSync(path.join(ROOT, 'e2e', 'out', `e2e-${tpl}-diff.png`), PNG.sync.write(out));
    }
    check(`端到端同像素 [${tpl}]:編輯器頁 vs tedit render`, diff === 0,
      `diff=${diff} 尺寸 ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    check(`  [${tpl}] 無 page error`, errs.length === 0, errs.join(' | '));
  }
} catch (e) {
  failures++;
  console.error(`FAIL  e2e: ${e.message}`);
} finally {
  if (browser) await browser.close();
  for (const c of cleanups) c();
}

console.error(failures === 0 ? '\n端到端 parity 全部通過' : `\n端到端 parity ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
