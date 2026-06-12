// tedit ui [--port n] [--dir path] [--no-open]
// D01:cli 與 web 互不 import——以子行程啟動 dist/web/server.js,程式碼零依賴。

import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CliError, EXIT } from './shared.js';

export interface UiArgs {
  port: number;
  dir: string;
  open: boolean;
}

export function runUi(args: UiArgs): void {
  const serverJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'server.js');
  if (!existsSync(serverJs)) {
    throw new CliError(EXIT.OTHER, `找不到 server 建置產物:${serverJs}(先跑 npm run build)`);
  }
  const child = spawn(process.execPath, [serverJs, '--port', String(args.port), '--dir', path.resolve(args.dir)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', (code) => process.exit(code ?? 0));

  const url = `http://localhost:${args.port}`;
  console.error(`tedit ui → ${url}(專案夾:${path.resolve(args.dir)})`);
  if (args.open && process.platform === 'darwin') {
    setTimeout(() => spawn('open', [url], { stdio: 'ignore' }), 600);
  }
}
