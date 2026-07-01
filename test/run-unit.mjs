// core 純函式單元測試(resolver / scanVars / validate)。
// 前置:npm run build(從 dist 匯入編譯產物,與 e2e/e2eCli 一致)。

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const imp = (p) => import(pathToFileURL(path.join(ROOT, 'dist', p)).href);

const { resolveScene, scanVars } = await imp('core/resolver/index.js');
const { validateTemplate } = await imp('core/scene/validate.js');

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.error(`ok    ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

const baseScene = () => ({
  teditVersion: '0.1',
  canvas: { width: 1000, height: 600, background: '#fff' },
  elements: [
    { id: 'h', type: 'text', x: 60, y: 40, width: 880, rotation: 0, content: '設計標題', fontFamily: 'Noto Sans TC', fontSize: 48, color: '#111', align: 'left', lineHeight: 1.3 },
    { id: 'w', type: 'text', x: 60, y: 520, width: 880, rotation: 0, content: '設計標題', fontFamily: 'Noto Sans TC', fontSize: 20, color: '#999', align: 'right', lineHeight: 1.2 },
    { id: 'img', type: 'image', x: 60, y: 120, width: 880, height: 360, rotation: 0, src: 'assets/images/a.png', fit: 'cover' },
  ],
  bindings: [
    { var: 'title', element: 'h', prop: 'content', type: 'text' },
    { var: 'title', element: 'w', prop: 'content', type: 'text' },
    { var: 'photo', element: 'img', prop: 'src', type: 'image' },
  ],
});

// 1. 完整注入:同名變數綁多處皆生效
{
  const scene = baseScene();
  const r = resolveScene(scene, { title: '新標題', photo: 'assets/images/b.png' });
  check('同名變數注入到兩處 text', r.scene.elements[0].content === '新標題' && r.scene.elements[1].content === '新標題');
  check('image src 注入', r.scene.elements[2].src === 'assets/images/b.png');
  check('無缺變數', r.missing.length === 0);
}

// 2. 純函式:不改動輸入
{
  const scene = baseScene();
  const snapshot = JSON.stringify(scene);
  resolveScene(scene, { title: 'X', photo: 'y.png' });
  check('輸入 scene 未被改動(純函式)', JSON.stringify(scene) === snapshot);
}

// 3. 版面不變:只有 content/src 改,其餘欄位逐一相等(M3 DoD「版面不變」)
{
  const scene = baseScene();
  const r = resolveScene(scene, { title: '長度完全不同的全新標題內容', photo: 'assets/images/zzz.png' });
  for (const i of [0, 1, 2]) {
    const a = scene.elements[i], b = r.scene.elements[i];
    const layoutSame = a.x === b.x && a.y === b.y && a.width === b.width && a.rotation === b.rotation;
    check(`元素[${i}] 版面欄位不變`, layoutSame, JSON.stringify(b));
  }
  check('text 樣式欄位不變', r.scene.elements[0].fontSize === 48 && r.scene.elements[0].align === 'left');
  check('image fit 不變', r.scene.elements[2].fit === 'cover');
}

// 4. 缺變數:沿用設計時值 + warning + missing 列入(D05)
{
  const scene = baseScene();
  const r = resolveScene(scene, { title: '有標題' });
  check('缺 photo → src 沿用設計時值', r.scene.elements[2].src === 'assets/images/a.png');
  check('missing 含 photo', r.missing.includes('photo') && r.missing.length === 1);
  check('warning 提及 photo', r.warnings.some((w) => w.includes('photo')));
}

// 5. 缺變數去重:同名變數綁兩處只報一次
{
  const scene = baseScene();
  const r = resolveScene(scene, {});
  check('title 缺值只列一次', r.missing.filter((v) => v === 'title').length === 1);
  check('missing = [title, photo]', r.missing.length === 2);
}

// 6. 多餘資料鍵 → warning(不影響輸出)
{
  const scene = baseScene();
  const r = resolveScene(scene, { title: 'A', photo: 'p.png', extra: 'ignored' });
  check('多餘鍵 extra → warning', r.warnings.some((w) => w.includes('extra')));
}

// 7. scanVars:同名聚合 + 多 location
{
  const entries = scanVars(baseScene());
  check('scanVars 聚合成 2 變數', entries.length === 2);
  const title = entries.find((e) => e.var === 'title');
  check('title 有 2 個綁定位置', title.locations.length === 2);
  check('title 型別 text、設計時值帶出', title.type === 'text' && title.locations[0].designValue === '設計標題');
  const photo = entries.find((e) => e.var === 'photo');
  check('photo 型別 image', photo.type === 'image' && photo.locations.length === 1);
}

// 8. validate:同名變數型別衝突被拒(S03 驗證規則)
{
  const scene = baseScene();
  scene.bindings.push({ var: 'title', element: 'img', prop: 'src', type: 'image' });
  const res = validateTemplate(scene);
  check('同名變數型別衝突 → 驗證失敗', res.ok === false && res.errors.some((e) => e.message.includes('型別衝突')));
}

// 9. validate:html 元素類型(D22 全圖層階段 1)
{
  const htmlEl = { id: 'h', type: 'html', x: 0, y: 0, width: 400, height: 300, rotation: 0, src: 'assets/html/bg.html' };
  const ok = { teditVersion: '0.1', canvas: { width: 800, height: 600, background: '#fff' }, elements: [htmlEl], bindings: [] };
  check('html 元素合法 → 通過', validateTemplate(ok).ok === true);

  const noSrc = structuredClone(ok);
  delete noSrc.elements[0].src;
  const r1 = validateTemplate(noSrc);
  check('html 缺 src → 失敗', r1.ok === false && r1.errors.some((e) => e.path.includes('src')));

  const badField = structuredClone(ok);
  badField.elements[0].fill = '#000';
  const r2 = validateTemplate(badField);
  check('html 多出未知欄位 → 失敗(嚴格)', r2.ok === false && r2.errors.some((e) => e.path.includes('fill')));

  const noH = structuredClone(ok);
  delete noH.elements[0].height;
  check('html 缺 height → 失敗', validateTemplate(noH).ok === false);
}

// 10. validate:text.fontWeight(PR1 字重,選填 100..900)
{
  const withWeight = structuredClone(baseScene());
  withWeight.elements[0].fontWeight = 700;
  check('text.fontWeight=700 → 通過', validateTemplate(withWeight).ok === true);

  const noWeight = structuredClone(baseScene());
  check('text 省略 fontWeight → 通過(選填)', validateTemplate(noWeight).ok === true);

  for (const bad of [99, 901, 'bold', null]) {
    const b = structuredClone(baseScene());
    b.elements[0].fontWeight = bad;
    const r = validateTemplate(b);
    check(`text.fontWeight=${JSON.stringify(bad)} → 失敗`, r.ok === false && r.errors.some((e) => e.path.includes('fontWeight')));
  }
}

// 11. buildFontRegistry:同 family 多字重(PR1 不打包、使用者自帶 Bold)
{
  const { buildFontRegistry, BUILTIN_FONTS } = await imp('core/project.js');
  const builtin = BUILTIN_FONTS[0].family;

  const base = buildFontRegistry({ fonts: [] });
  check('內建字進註冊表(family→[{url,weight}])', Array.isArray(base[builtin]) && base[builtin].some((s) => s.weight === 400));

  const withBold = buildFontRegistry({ fonts: [{ family: builtin, file: 'fonts/Bold.woff2', weight: 700 }] });
  const weights = withBold[builtin].map((s) => s.weight).sort();
  check('自帶 Bold 700 → 同 family 追加字重', weights.includes(400) && weights.includes(700));
  check('Bold URL = /相對路徑', withBold[builtin].find((s) => s.weight === 700).url === '/fonts/Bold.woff2');

  const override = buildFontRegistry({ fonts: [{ family: builtin, file: 'fonts/MyRegular.woff2' }] });
  check('同 (family,weight) 專案覆蓋內建', override[builtin].filter((s) => s.weight === 400).length === 1 && override[builtin][0].url === '/fonts/MyRegular.woff2');
}

// 12. validate:text.runs(PR2 逐字樣式,選填)
{
  const ok = structuredClone(baseScene());
  ok.elements[0].runs = [{ start: 0, end: 2, color: '#7c3aed' }, { start: 2, end: 4, fontWeight: 700 }];
  check('runs 合法(color / fontWeight 各一)→ 通過', validateTemplate(ok).ok === true);

  const bads = [
    ['start 負數', [{ start: -1, end: 2, color: '#000' }], 'start'],
    ['end <= start', [{ start: 2, end: 2, color: '#000' }], 'end'],
    ['end 超出 content 長度', [{ start: 0, end: 99, color: '#000' }], 'end'],
    ['fontWeight 越界', [{ start: 0, end: 1, fontWeight: 950 }], 'fontWeight'],
    ['color 與 fontWeight 都缺', [{ start: 0, end: 1 }], 'runs[0]'],
    ['未知欄位', [{ start: 0, end: 1, color: '#000', italic: true }], 'italic'],
  ];
  for (const [label, runs, needlePath] of bads) {
    const b = structuredClone(baseScene());
    b.elements[0].runs = runs;
    const r = validateTemplate(b);
    check(`runs ${label} → 失敗`, r.ok === false && r.errors.some((e) => e.path.includes(needlePath)));
  }
}

// 13. resolver:content 被綁定覆蓋 → runs 丟棄;缺變數沿用設計值 → runs 保留(PR2 政策)
{
  const scene = baseScene();
  scene.elements[0].runs = [{ start: 0, end: 2, color: '#7c3aed' }];
  const injected = resolveScene(scene, { title: '新標題', photo: 'b.png' });
  check('content 被覆蓋 → runs 丟棄', injected.scene.elements[0].runs === undefined);
  check('resolver 純函式:輸入 runs 未被改動', Array.isArray(scene.elements[0].runs));

  const scene2 = baseScene();
  scene2.elements[0].runs = [{ start: 0, end: 2, color: '#7c3aed' }];
  const fallback = resolveScene(scene2, { photo: 'b.png' }); // title 缺 → 沿用設計值
  check('content 缺變數沿用設計值 → runs 保留', Array.isArray(fallback.scene.elements[0].runs));
}

console.error(failures === 0 ? '\n單元測試全部通過' : `\n單元測試 ${failures} 項失敗`);
process.exit(failures === 0 ? 0 : 1);
