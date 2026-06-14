// M4 編輯器 e2e:啟動真實 server(指向臨時專案副本)→ Playwright 驅動編輯器頁,
// 驗證 載入→圖層列表→選取同步→畫布拖拉→存檔(檔案寫回 + history 副本 + 座標確實改變)。
// 前置:npm run build。

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'dist', 'web', 'server.js');
const PORT = 5199;

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

const work = mkdtempSync(path.join(tmpdir(), 'tedit-editor-'));
cpSync(path.join(ROOT, 'examples', 'demo'), work, { recursive: true });

const server = spawn(process.execPath, [SERVER, '--port', String(PORT), '--dir', work], { stdio: 'ignore' });
let browser;
try {
  await waitServer(PORT);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?template=card`);
  await page.waitForFunction(() => document.querySelectorAll('#layers-list .layer-row').length > 0, { timeout: 10000 });

  // 1. 圖層列表:card 模板有 3 元素
  const layerCount = await page.locator('#layers-list .layer-row').count();
  check('圖層列表載入 3 元素', layerCount === 3, `count=${layerCount}`);

  // 2. 點圖層 → 選取同步(該列高亮 + 屬性面板顯示該元素)
  await page.locator('#layers-list .layer-row', { hasText: 'img1' }).click();
  await page.waitForTimeout(150);
  const selectedText = await page.locator('#layers-list .layer-row.selected').innerText();
  check('點圖層→該列高亮', selectedText.includes('img1'), selectedText);
  const propsText = await page.locator('#props-body').innerText();
  check('屬性面板顯示選取元素', propsText.includes('img1') && propsText.includes('image'), propsText.slice(0, 80));

  // 3. 畫布拖拉:把 img1 往右下移,存檔後檔案座標確實改變
  const stage = await page.locator('#stage').boundingBox();
  // img1 設計座標中心 ≈ (640+240, 80+150) = (880,230)
  const cx = stage.x + 880, cy = stage.y + 230;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy + 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  // 4. 存檔
  await page.locator('#save-btn').click();
  await page.waitForFunction(() => document.querySelector('#save-btn').textContent.includes('✓'), { timeout: 5000 });

  const savedPath = path.join(work, 'templates', 'card.template.json');
  const saved = JSON.parse(readFileSync(savedPath, 'utf8'));
  const img = saved.elements.find((e) => e.id === 'img1');
  check('存檔後 img1 X 右移 ~50', Math.abs(img.x - (640 + 50)) <= 3, `x=${img.x}(原 640)`);
  check('存檔後 img1 Y 下移 ~30', Math.abs(img.y - (80 + 30)) <= 3, `y=${img.y}(原 80)`);

  // 5. history 副本(D10)
  const histDir = path.join(work, '.tedit', 'history');
  const hist = existsSync(histDir) ? readdirSync(histDir).filter((f) => f.startsWith('card.')) : [];
  check('history 寫了一份時間戳副本', hist.length === 1, JSON.stringify(hist));

  check('無 page error', errs.length === 0, errs.join(' | '));
} catch (e) {
  failures++;
  console.error(`FAIL  editor e2e: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}

console.error(failures === 0 ? '\n編輯器 e2e 全部通過' : `\n編輯器 e2e ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
