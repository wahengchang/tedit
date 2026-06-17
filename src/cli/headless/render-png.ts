// headless 出圖(D06/D11):臨時 http server(專案夾 / + dist/web /__tedit/)
// → Playwright Chromium 載 headless.html(與編輯器同一 engine bundle)
// → loadScene 守門完成 → #stage 元素截圖。deviceScaleFactor = scale(D11 環境保證)。

import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Template } from '../../core/scene/types.js';

const DIST_WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function serveFile(res: http.ServerResponse, file: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function startServer(projectDir: string): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (urlPath.startsWith('/__tedit/')) {
      const file = path.join(DIST_WEB, urlPath.slice('/__tedit/'.length));
      if (!file.startsWith(DIST_WEB)) {
        res.writeHead(403);
        res.end();
        return;
      }
      serveFile(res, file);
      return;
    }
    const file = path.join(projectDir, urlPath);
    if (!file.startsWith(path.resolve(projectDir))) {
      res.writeHead(403);
      res.end();
      return;
    }
    serveFile(res, file);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ port: typeof addr === 'object' && addr ? addr.port : 0, close: () => server.close() });
    });
  });
}

export class AssetLoadError extends Error {}

export interface RenderOptions {
  scene: Template;
  /** 專案根(資產 URL 的根) */
  projectDir: string;
  /** family → 專案內相對路徑 */
  fontRegistry: Record<string, string>;
  /** 輸出倍率 = deviceScaleFactor */
  scale: number;
}

export async function renderScenePng(opts: RenderOptions): Promise<Buffer> {
  const { port, close } = await startServer(path.resolve(opts.projectDir));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: {
        width: Math.max(opts.scene.canvas.width, 100),
        height: Math.max(opts.scene.canvas.height, 100),
      },
      deviceScaleFactor: opts.scale,
    });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/__tedit/headless.html`);

    // fontRegistry 已是可直接使用的 URL(專案字體 /…、內建字 /__tedit/fonts/…)
    try {
      await page.evaluate(
        async ({ scene, fonts }) => {
          // D22 階段 3:headless 出圖改走多層合成器(支援 html 層;非-html 與舊單 canvas 同像素)
          await window.teditEngine.renderLayers(document.getElementById('stage')!, scene, fonts, '/');
        },
        { scene: opts.scene, fonts: opts.fontRegistry },
      );
    } catch (e) {
      // 守門內失敗 = 字體/圖片載入問題 → exit 5 類
      throw new AssetLoadError(e instanceof Error ? e.message : String(e));
    }
    await page.waitForFunction(() => window.__renderDone === true);
    // I2:HTML/JS 圖層可拓網路 → 截圖前等網路閒置(bounded,逾時不卡死)
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    // omitBackground:畫布背景為 transparent 時輸出去背 PNG;實色背景已填滿故不受影響(E5)
    const buf = await page.locator('#stage').screenshot({ omitBackground: true });
    return Buffer.from(buf);
  } finally {
    await browser.close();
    close();
  }
}
