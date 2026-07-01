// D22 階段 2:多層合成器(view 路徑)的可重現性 + html 圖層驗證。
// 核心斷言:同一場景(shape→html→text 三層交錯)用 compositor 連渲兩次 → pixelmatch diff=0
//   = 編輯器與 headless 都走 compositor 時,同像素(D11)守得住。
// 另:html 圖層確實有畫(移除 html 後畫面不同);compositor vs 舊單 canvas 的等價差異(資訊)。
// 前置:npm run build。

import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const E2E = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(E2E);
const DIST_WEB = path.join(ROOT, 'dist', 'web');
const FIXTURE = path.join(E2E, 'fixtures', 'project');

const FONTS = { 'Noto Sans TC': [{ url: '/assets/fonts/NotoSansTC-Regular.otf', weight: 400 }] };

// 三層交錯場景:矩形(底)→ html iframe(中)→ 文字(頂)
const HTML_SCENE = {
  teditVersion: '0.1',
  canvas: { width: 800, height: 500, background: '#f4f1ea' },
  elements: [
    { id: 'rect1', type: 'shape', shape: 'rect', x: 80, y: 80, width: 560, height: 320,
      rotation: 0, fill: '#1e3a5f', stroke: '#c9a86a', strokeWidth: 6 },
    { id: 'panel', type: 'html', x: 160, y: 130, width: 460, height: 220, rotation: 0,
      src: 'assets/html/panel.html' },
    { id: 'txt1', type: 'text', x: 180, y: 150, width: 420, rotation: 0,
      content: '最上層文字 蓋過 iframe', fontFamily: 'Noto Sans TC', fontSize: 28,
      color: '#ffffff', align: 'left', lineHeight: 1.4 },
  ],
  bindings: [],
};
const NO_HTML_SCENE = { ...HTML_SCENE, elements: HTML_SCENE.elements.filter((e) => e.type !== 'html') };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.otf': 'font/otf' };
function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = urlPath.startsWith('/__tedit/')
      ? path.join(DIST_WEB, urlPath.slice('/__tedit/'.length))
      : path.join(FIXTURE, urlPath);
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ port: server.address().port, close: () => server.close() })));
}

let failures = 0;
const check = (name, ok, detail = '') => { if (ok) console.error(`ok    ${name}`); else { failures++; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); } };

const { port, close } = await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });

async function renderCompositor(scene) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/__tedit/headless.html`);
  await page.evaluate(async ({ scene, fonts }) => {
    await window.teditEngine.renderLayers(document.getElementById('stage'), scene, fonts, '/');
  }, { scene, fonts: FONTS });
  await page.waitForFunction(() => window.__renderDone === true, { timeout: 15000 });
  const buf = await page.locator('#stage').screenshot();
  await page.close();
  return { buf, errs };
}
async function renderSingleCanvas(scene) {
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/__tedit/headless.html`);
  await page.evaluate(async ({ scene, fonts }) => {
    const h = window.teditEngine.boot('view', document.getElementById('stage'));
    await h.loadScene(scene, fonts, '/');
  }, { scene, fonts: FONTS });
  await page.waitForFunction(() => window.__renderDone === true, { timeout: 15000 });
  const buf = await page.locator('#stage').screenshot();
  await page.close();
  return buf;
}
const diffOf = (a, b, name) => {
  const pa = PNG.sync.read(a), pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return -1;
  const out = new PNG({ width: pa.width, height: pa.height });
  const n = pixelmatch(pa.data, pb.data, out.data, pa.width, pa.height, { threshold: 0 });
  if (n !== 0 && name) writeFileSync(path.join(E2E, 'out', name), PNG.sync.write(out));
  return n;
};

try {
  // 1. 可重現:compositor 連渲兩次 → diff=0(含 iframe + sandbox + 跨 document 守門)
  const a = await renderCompositor(HTML_SCENE);
  const b = await renderCompositor(HTML_SCENE);
  check('compositor 無 page error', a.errs.length === 0 && b.errs.length === 0, [...a.errs, ...b.errs].join(' | '));
  check('compositor 三層場景連渲兩次 diff=0(同像素守得住)', diffOf(a.buf, b.buf, 'compositor-repro-diff.png') === 0);

  // 2. html 圖層確實有畫(移除 html 後畫面應不同)
  const noHtml = await renderCompositor(NO_HTML_SCENE);
  const dHtml = diffOf(a.buf, noHtml.buf);
  check('html 圖層確實有畫(有/無 html 畫面不同)', dHtml > 0, `diff=${dHtml}`);

  // 3. 資訊:compositor vs 舊單 canvas(無 html 場景)的等價差異(AA 邊緣可能有微差)
  const single = await renderSingleCanvas(NO_HTML_SCENE);
  const dEquiv = diffOf(noHtml.buf, single, 'compositor-vs-single-diff.png');
  console.error(`info  compositor vs 單 canvas(無 html)diff=${dEquiv}（0=完全等價;>0=AA 邊緣微差,階段4切換時需重設 parity 基準）`);
} finally {
  await browser.close();
  close();
}
console.error(failures === 0 ? '\n合成器階段2 驗證通過 ✅' : `\n合成器階段2 ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
