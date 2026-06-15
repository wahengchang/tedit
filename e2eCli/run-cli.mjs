// e2eCli 情境測試(D03/D04/D09):退出碼、stdout/stderr 紀律、vars 輸出。
// 前置:npm run build。沿 chainq harness 風格:每情境一斷言組,失敗即列出。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFileSync } from 'node:fs';

const run = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, 'dist', 'cli', 'index.js');
const DEMO = path.join(ROOT, 'examples', 'demo');
const TPL = path.join(DEMO, 'templates', 'card.template.json');
const DATA = path.join(DEMO, 'data', 'sample.yaml');
const MULTI = path.join(DEMO, 'templates', 'multibind.template.json');
const DATA_A = path.join(DEMO, 'data', 'a.yaml');
const DATA_B = path.join(DEMO, 'data', 'b.yaml');
const DATA_PARTIAL = path.join(DEMO, 'data', 'partial.yaml');

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

// 6. 字體未註冊且非內建 → exit 5,指名缺哪個
{
  const proj = path.join(work, 'nofont');
  mkdirSync(path.join(proj, 'templates'), { recursive: true });
  const t = JSON.parse(readFileSync(TPL, 'utf8'));
  t.elements.find((e) => e.id === 'txt1').fontFamily = 'GhostFont'; // 既非專案註冊、也非內建
  writeFileSync(path.join(proj, 'templates', 'card.template.json'), JSON.stringify(t));
  writeFileSync(path.join(proj, 'project.json'), JSON.stringify({ fonts: [] }));
  const r = await cli(['render', path.join(proj, 'templates', 'card.template.json'), DATA]);
  check('字體未註冊且非內建 → exit 5', r.code === 5, `code=${r.code}`);
  check('  stderr 指名缺字體 GhostFont', r.stderr.includes('GhostFont'), r.stderr.slice(0, 200));
}

// 6b. 內建字體(D19):專案沒註冊任何字體,但模板用 Noto Sans TC → 走內建,exit 0
{
  const proj = path.join(work, 'builtin-font');
  mkdirSync(path.join(proj, 'templates'), { recursive: true });
  const t = JSON.parse(readFileSync(TPL, 'utf8'));
  t.bindings = []; // 去掉圖片綁定,免得還要備圖
  t.elements = t.elements.filter((e) => e.type !== 'image');
  writeFileSync(path.join(proj, 'templates', 'card.template.json'), JSON.stringify(t));
  writeFileSync(path.join(proj, 'project.json'), JSON.stringify({ fonts: [] }));
  const out = path.join(work, 'builtin.png');
  const r = await cli(['render', path.join(proj, 'templates', 'card.template.json'), path.join(DEMO, 'data', 'empty.yaml'), '-o', out]);
  check('內建 Noto Sans TC 免註冊可出圖 → exit 0', r.code === 0, `code=${r.code} ${r.stderr.slice(0, 200)}`);
  check('  內建字出圖 PNG 落地', existsSync(out));
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

// 9. M3 變數注入:換三份資料、版面不變(同尺寸),內容變→輸出像素不同
{
  const oA = path.join(work, 'm3-a.png');
  const oB = path.join(work, 'm3-b.png');
  const oDesign = path.join(work, 'm3-design.png'); // 空資料 = 全沿用設計時值
  const rA = await cli(['render', MULTI, DATA_A, '-o', oA]);
  const rB = await cli(['render', MULTI, DATA_B, '-o', oB]);
  const rD = await cli(['render', MULTI, path.join(DEMO, 'data', 'empty.yaml'), '-o', oDesign]);
  check('多綁定模板 render A/B/design 皆 exit 0', rA.code === 0 && rB.code === 0 && rD.code === 0,
    `A=${rA.code} B=${rB.code} D=${rD.code} ${rA.stderr.slice(0,150)}`);
  if (existsSync(oA) && existsSync(oB)) {
    const a = PNG.sync.read(readFileSync(oA));
    const b = PNG.sync.read(readFileSync(oB));
    check('  三圖版面不變(尺寸全等)', a.width === b.width && a.height === b.height, `${a.width}x${a.height} vs ${b.width}x${b.height}`);
    if (a.width === b.width && a.height === b.height) {
      const diff = new PNG({ width: a.width, height: a.height });
      const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
      check('  不同標題 → 輸出像素不同(注入生效)', n > 0, `diff=${n}`);
    }
  }
}

// 10. 缺變數預設模式:exit 0 + stderr warning(沿用設計時值,D05)
{
  const out = path.join(work, 'm3-partial.png');
  const r = await cli(['render', MULTI, DATA_PARTIAL, '-o', out]);
  check('缺變數(非 strict)→ exit 0', r.code === 0, `code=${r.code}`);
  check('  stderr 有缺變數 warning', r.stderr.includes('warning') && r.stderr.includes('photo'), r.stderr.slice(0, 200));
  check('  stdout 仍只印路徑', r.stdout.split('\n').filter(Boolean).length === 1);
}

// 11. --strict 缺變數 → exit 4
{
  const out = path.join(work, 'm3-strict.png');
  const r = await cli(['render', MULTI, DATA_PARTIAL, '-o', out, '--strict']);
  check('--strict 缺變數 → exit 4', r.code === 4, `code=${r.code}`);
  check('  指名缺哪個變數', r.stderr.includes('photo'), r.stderr.slice(0, 200));
  check('  未產出 PNG', !existsSync(out));
}

// 12. --strict 資料齊全 → exit 0
{
  const out = path.join(work, 'm3-strict-ok.png');
  const r = await cli(['render', MULTI, DATA_A, '-o', out, '--strict']);
  check('--strict 資料齊全 → exit 0', r.code === 0, `code=${r.code} ${r.stderr.slice(0,150)}`);
}

// 13. 圖片變數指向不存在檔案 → exit 5
{
  const badData = path.join(work, 'bad-photo.yaml');
  writeFileSync(badData, 'title: x\nphoto: ./does-not-exist.png\n');
  const r = await cli(['render', MULTI, badData, '-o', path.join(work, 'x.png')]);
  check('圖片變數檔案不存在 → exit 5', r.code === 5, `code=${r.code}`);
  check('  指名是哪個變數', r.stderr.includes('photo'), r.stderr.slice(0, 200));
}

rmSync(work, { recursive: true, force: true });
console.error(failures === 0 ? '\ne2eCli 全部通過' : `\ne2eCli ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
