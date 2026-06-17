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

  // 載入即「符合視窗」:1200px 畫布在 960px 工作區應被縮小(<100%)。先驗自動縮放,
  // 再點百分比回 100%(本測試後續座標數學假設 1:1)。
  const loadedZoom = await page.locator('#zoom-pct').innerText();
  check('載入自動符合視窗(大畫布縮到 <100%)', parseInt(loadedZoom, 10) < 100, `zoom=${loadedZoom}`);
  await page.locator('#zoom-pct').click();
  await page.waitForFunction(() => document.querySelector('#zoom-pct').textContent === '100%', { timeout: 3000 });

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
  const layerCount2 = () => page.locator('#layers-list .layer-row').count();
  const saveAndRead = async () => {
    await page.locator('#save-btn').click();
    await page.waitForFunction(() => document.querySelector('#save-btn').textContent.includes('✓'), { timeout: 5000 });
    return JSON.parse(readFileSync(savedPath, 'utf8'));
  };

  const saved = JSON.parse(readFileSync(savedPath, 'utf8'));
  const img = saved.elements.find((e) => e.id === 'img1');
  check('存檔後 img1 X 右移 ~50', Math.abs(img.x - (640 + 50)) <= 3, `x=${img.x}(原 640)`);
  check('存檔後 img1 Y 下移 ~30', Math.abs(img.y - (80 + 30)) <= 3, `y=${img.y}(原 80)`);

  // 5. history 副本(D10)
  const histDir = path.join(work, '.tedit', 'history');
  const hist = existsSync(histDir) ? readdirSync(histDir).filter((f) => f.startsWith('card.')) : [];
  check('history 寫了一份時間戳副本', hist.length === 1, JSON.stringify(hist));

  // 5a. B2 對齊吸附:把 img1 中心拖到「畫布垂直中線右 2px」→ 應吸附回正中(center==W/2)。
  // 沒吸附時 center 會停在 W/2+2(差 2px),吸附後精準歸零 → ≤1px 即證明吸附生效(zoom=1,screen==design)。
  {
    const W = saved.canvas.width;
    const cxNow = img.x + img.width / 2;
    const cyNow = img.y + img.height / 2;
    await page.mouse.move(stage.x + cxNow, stage.y + cyNow);
    await page.mouse.down();
    await page.mouse.move(stage.x + W / 2 + 2, stage.y + cyNow, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const sSnap = await saveAndRead();
    const im2 = sSnap.elements.find((e) => e.id === 'img1');
    const centerX = im2.x + im2.width / 2;
    check('拖近中線 → 吸附到畫布正中(center==W/2)', Math.abs(centerX - W / 2) <= 1, `centerX=${centerX} W/2=${W / 2}`);
  }

  // 5b. 文字行內編輯(txt1 在最上層,雙擊進編輯態打字)
  await page.mouse.dblclick(stage.x + 300, stage.y + 160);
  await page.waitForTimeout(250);
  await page.keyboard.type('行內編輯OK');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const s5b = await saveAndRead();
  const t = s5b.elements.find((e) => e.id === 'txt1');
  check('文字雙擊行內編輯改變內容', t.content.includes('行內編輯OK'), t.content.slice(0, 40));

  // 6. 屬性編輯(stage 2):改 rect1 寬 → 檔案寬度跟著變(走映射層,非手刻)
  await page.locator('#layers-list .layer-row', { hasText: 'rect1' }).click();
  await page.waitForTimeout(100);
  const widthInput = page.locator('#props-body input[data-k="width"]');
  await widthInput.fill('250');
  await widthInput.dispatchEvent('change');
  await page.waitForTimeout(200);
  const s6 = await saveAndRead();
  check('屬性編輯:rect1 寬改成 250', Math.abs(s6.elements.find((e) => e.id === 'rect1').width - 250) <= 2,
    `width=${s6.elements.find((e) => e.id === 'rect1').width}`);

  // 7. 新增形狀 → 圖層 +1、檔案 4 元素
  await page.locator('#add-shape').click();
  await page.waitForTimeout(200);
  check('新增形狀 → 圖層 4', (await layerCount2()) === 4, `count=${await layerCount2()}`);
  const s7 = await saveAndRead();
  check('新增形狀寫入檔案', s7.elements.length === 4 && s7.elements.some((e) => e.shape === 'rect' && e.id !== 'rect1'));

  // 8. 複製選取 → 圖層 +1
  await page.locator('#dup-btn').click();
  await page.waitForTimeout(200);
  check('複製 → 圖層 5', (await layerCount2()) === 5, `count=${await layerCount2()}`);

  // 9. 刪除選取 → 圖層 -1
  await page.locator('#del-btn').click();
  await page.waitForTimeout(200);
  check('刪除 → 圖層 4', (await layerCount2()) === 4, `count=${await layerCount2()}`);

  // 10. 新增文字(demo 有註冊字體)→ 含 text 元素且可存檔
  await page.locator('#add-text').click();
  await page.waitForTimeout(300);
  const s10 = await saveAndRead();
  check('新增文字寫入檔案', s10.elements.filter((e) => e.type === 'text').length === 2, `texts=${s10.elements.filter((e) => e.type === 'text').length}`);
  check('存出檔案通過 schema(能再 render)', s10.teditVersion === '0.1' && Array.isArray(s10.bindings));

  // 11. 綁定 UI(stage 3):選 txt1(card 範本本來就綁 title)→ 改變數名 → 角標 + bindings 更新
  await page.locator('#layers-list .layer-row', { hasText: 'txt1' }).click();
  await page.waitForTimeout(150);
  const toggle = page.locator('#props-body input[data-bind-toggle]');
  check('txt1 綁定開關預設為開(範本已綁)', await toggle.isChecked());
  const varInput = page.locator('#props-body input[data-bind-var]');
  await varInput.fill('myTitle');
  await varInput.dispatchEvent('change');
  await page.waitForTimeout(200);
  const badge = page.locator('#badge-layer .badge', { hasText: 'myTitle' });
  check('綁定後畫布出現角標 {myTitle}', (await badge.count()) === 1);
  const s11 = await saveAndRead();
  const bind = s11.bindings.find((b) => b.element === 'txt1');
  check('bindings 寫入 txt1.content=myTitle(text)', !!bind && bind.var === 'myTitle' && bind.prop === 'content' && bind.type === 'text', JSON.stringify(bind));

  // 12. 取消綁定 → txt1 的 bindings 移除、{myTitle} 角標消失(photo 角標仍在)
  await page.locator('#props-body input[data-bind-toggle]').uncheck();
  await page.waitForTimeout(200);
  check('取消綁定後 {myTitle} 角標消失', (await page.locator('#badge-layer .badge', { hasText: 'myTitle' }).count()) === 0);
  const s12 = await saveAndRead();
  check('bindings 已移除 txt1(photo 綁定保留)', !s12.bindings.some((b) => b.element === 'txt1') && s12.bindings.some((b) => b.element === 'img1'));

  // 13. D22:新增 html 圖層(佔位框)→ 屬性面板貼代碼 → 存檔含 inline html(可再 CLI render)
  const beforeHtml = await layerCount2();
  await page.locator('#add-html').click();
  await page.waitForTimeout(200);
  check('新增 html 圖層 → 圖層 +1', (await layerCount2()) === beforeHtml + 1, `count=${await layerCount2()}`);
  // 新增後自動選取 html;屬性面板出現「貼上整段」textarea
  const htmlArea = page.locator('#props-body textarea[data-k="html"]');
  check('html 屬性面板出現貼上框', (await htmlArea.count()) === 1);
  await htmlArea.fill('<div style="background:#0a0">PASTED-HTML</div>');
  await htmlArea.dispatchEvent('change');
  await page.waitForTimeout(200);
  const s13 = await saveAndRead();
  const h = s13.elements.find((e) => e.type === 'html');
  check('存檔含 html 元素且帶 inline 代碼', !!h && typeof h.html === 'string' && h.html.includes('PASTED-HTML'), JSON.stringify(h && { type: h.type, hasHtml: !!h.html }));
  check('html 元素有正確 box 欄位', !!h && [h.x, h.y, h.width, h.height].every((v) => typeof v === 'number'));

  // 14. 含 html 的存檔模板 → CLI 直接 render(端到端)
  {
    const cliOut = path.join(work, 'editor-html.png');
    const { execFileSync } = await import('node:child_process');
    let code = 0;
    try {
      execFileSync(process.execPath, [
        path.join(ROOT, 'dist', 'cli', 'index.js'), 'render',
        path.join(work, 'templates', 'card.template.json'),
        path.join(work, 'data', 'empty.yaml'), '-o', cliOut,
      ], { stdio: 'ignore' });
    } catch { code = 1; }
    check('編輯器存出(含 html)的模板 → CLI render exit 0', code === 0 && existsSync(cliOut));
  }

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
