// tedit ui 薄後端:靜態服務(editor 頁 + engine bundle + 專案資產)+ 模板讀寫 REST。
// 由 cli/ui.ts 以子行程啟動(D01:cli 與 web 程式碼互不依賴)。
// 存檔走 D10:每次 PUT 同步寫 .tedit/history/<名>.<時間戳>.json 全量副本。

import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateTemplate } from '../core/scene/validate.js';
import { parseProjectConfig, DEFAULT_PROJECT } from '../core/project.js';

const DIST_WEB = path.dirname(fileURLToPath(import.meta.url));
// CLI 進入點(D01:web 不 import cli 程式碼,改以子行程呼叫,出圖管線與 CLI 完全一致)
const CLI_ENTRY = path.join(DIST_WEB, '..', 'cli', 'index.js');

// ---- argv ----
const argv = process.argv.slice(2);
function flagValue(name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
}
const PORT = Number(flagValue('--port', '5173'));
const PROJECT_DIR = path.resolve(flagValue('--dir', './'));

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

function send(res: http.ServerResponse, status: number, body: string | Buffer, type = 'application/json'): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

function sendFile(res: http.ServerResponse, file: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) {
    send(res, 404, JSON.stringify({ error: 'not found' }));
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function historyTimestamp(d = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string): Promise<void> {
  // GET /api/project
  if (urlPath === '/api/project' && req.method === 'GET') {
    const pj = path.join(PROJECT_DIR, 'project.json');
    if (!existsSync(pj)) {
      send(res, 200, JSON.stringify(DEFAULT_PROJECT));
      return;
    }
    const { config, error } = parseProjectConfig(JSON.parse(await readFile(pj, 'utf8')));
    if (!config) {
      send(res, 500, JSON.stringify({ error }));
      return;
    }
    send(res, 200, JSON.stringify(config));
    return;
  }

  // D23:單一 template.json(無列表、無名字定址)
  const TEMPLATE_FILE = path.join(PROJECT_DIR, 'template.json');
  const HIST_DIR = path.join(PROJECT_DIR, '.tedit', 'history');

  // GET /api/template/history(Save modal 列歷史副本;唯讀,D10 寫入不變)
  if (urlPath === '/api/template/history' && req.method === 'GET') {
    const stamps = existsSync(HIST_DIR)
      ? (await readdir(HIST_DIR))
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length))
          .sort()
          .reverse() // 最新在上(時間戳字典序 = 時間序)
      : [];
    send(res, 200, JSON.stringify(stamps));
    return;
  }

  // GET / PUT /api/template — 該專案夾的唯一模板
  if (urlPath === '/api/template') {
    if (req.method === 'GET') {
      // 不存在 → 404,讓編輯器以空白模板開新(首存即建檔)
      sendFile(res, TEMPLATE_FILE);
      return;
    }
    if (req.method === 'PUT') {
      let parsed: unknown;
      try {
        parsed = JSON.parse((await readBody(req)).toString('utf8'));
      } catch {
        send(res, 400, JSON.stringify({ error: 'body 不是合法 JSON' }));
        return;
      }
      const result = validateTemplate(parsed);
      if (!result.ok) {
        send(res, 400, JSON.stringify({ error: 'schema 驗證失敗', details: result.errors }));
        return;
      }
      const body = JSON.stringify(parsed, null, 2) + '\n';
      await writeFile(TEMPLATE_FILE, body);
      // D10 history 快照:全量副本、不清理不去重(單模板 → 檔名僅時間戳)
      await mkdir(HIST_DIR, { recursive: true });
      await writeFile(path.join(HIST_DIR, `${historyTimestamp()}.json`), body);
      send(res, 200, JSON.stringify({ ok: true }));
      return;
    }
  }

  // POST /api/assets/images?name=<filename>(D23:存進專案夾 images/)
  if (urlPath === '/api/assets/images' && req.method === 'POST') {
    const name = new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? '';
    if (!/^[\w一-鿿-]+\.(png|jpe?g|webp)$/i.test(name)) {
      send(res, 400, JSON.stringify({ error: '檔名不合法(支援 png/jpg/webp)' }));
      return;
    }
    const dir = path.join(PROJECT_DIR, 'images');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), await readBody(req));
    send(res, 200, JSON.stringify({ path: `images/${name}` }));
    return;
  }

  // POST /api/render → image/png(網頁直接下載出圖;D01:子行程跑 CLI render,管線與 CLI 一致)
  // body: { scene, data?, strict?, scale? }
  if (urlPath === '/api/render' && req.method === 'POST') {
    let body: { scene?: unknown; data?: Record<string, unknown>; strict?: boolean; scale?: number };
    try {
      body = JSON.parse((await readBody(req)).toString('utf8'));
    } catch {
      send(res, 400, JSON.stringify({ error: 'body 不是合法 JSON' }));
      return;
    }
    const result = validateTemplate(body.scene);
    if (!result.ok) {
      send(res, 400, JSON.stringify({ error: 'scene 驗證失敗', details: result.errors }));
      return;
    }
    const scale = Math.min(4, Math.max(1, Math.round(Number(body.scale) || 2)));
    const strict = body.strict === true;
    const data = body.data && typeof body.data === 'object' ? body.data : {};

    // temp 檔放 .tedit(才能讓 CLI 的 locateProject 找到 project.json、資產相對專案根解析)
    const tmpDir = path.join(PROJECT_DIR, '.tedit');
    await mkdir(tmpDir, { recursive: true });
    const stamp = `render-${process.pid}-${historyTimestamp()}-${Math.floor(Math.random() * 1e6)}`;
    const tplFile = path.join(tmpDir, `${stamp}.template.json`);
    const dataFile = path.join(tmpDir, `${stamp}.json`); // JSON 是合法 YAML,CLI 直接吃
    const outFile = path.join(tmpDir, `${stamp}.png`);
    const cleanup = () => Promise.all([rm(tplFile, { force: true }), rm(dataFile, { force: true }), rm(outFile, { force: true })]);
    try {
      await writeFile(tplFile, JSON.stringify(body.scene));
      await writeFile(dataFile, JSON.stringify(data));
      // --dir 明確指定專案根 → 資產/字體相對專案根解析(不靠 locateProject 往上猜,
      // 修正無 project.json 專案會 fallback 到 .tedit/ 導致圖片 404→EncodingError 的 bug)
      const cliArgs = ['render', tplFile, dataFile, '-o', outFile, '--scale', String(scale), '--dir', PROJECT_DIR];
      if (strict) cliArgs.push('--strict');
      const { code, stderr } = await runCli(cliArgs);
      if (code !== 0) {
        // exit 4 = 缺變數(--strict);其餘渲染/資產錯
        send(res, code === 4 ? 422 : 500, JSON.stringify({ error: stderr.trim() || `render exit ${code}`, code }));
        return;
      }
      const png = await readFile(outFile);
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-disposition': 'attachment',
        'content-length': png.length,
      });
      res.end(png);
    } finally {
      await cleanup();
    }
    return;
  }

  send(res, 404, JSON.stringify({ error: 'unknown api' }));
}

/** 以子行程跑 CLI;回傳 exit code 與 stderr(出圖錯誤訊息) */
function runCli(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('error', (e) => resolve({ code: 1, stderr: String(e) }));
    child.on('exit', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, urlPath).catch((e: unknown) => {
      send(res, 500, JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    });
    return;
  }
  if (urlPath === '/' || urlPath === '/index.html') {
    sendFile(res, path.join(DIST_WEB, 'index.html'));
    return;
  }
  if (urlPath.startsWith('/__tedit/')) {
    const file = path.join(DIST_WEB, urlPath.slice('/__tedit/'.length));
    if (!file.startsWith(DIST_WEB)) {
      send(res, 403, JSON.stringify({ error: 'forbidden' }));
      return;
    }
    sendFile(res, file);
    return;
  }
  // 其餘 = 專案夾靜態資產(assets/fonts、assets/images…)
  const file = path.join(PROJECT_DIR, urlPath);
  if (!file.startsWith(PROJECT_DIR)) {
    send(res, 403, JSON.stringify({ error: 'forbidden' }));
    return;
  }
  sendFile(res, file);
});

server.listen(PORT, () => {
  console.error(`tedit server: http://localhost:${PORT}(專案夾 ${PROJECT_DIR})`);
});
