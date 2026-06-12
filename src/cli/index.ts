#!/usr/bin/env node
// tedit CLI 入口 — 指令僅三個(D03):ui / render / vars。
// 紀律(D04):stdout 只給產物(render=路徑、vars=表格/JSON),其餘訊息走 stderr;退出碼 0–5。

import { CliError, EXIT } from './shared.js';
import { runRender } from './render.js';
import { runVars } from './vars.js';
import { runUi } from './ui.js';

const USAGE = `用法:
  tedit ui [--port <n>] [--dir <path>] [--no-open]
  tedit render <template> <data> [-o <out.png>] [--scale <n>] [--strict]
  tedit vars <template> [--json]

退出碼:0 成功 / 1 其他錯誤 / 2 參數錯誤 / 3 模板錯誤 / 4 缺變數(--strict) / 5 資產載入失敗`;

interface Parsed {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgv(argv: string[], valueFlags: Set<string>): Parsed {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('-')) {
      if (valueFlags.has(a)) {
        const v = argv[++i];
        if (v === undefined) throw new CliError(EXIT.ARGS, `${a} 缺參數值`);
        flags.set(a, v);
      } else {
        flags.set(a, true);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function parseNumberFlag(p: Parsed, flag: string, fallback: number): number {
  const raw = p.flags.get(flag);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new CliError(EXIT.ARGS, `${flag} 必須是正數:${raw}`);
  return n;
}

function rejectUnknownFlags(p: Parsed, known: string[]): void {
  for (const f of p.flags.keys()) {
    if (!known.includes(f)) throw new CliError(EXIT.ARGS, `未知選項:${f}\n${USAGE}`);
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'ui': {
      const p = parseArgv(rest, new Set(['--port', '--dir']));
      rejectUnknownFlags(p, ['--port', '--dir', '--no-open']);
      if (p.positional.length > 0) throw new CliError(EXIT.ARGS, `ui 不接受位置參數:${p.positional.join(' ')}`);
      runUi({
        port: parseNumberFlag(p, '--port', 5173),
        dir: (p.flags.get('--dir') as string) ?? './',
        open: !p.flags.has('--no-open'),
      });
      return;
    }
    case 'render': {
      const p = parseArgv(rest, new Set(['-o', '--out', '--scale']));
      rejectUnknownFlags(p, ['-o', '--out', '--scale', '--strict']);
      const [template, data, ...extra] = p.positional;
      if (!template || !data) throw new CliError(EXIT.ARGS, `render 需要 <template> 與 <data>\n${USAGE}`);
      if (extra.length > 0) throw new CliError(EXIT.ARGS, `多餘參數:${extra.join(' ')}`);
      await runRender({
        template,
        data,
        out: (p.flags.get('-o') as string) ?? (p.flags.get('--out') as string) ?? './out.png',
        scale: parseNumberFlag(p, '--scale', 1),
        strict: p.flags.has('--strict'),
      });
      return;
    }
    case 'vars': {
      const p = parseArgv(rest, new Set());
      rejectUnknownFlags(p, ['--json']);
      const [template, ...extra] = p.positional;
      if (!template) throw new CliError(EXIT.ARGS, `vars 需要 <template>\n${USAGE}`);
      if (extra.length > 0) throw new CliError(EXIT.ARGS, `多餘參數:${extra.join(' ')}`);
      runVars(template, p.flags.has('--json'));
      return;
    }
    case undefined:
    case '--help':
    case '-h':
      console.error(USAGE);
      process.exit(cmd === undefined ? EXIT.ARGS : EXIT.OK);
      break;
    default:
      throw new CliError(EXIT.ARGS, `未知指令:${cmd}\n${USAGE}`);
  }
}

main().catch((e: unknown) => {
  if (e instanceof CliError) {
    console.error(`tedit: ${e.message}`);
    process.exit(e.code);
  }
  console.error(`tedit: 未預期錯誤:${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(EXIT.OTHER);
});
