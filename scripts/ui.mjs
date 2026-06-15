// 編輯器啟動器:起 server + 開瀏覽器,Ctrl+C 結束。
// 用法(經 npm):
//   npm run ui                      # 用目前資料夾當專案
//   npm run ui -- examples/demo     # 指定專案資料夾
//   npm run ui -- ./path --port 5174 --no-open
//   npm run ui:demo                 # 捷徑 = examples/demo
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'dist', 'web', 'server.js');

const args = process.argv.slice(2);
let dir = '.';
let port = '5173';
let open = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port') port = args[++i];
  else if (a === '--no-open') open = false;
  else if (!a.startsWith('-')) dir = a;
}

const projectDir = path.resolve(dir);
if (!existsSync(SERVER)) {
  console.error('缺 dist/ — 請先執行 npm run build');
  process.exit(1);
}
if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
  console.error(`專案資料夾不存在:${projectDir}`);
  process.exit(1);
}

const child = spawn(process.execPath, [SERVER, '--port', port, '--dir', projectDir], { stdio: 'inherit' });
const url = `http://localhost:${port}`;
console.error(`\n  tedit 編輯器 → ${url}\n  專案資料夾   → ${projectDir}\n  (Ctrl+C 結束)\n`);
if (open && process.platform === 'darwin') {
  setTimeout(() => spawn('open', [url], { stdio: 'ignore' }), 800);
}

const bye = () => {
  child.kill();
  process.exit(0);
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
child.on('exit', (code) => process.exit(code ?? 0));
