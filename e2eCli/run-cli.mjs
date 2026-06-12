// e2eCli 情境測試(D03/D04/D09):退出碼、stdout/stderr 紀律、vars 輸出。
// 前置:npm run build。沿 chainq harness 風格:每情境一斷言組,失敗即列出。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, 'dist', 'cli', 'index.js');
const DEMO = path.join(ROOT, 'examples', 'demo');
const TPL = path.join(DEMO, 'templates', 'card.template.json');
const DATA = path.join(DEMO, 'data', 'sample.yaml');

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.error(`ok    ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function cli(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const work = mkdtempSync(path.join(tmpdir(), 'tedit-e2ecli-'));

// 1. render 成功:exit 0、stdout 僅一行絕對路徑、PNG 落地且尺寸正確
{
  const out = path.join(work, 'out.png');
  const r = await cli(['render', TPL, DATA, '-o', out]);
  check('render 成功 exit 0', r.code === 0, `code=${r.code} stderr=${r.stderr.slice(0, 200)}`);
  const lines = r.stdout.split('\n').filter(Boolean);
  check('stdout 僅一行絕對路徑', lines.length === 1 && lines[0] === path.resolve(out), JSON.stringify(lines));
  check('PNG 檔案存在', existsSync(out));
  if (existsSync(out)) {
    const png = PNG.sync.read(readFileSync(out));
    check('PNG 尺寸 = 畫布 1200x630', png.width === 1200 && png.height === 630, `${png.width}x${png.height}`);
  }
}

// 2. --scale 2 → 2400x1260
{
  const out = path.join(work, 'out@2x.png');
  const r = await cli(['render', TPL, DATA, '-o', out, '--scale', '2']);
  check('--scale 2 exit 0', r.code === 0);
  if (existsSync(out)) {
    const png = PNG.sync.read(readFileSync(out));
    check('--scale 2 尺寸 2400x1260', png.width === 2400 && png.height === 1260, `${png.width}x${png.height}`);
  }
}

// 3. 模板不存在 → exit 3
{
  const r = await cli(['render', path.join(work, 'no-such.template.json'), DATA]);
  check('模板不存在 → exit 3', r.code === 3, `code=${r.code}`);
  check('  訊息走 stderr、stdout 乾淨', r.stdout === '' && r.stderr.includes('模板'), '');
}

// 4. schema 驗證失敗 → exit 3,錯誤訊息定位到元素
{
  const bad = path.join(work, 'bad.template.json');
  const t = JSON.parse(readFileSync(TPL, 'utf8'));
  t.elements[0].width = -5;
  t.elements[0].bogusField = 1;
  writeFileSync(bad, JSON.stringify(t));
  const r = await cli(['render', bad, DATA]);
  check('schema 失敗 → exit 3', r.code === 3, `code=${r.code}`);
  check('  錯誤定位到元素 id+欄位', r.stderr.includes('rect1') && r.stderr.includes('bogusField'), r.stderr.slice(0, 200));
}

// 5. 未知選項 / 無指令 → exit 2
{
  const r1 = await cli(['render', TPL, DATA, '--bogus']);
  check('未知選項 → exit 2', r1.code === 2, `code=${r1.code}`);
  const r2 = await cli([]);
  check('無指令 → exit 2', r2.code === 2, `code=${r2.code}`);
}

// 6. 字體未註冊 → exit 5,指名缺哪個
{
  const proj = path.join(work, 'nofont');
  mkdirSync(path.join(proj, 'templates'), { recursive: true });
  copyFileSync(TPL, path.join(proj, 'templates', 'card.template.json'));
  writeFileSync(path.join(proj, 'project.json'), JSON.stringify({ fonts: [] }));
  const r = await cli(['render', path.join(proj, 'templates', 'card.template.json'), DATA]);
  check('字體未註冊 → exit 5', r.code === 5, `code=${r.code}`);
  check('  stderr 指名缺字體', r.stderr.includes('Noto Sans TC'), r.stderr.slice(0, 200));
}

// 7. 資料檔不存在 → exit 1
{
  const r = await cli(['render', TPL, path.join(work, 'no-such.yaml')]);
  check('資料檔不存在 → exit 1', r.code === 1, `code=${r.code}`);
}

// 8. vars:表格含變數;--json 結構正確
{
  const r = await cli(['vars', TPL]);
  check('vars exit 0', r.code === 0);
  check('  表格含 title/photo', r.stdout.includes('title') && r.stdout.includes('photo'), '');
  const rj = await cli(['vars', TPL, '--json']);
  let parsed = null;
  try {
    parsed = JSON.parse(rj.stdout);
  } catch {
    /* 下面斷言會抓 */
  }
  check('  --json 可解析且含 2 變數', Array.isArray(parsed) && parsed.length === 2, rj.stdout.slice(0, 120));
  check(
    '  --json 含綁定位置與設計時值',
    !!parsed && parsed.every((v) => v.locations.every((l) => l.element && l.prop && 'designValue' in l)),
    '',
  );
}

rmSync(work, { recursive: true, force: true });
console.error(failures === 0 ? '\ne2eCli 全部通過' : `\ne2eCli ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
