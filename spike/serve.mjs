// 人工體驗用:打包兩原型 bundle 並常駐服務 spike/(供瀏覽器直接玩)。
// 用法:node spike/serve.mjs [port],預設 4517。
// fabric:  http://localhost:4517/fabric/index.html?mode=edit&demo=1
// konva:   http://localhost:4517/konva/index.html?mode=edit&demo=1

import { build } from 'esbuild';
import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SPIKE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? 4517);

for (const engine of ['fabric', 'konva']) {
  await build({
    entryPoints: [path.join(SPIKE_DIR, engine, 'main.ts')],
    bundle: true,
    outfile: path.join(SPIKE_DIR, 'out', `${engine}.bundle.js`),
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.otf': 'font/otf',
};

http
  .createServer((req, res) => {
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
  })
  .listen(PORT, () => {
    console.error(`spike demo server: http://localhost:${PORT}`);
    console.error(`  fabric → http://localhost:${PORT}/fabric/index.html?mode=edit&demo=1`);
    console.error(`  konva  → http://localhost:${PORT}/konva/index.html?mode=edit&demo=1`);
  });
