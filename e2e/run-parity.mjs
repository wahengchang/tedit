// M1 test-harness(D11/D12 CI 硬指標):
// 對 e2e/samples/ 每份樣本 → 同一 engine bundle 雙路徑(edit 模式 vs view 模式)渲染
//   ① pixelmatch diff 必須 = 0(D11 同像素)
//   ② edit 路徑 save() 與原樣本逐欄位相等(D12 往返)
// 失敗 → exit 1,diff 圖留在 e2e/out/ 供排查。前置:npm run build。

import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(E2E_DIR);
const DIST_WEB = path.join(ROOT, 'dist', 'web');
const FIXTURE = path.join(E2E_DIR, 'fixtures', 'project');
const OUT = path.join(E2E_DIR, 'out');

if (!existsSync(path.join(DIST_WEB, 'engine.bundle.js'))) {
  console.error('缺 dist/web/engine.bundle.js,先跑 npm run build');
  process.exit(1);
}

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
    const file = urlPath.startsWith('/__tedit/')
      ? path.join(DIST_WEB, urlPath.slice('/__tedit/'.length))
      : path.join(FIXTURE, urlPath);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() })),
  );
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
    for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!(k in expected)) out.push(`${basePath}.${k}: 多出欄位`);
      else if (!(k in actual)) out.push(`${basePath}.${k}: 欄位遺失(save 漏存!)`);
      else deepCompare(expected[k], actual[k], `${basePath}.${k}`, out);
    }
    return out;
  }
  if (expected !== actual) out.push(`${basePath}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
  return out;
}

const FONT_URLS = { 'Noto Sans TC': '/assets/fonts/NotoSansTC-Regular.otf' };

async function bootAndLoad(page, port, mode, scene) {
  await page.goto(`http://127.0.0.1:${port}/__tedit/headless.html`);
  await page.evaluate(
    async ({ mode, scene, fonts }) => {
      const handle = window.teditEngine.boot(mode, document.getElementById('stage'));
      window.__handle = handle;
      await handle.loadScene(scene, fonts, '/');
      handle.deselect();
    },
    { mode, scene, fonts: FONT_URLS },
  );
  await page.waitForFunction(() => window.__renderDone === true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

await mkdir(OUT, { recursive: true });
const samples = (await readdir(path.join(E2E_DIR, 'samples'))).filter((f) => f.endsWith('.template.json')).sort();
const { port, close } = await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1300, height: 700 }, deviceScaleFactor: 1 });

let failures = 0;
for (const sample of samples) {
  const name = sample.replace(/\.template\.json$/, '');
  const scene = JSON.parse(await readFile(path.join(E2E_DIR, 'samples', sample), 'utf8'));

  const editPage = await ctx.newPage();
  const viewPage = await ctx.newPage();
  const errors = [];
  editPage.on('pageerror', (e) => errors.push(`edit: ${e.message}`));
  viewPage.on('pageerror', (e) => errors.push(`view: ${e.message}`));

  try {
    await bootAndLoad(editPage, port, 'edit', scene);
    await bootAndLoad(viewPage, port, 'view', scene);

    const shotEdit = await editPage.locator('#stage').screenshot();
    const shotView = await viewPage.locator('#stage').screenshot();

    const a = PNG.sync.read(shotEdit);
    const b = PNG.sync.read(shotView);
    let diffPixels = -1;
    if (a.width === b.width && a.height === b.height) {
      const diff = new PNG({ width: a.width, height: a.height });
      diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
      if (diffPixels !== 0) {
        await writeFile(path.join(OUT, `${name}-edit.png`), shotEdit);
        await writeFile(path.join(OUT, `${name}-view.png`), shotView);
        await writeFile(path.join(OUT, `${name}-diff.png`), PNG.sync.write(diff));
      }
    }

    const saved = await editPage.evaluate(() => window.__handle.saveScene());
    const mismatches = deepCompare(scene, saved);

    const pixelOk = diffPixels === 0;
    const roundtripOk = mismatches.length === 0;
    const errOk = errors.length === 0;
    if (pixelOk && roundtripOk && errOk) {
      console.error(`ok    ${name}(diff=0,往返=相等)`);
    } else {
      failures++;
      console.error(`FAIL  ${name}: pixelDiff=${diffPixels} 往返誤差=${mismatches.length} pageErrors=${errors.length}`);
      for (const m of mismatches.slice(0, 10)) console.error(`        ${m}`);
      for (const e of errors.slice(0, 3)) console.error(`        ${e}`);
    }
  } catch (e) {
    failures++;
    console.error(`FAIL  ${name}: ${e.message}`);
  } finally {
    await editPage.close();
    await viewPage.close();
  }
}

await browser.close();
close();
console.error(failures === 0 ? `\n全部通過(${samples.length} 樣本)` : `\n${failures}/${samples.length} 樣本失敗`);
process.exit(failures === 0 ? 0 : 1);
