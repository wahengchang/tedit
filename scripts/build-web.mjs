// 產出 dist/web/:
//   engine.bundle.js — 編輯器頁與 headless 頁共用(D06/D11 同像素結構保證)
//   editor.bundle.js — 編輯器前端(M4;只透過 window.teditEngine 與引擎溝通)
//   + 靜態頁面
import { build } from 'esbuild';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'dist', 'web');

await mkdir(OUT, { recursive: true });
await build({
  entryPoints: [path.join(ROOT, 'src', 'core', 'engine', 'browser-entry.ts')],
  bundle: true,
  outfile: path.join(OUT, 'engine.bundle.js'),
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
await build({
  entryPoints: [path.join(ROOT, 'src', 'web', 'ui', 'editor.ts')],
  bundle: true,
  outfile: path.join(OUT, 'editor.bundle.js'),
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const pagesDir = path.join(ROOT, 'src', 'web', 'ui');
for (const f of await readdir(pagesDir)) {
  if (f.endsWith('.html')) await copyFile(path.join(pagesDir, f), path.join(OUT, f));
}

// 內建字體(D19):vendor/fonts → dist/web/fonts(經 /__tedit/fonts 提供)
const vendorFonts = path.join(ROOT, 'vendor', 'fonts');
const outFonts = path.join(OUT, 'fonts');
await mkdir(outFonts, { recursive: true });
for (const f of await readdir(vendorFonts)) {
  await copyFile(path.join(vendorFonts, f), path.join(outFonts, f));
}

console.error(`built ${path.relative(ROOT, OUT)}`);
