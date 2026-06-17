// 端到端整合(網頁編輯 → CLI 出圖):
//   Playwright 開「網頁編輯器」建新模板 → 加文字 + 設內容 + 綁變數 msg → 存檔
//   → 用「CLI」對存出的模板套不同資料 render → 驗證 PNG 產出,且變數注入確實改變輸出。
// 證明兩條路徑(瀏覽器編輯 / headless CLI)接得起來,不只各自單元通過。前置:npm run build。

import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'dist', 'web', 'server.js');
const CLI = path.join(ROOT, 'dist', 'cli', 'index.js');
const PORT = 5198;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.error(`ok    ${name}`);
  else { failures++; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

function waitServer(port, tries = 50) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/project' }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => (n <= 0 ? reject(new Error('server 未就緒')) : setTimeout(() => tick(n - 1), 100)));
    };
    tick(tries);
  });
}

const work = mkdtempSync(path.join(tmpdir(), 'tedit-web2cli-'));
cpSync(path.join(ROOT, 'examples', 'demo'), work, { recursive: true });

const server = spawn(process.execPath, [SERVER, '--port', String(PORT), '--dir', work], { stdio: 'ignore' });
let browser;
try {
  await waitServer(PORT);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // 1. 網頁:開一個不存在的模板名 → 空白具名模板(首存即建檔)
  await page.goto(`http://127.0.0.1:${PORT}/?template=web2cli`);
  await page.waitForFunction(() => !!document.querySelector('#add-text'), { timeout: 10000 });

  // 2. 加文字元素(新增後自動選取)
  await page.locator('#add-text').click();
  await page.waitForFunction(() => document.querySelectorAll('#layers-list .layer-row').length === 1, { timeout: 5000 });
  check('網頁:新增文字 → 1 圖層', (await page.locator('#layers-list .layer-row').count()) === 1);

  // 3. 設文字內容
  const contentArea = page.locator('#props-body textarea[data-k="content"]');
  await contentArea.fill('WEB-EDITED-TEXT');
  await contentArea.dispatchEvent('change');
  await page.waitForTimeout(150);

  // 4. 綁定成變數 msg
  await page.locator('#props-body input[data-bind-toggle]').check();
  await page.waitForTimeout(150);
  const varInput = page.locator('#props-body input[data-bind-var]');
  await varInput.fill('msg');
  await varInput.dispatchEvent('change');
  await page.waitForTimeout(150);

  // 5. 存檔(#save-btn → ✓)
  await page.locator('#save-btn').click();
  await page.waitForFunction(() => document.querySelector('#save-btn').textContent.includes('✓'), { timeout: 5000 });

  const tpl = path.join(work, 'templates', 'web2cli.template.json');
  check('網頁:存檔寫出模板檔', existsSync(tpl));
  const saved = JSON.parse(readFileSync(tpl, 'utf8'));
  check(
    '模板含文字內容 + msg→content 綁定',
    saved.elements.some((e) => e.type === 'text' && e.content === 'WEB-EDITED-TEXT') &&
      saved.bindings.some((b) => b.var === 'msg' && b.prop === 'content' && b.type === 'text'),
    JSON.stringify(saved.bindings),
  );

  // 6. CLI:對網頁存出的模板套不同資料 render
  const dataA = path.join(work, 'a.yaml');
  const dataB = path.join(work, 'b.yaml');
  writeFileSync(dataA, 'msg: FROM-CLI-DATA\n'); // 提供變數值
  writeFileSync(dataB, '{}\n'); // 不給 → 沿用設計時值(WEB-EDITED-TEXT)
  const outA = path.join(work, 'a.png');
  const outB = path.join(work, 'b.png');
  const render = (data, out) => {
    try {
      execFileSync(process.execPath, [CLI, 'render', tpl, data, '-o', out, '--dir', work], { stdio: 'ignore' });
      return 0;
    } catch {
      return 1;
    }
  };
  check('CLI render(套 msg 資料)exit 0 + 產出 PNG', render(dataA, outA) === 0 && existsSync(outA));
  check('CLI render(空資料,沿用設計值)exit 0 + 產出 PNG', render(dataB, outB) === 0 && existsSync(outB));

  // 7. 變數注入確實改變輸出:FROM-CLI-DATA vs WEB-EDITED-TEXT → 不同像素 → 不同 PNG 位元組
  const a = readFileSync(outA);
  const b = readFileSync(outB);
  check('變數注入改變出圖(兩份 PNG 內容不同)', !a.equals(b), `a=${a.length}B b=${b.length}B`);
  check('兩份 PNG 皆非空', a.length > 1000 && b.length > 1000, `a=${a.length} b=${b.length}`);

  check('無 page error', errs.length === 0, errs.join(' | '));
} catch (e) {
  failures++;
  console.error(`FAIL  web→CLI e2e: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}

console.error(failures === 0 ? '\n網頁→CLI 端到端全部通過' : `\n網頁→CLI ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
