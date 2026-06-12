// M0 spike 擂台主持人:對 fabric / konva 兩原型執行 T1–T4,收集評分資料。
// 產物:spike/out/<engine>/*.png(證據圖)、spike/out/report.json、stdout 摘要。

import { build } from 'esbuild';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const SPIKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4517;
// 擂台已收官(S01=fabric):konva 原型目錄已刪,僅保留勝方可重跑驗證。
// 雙引擎完整報告見 docs/decisions/evidence/spike-report.json。
const ENGINES = ['fabric'];

// ---------- build ----------
async function buildBundles() {
  for (const engine of ENGINES) {
    await build({
      entryPoints: [path.join(SPIKE_DIR, engine, 'main.ts')],
      bundle: true,
      outfile: path.join(SPIKE_DIR, 'out', `${engine}.bundle.js`),
      format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    });
  }
}

// ---------- static server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.otf': 'font/otf',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(SPIKE_DIR, urlPath);
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(SPIKE_DIR) || !existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// ---------- helpers ----------
function comparePng(bufA, bufB, diffPath) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height) {
    return { diffPixels: -1, note: `尺寸不同 ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
  if (diffPath) writeFileSyncSafe(diffPath, PNG.sync.write(diff));
  return { diffPixels };
}

function writeFileSyncSafe(p, data) {
  return writeFile(p, data);
}

function deepCompare(expected, actual, basePath = '$', out = []) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(expected - actual) > 1e-6) out.push(`${basePath}: ${expected} → ${actual}`);
    return out;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push(`${basePath}.length: ${expected.length} → ${actual.length}`);
      return out;
    }
    expected.forEach((v, i) => deepCompare(v, actual[i], `${basePath}[${i}]`, out));
    return out;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) {
      if (!(k in expected)) out.push(`${basePath}.${k}: 多出欄位`);
      else if (!(k in actual)) out.push(`${basePath}.${k}: 欄位遺失(save 漏存!)`);
      else deepCompare(expected[k], actual[k], `${basePath}.${k}`, out);
    }
    return out;
  }
  if (expected !== actual) out.push(`${basePath}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
  return out;
}

async function loadScene(page, scene) {
  await page.evaluate(async (s) => {
    await window.proto.load(s);
  }, scene);
  await page.waitForFunction(() => window.__renderDone === true);
  // 雙保險:再等一個 RAF,確保最後一次 draw 已上屏
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function shot(page, outPath) {
  const buf = await page.locator('#stage').screenshot();
  await writeFile(outPath, buf);
  return buf;
}

const el = (scene, id) => scene.elements.find((e) => e.id === id);

// ---------- per-engine run ----------
async function runEngine(browser, engine, scene) {
  const outDir = path.join(SPIKE_DIR, 'out', engine);
  await mkdir(outDir, { recursive: true });
  const report = { engine, tasks: {}, workarounds: [] };

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const editor = await ctx.newPage();
  const viewer = await ctx.newPage();
  const pageErrors = [];
  editor.on('pageerror', (e) => pageErrors.push(`editor: ${e.message}`));
  viewer.on('pageerror', (e) => pageErrors.push(`viewer: ${e.message}`));

  await editor.goto(`http://localhost:${PORT}/${engine}/index.html?mode=edit`);
  await viewer.goto(`http://localhost:${PORT}/${engine}/index.html?mode=view`);

  // ---- T1:載入渲染 + 同像素 + 往返 ----
  await loadScene(editor, scene);
  await editor.evaluate(() => window.proto.deselect());
  const t1Editor = await shot(editor, path.join(outDir, 't1-editor.png'));
  await loadScene(viewer, scene);
  const t1View = await shot(viewer, path.join(outDir, 't1-view.png'));
  const t1Cmp = comparePng(t1Editor, t1View, path.join(outDir, 't1-diff.png'));
  const t1Saved = await editor.evaluate(() => window.proto.save());
  report.tasks.t1 = {
    pixelDiff: t1Cmp.diffPixels,
    roundtripMismatches: deepCompare(scene, t1Saved),
  };

  const stageBox = await editor.locator('#stage').boundingBox();
  const toPage = (x, y) => ({ x: stageBox.x + x, y: stageBox.y + y });

  // ---- T2:拖拉移動矩形 (+150, +90) ----
  // 抓點注意:矩形中心被文字元素(z-order 在上)覆蓋,改抓矩形上緣
  // 未被文字蓋住的帶狀區(y 60–110 之間)。
  {
    const c = toPage(320, 85);
    await editor.mouse.move(c.x, c.y);
    await editor.mouse.down();
    await editor.mouse.move(c.x + 150, c.y + 90, { steps: 20 });
    await editor.mouse.up();
    await editor.evaluate(() => window.proto.deselect());
    const saved = await editor.evaluate(() => window.proto.save());
    const rect = el(saved, 'rect1');
    const txt = el(saved, 'txt1');
    const posOk = Math.abs(rect.x - 210) <= 1 && Math.abs(rect.y - 150) <= 1;
    const textUntouched = txt.x === 100 && txt.y === 110;
    const editorShot = await shot(editor, path.join(outDir, 't2-editor.png'));
    await loadScene(viewer, saved);
    const viewShot = await shot(viewer, path.join(outDir, 't2-view.png'));
    const cmp = comparePng(editorShot, viewShot, path.join(outDir, 't2-diff.png'));
    report.tasks.t2 = {
      savedXY: { x: rect.x, y: rect.y },
      expectedXY: { x: 210, y: 150 },
      posOk,
      textUntouched,
      pixelDiff: cmp.diffPixels,
      reloadRoundtripMismatches: deepCompare(saved, await editor.evaluate(() => window.proto.save())),
    };
  }

  // ---- T3:控制柄縮放圖片(BR 角往內拖,目標 scale 0.75)----
  {
    await editor.evaluate(() => window.proto.selectById('img1'));
    await editor.waitForTimeout(100);
    const br = toPage(640 + 480, 80 + 300);
    await editor.mouse.move(br.x, br.y);
    await editor.mouse.down();
    await editor.mouse.move(br.x - 120, br.y - 75, { steps: 20 });
    await editor.mouse.up();
    await editor.evaluate(() => window.proto.deselect());
    const saved = await editor.evaluate(() => window.proto.save());
    const img = el(saved, 'img1');
    const aspect = img.width / img.height;
    const editorShot = await shot(editor, path.join(outDir, 't3-editor.png'));
    await loadScene(viewer, saved);
    const viewShot = await shot(viewer, path.join(outDir, 't3-view.png'));
    const cmp = comparePng(editorShot, viewShot, path.join(outDir, 't3-diff.png'));
    report.tasks.t3 = {
      savedSize: { width: img.width, height: img.height },
      aspectBefore: 480 / 300,
      aspectAfter: aspect,
      aspectKept: Math.abs(aspect - 480 / 300) / (480 / 300) < 0.005,
      scaledDown: img.width < 480,
      pixelDiff: cmp.diffPixels,
    };
  }

  // ---- T4:雙擊文字進編輯態、打字、存回 ----
  {
    // (140,130) 在文字首行內;T2 後矩形已移到 (210,150),不會擋到
    const p = toPage(140, 130);
    await editor.mouse.dblclick(p.x, p.y);
    await editor.waitForTimeout(150);
    await editor.keyboard.type('【已改】');
    await editor.waitForTimeout(100);
    await shot(editor, path.join(outDir, 't4-editing-state.png'));
    // 點空白處退出編輯態(fabric 退 IText;konva textarea blur→commit)
    await editor.mouse.click(stageBox.x + 1190, stageBox.y + 620);
    await editor.waitForTimeout(150);
    await editor.evaluate(() => window.proto.deselect());
    const saved = await editor.evaluate(() => window.proto.save());
    const txt = el(saved, 'txt1');
    const editorShot = await shot(editor, path.join(outDir, 't4-editor.png'));
    await loadScene(viewer, saved);
    const viewShot = await shot(viewer, path.join(outDir, 't4-view.png'));
    const cmp = comparePng(editorShot, viewShot, path.join(outDir, 't4-diff.png'));
    report.tasks.t4 = {
      contentChanged: txt.content !== el(scene, 'txt1').content,
      containsTyped: txt.content.includes('已改'),
      contentPreview: txt.content.slice(0, 60),
      pixelDiff: cmp.diffPixels,
    };
  }

  report.pageErrors = pageErrors;
  // 行數統計(b 項:映射層單列,長期稅率)
  const loc = (f) => readFileSync(path.join(SPIKE_DIR, engine, f), 'utf8').split('\n').filter((l) => l.trim()).length;
  report.loc = { mapping: loc('mapping.ts'), main: loc('main.ts') };

  await ctx.close();
  return report;
}

// ---------- main ----------
const scene = JSON.parse(await readFile(path.join(SPIKE_DIR, 'spike-scene.template.json'), 'utf8'));
await mkdir(path.join(SPIKE_DIR, 'out'), { recursive: true });
console.error('building bundles...');
await buildBundles();
const server = await startServer();
const browser = await chromium.launch();

const reports = {};
for (const engine of ENGINES) {
  console.error(`running ${engine}...`);
  try {
    reports[engine] = await runEngine(browser, engine, scene);
  } catch (e) {
    reports[engine] = { engine, fatal: String(e && e.stack ? e.stack : e) };
  }
}

await browser.close();
server.close();
await writeFile(path.join(SPIKE_DIR, 'out', 'report.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
