// SPIKE 主持人:打包合成器 → 服務 spike/ → Playwright 渲染兩次 → pixelmatch。
// 成功 = 兩次獨立渲染的 #stage 截圖 diff=0(證明圖層合成可重現 = 同像素守得住),
// 並輸出一張證據圖讓人眼確認 iframe 夾在矩形與文字之間。

import { build } from 'esbuild';
import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const SPIKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4521;

await mkdir(path.join(SPIKE_DIR, 'out'), { recursive: true });
console.error('building compositor bundle...');
await build({
  entryPoints: [path.join(SPIKE_DIR, 'compositor', 'main.ts')],
  bundle: true,
  outfile: path.join(SPIKE_DIR, 'out', 'compositor.bundle.js'),
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.otf': 'font/otf',
};
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(SPIKE_DIR, urlPath);
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(SPIKE_DIR) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch();
async function renderOnce(tag) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/compositor/index.html`);
  await page.waitForFunction(() => window.__renderDone === true, { timeout: 15000 });
  const buf = await page.locator('#stage').screenshot();
  await writeFile(path.join(SPIKE_DIR, 'out', `compositor-${tag}.png`), buf);
  await page.close();
  return { buf, errs };
}

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.error(`ok    ${name}`);
  else { failures++; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

try {
  const a = await renderOnce('A');
  const b = await renderOnce('B');
  check('A 無 page error', a.errs.length === 0, a.errs.join(' | '));
  check('B 無 page error', b.errs.length === 0, b.errs.join(' | '));

  const pa = PNG.sync.read(a.buf);
  const pb = PNG.sync.read(b.buf);
  check('兩次渲染尺寸相同', pa.width === pb.width && pa.height === pb.height, `${pa.width}x${pa.height} vs ${pb.width}x${pb.height}`);
  if (pa.width === pb.width && pa.height === pb.height) {
    const diff = new PNG({ width: pa.width, height: pa.height });
    const n = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0 });
    if (n !== 0) await writeFile(path.join(SPIKE_DIR, 'out', 'compositor-diff.png'), PNG.sync.write(diff));
    check('圖層合成可重現 pixelmatch diff=0', n === 0, `diff=${n}`);
  }
  console.error('\n證據圖:spike/out/compositor-A.png(人眼確認 iframe 夾在矩形與文字之間)');
} finally {
  await browser.close();
  server.close();
}

console.error(failures === 0 ? '\nSPIKE 通過 ✅' : `\nSPIKE ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
