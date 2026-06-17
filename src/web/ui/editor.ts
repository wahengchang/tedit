// 編輯器前端(M4 stage 1+2,vanilla TS / S02、深色 Figma 風 / D20)。
// 與 engine.bundle.js 解耦:只透過 window.teditEngine 的 handle API(不直接 import fabric)。
//
// stage 2 核心做法:所有「結構性變更」(改屬性/增刪/複製/排序)都走
//   saveScene() → 改 schema → loadScene() → 重選
// 復用 M1 已驗證的 load/save 映射,中心 origin↔左上角換算交給映射層,絕不手刻數學。

import type { Template, SceneElement } from '../../core/scene/types.js';
import type { ProjectConfig } from '../../core/project.js';
import { buildFontRegistry, BUILTIN_FONTS } from '../../core/project.js';
import type { EngineHandle } from '../../core/engine/browser-entry.js';
import { scanVars } from '../../core/resolver/index.js';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const TYPE_ICON: Record<string, string> = { text: 'T', image: '▦', shape: '◇', html: '◧' };

let handle: EngineHandle;
let config: ProjectConfig;
let fontReg: Record<string, string> = {};
let templateName = '';
let dirty = false;

// U1:zoom 是純視圖縮放(fabric setZoom);設計尺寸在編輯器恆定。
let zoom = 1;
let designW = 0;
let designH = 0;
const Z_MIN = 0.1;
const Z_MAX = 4;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

function blankScene(c: ProjectConfig): Template {
  const cd = c.canvasDefaults ?? { width: 1200, height: 630, background: '#ffffff' };
  return { teditVersion: '0.1', canvas: { ...cd }, elements: [], bindings: [] };
}

function genId(scene: Template): string {
  const used = new Set(scene.elements.map((e) => e.id));
  let id: string;
  do {
    id = 'el_' + Math.random().toString(36).slice(2, 7);
  } while (used.has(id));
  return id;
}

// scene() = 目前畫布快照。zoom 用 setDimensions(design*zoom) 放大畫布,會讓 save() 讀到
// 放大後的 canvas.width/height;設計尺寸在編輯器恆定,故一律正規化回 design 值
// → 存檔/出圖尺寸不受 zoom 汙染,「所見==出圖」像素一致不破。
const scene = (): Template => {
  const s = handle.saveScene();
  if (designW) {
    s.canvas.width = designW;
    s.canvas.height = designH;
  }
  return s;
};

/** 結構性變更的唯一入口:套用新 scene 並(可選)重選某元素 */
async function commit(next: Template, selectId?: string) {
  await handle.loadScene(next, fontReg, '/');
  applyZoom(); // loadScene 重設 canvas 尺寸 → zoom 要重套
  if (selectId) handle.selectById(selectId);
  markDirty();
  renderAll();
  recordHistory();
}

// ---------- undo / redo(B1:場景快照堆疊;以 JSON 字串去重)----------
let history: string[] = [];
let histIndex = -1;
let restoring = false; // 套用快照中 → 不重複記錄

function recordHistory() {
  if (restoring) return;
  const snap = JSON.stringify(scene());
  if (history[histIndex] === snap) return; // 無實質變化(如純選取)→ 不記
  history = history.slice(0, histIndex + 1); // 砍掉 redo 尾巴
  history.push(snap);
  histIndex = history.length - 1;
  updateHistoryButtons();
}

async function applySnapshot(snap: string) {
  restoring = true;
  const t = JSON.parse(snap) as Template;
  designW = t.canvas.width; // 還原設計尺寸(canvas 尺寸也可能被 undo/redo)
  designH = t.canvas.height;
  await handle.loadScene(t, fontReg, '/');
  applyZoom();
  restoring = false;
  markDirty();
  renderAll();
  updateHistoryButtons();
}

function undo() {
  if (histIndex <= 0) return;
  histIndex--;
  void applySnapshot(history[histIndex]!);
}

function redo() {
  if (histIndex >= history.length - 1) return;
  histIndex++;
  void applySnapshot(history[histIndex]!);
}

function updateHistoryButtons() {
  const u = document.getElementById('undo-btn') as HTMLButtonElement | null;
  const r = document.getElementById('redo-btn') as HTMLButtonElement | null;
  if (u) u.disabled = histIndex <= 0;
  if (r) r.disabled = histIndex >= history.length - 1;
}

async function init() {
  config = await api<ProjectConfig>('/api/project');
  fontReg = buildFontRegistry(config);
  const names = await api<string[]>('/api/templates');
  const wanted = new URLSearchParams(location.search).get('template');

  // U2:無 ?template= → 顯示模板首頁(不啟動引擎,讓使用者選/建模板)
  if (!wanted) {
    await showStartPage(names);
    return;
  }
  templateName = wanted;

  // 已存在 → 載入;不存在(剛從首頁建/直接打網址)→ 空白具名模板,首存即建檔
  const initial = names.includes(templateName)
    ? await api<Template>(`/api/templates/${encodeURIComponent(templateName)}`)
    : blankScene(config);

  designW = initial.canvas.width;
  designH = initial.canvas.height;

  handle = window.teditEngine.boot('edit', $('#stage'));
  await handle.loadScene(initial, fontReg, '/');

  // 綁定角標層(S04:僅 UI 覆蓋,不進場景);#stage position:relative,inset 對齊畫布
  const badgeLayer = document.createElement('div');
  badgeLayer.id = 'badge-layer';
  $('#stage').appendChild(badgeLayer);

  // 載入即「符合視窗」:大畫布(如 1920px)在 100% 會爆出工作區,fitZoom 縮到剛好放得下;
  // fitZoom 上限 100%,小畫布維持 1:1 不被放大。(loadScene 已把 canvas 設成 design)
  fitZoom();

  $('#tpl-name').textContent = templateName;
  $('#status-path').textContent = `templates/${templateName}.template.json`;
  handle.onChange(renderAll);
  // onChange 也在文字行內編輯後觸發 → 標記 dirty
  handle.onChange(() => markDirty());
  // undo/redo:畫布上「拖移結束」「文字編輯結束」也要進歷史(這兩個不走 commit())
  const canvasOn = (handle.canvas as unknown as { on(e: string, cb: () => void): void }).on.bind(handle.canvas);
  canvasOn('object:modified', () => recordHistory());
  canvasOn('text:editing:exited', () => recordHistory());
  recordHistory(); // 種子:初始狀態 = history[0]
  wireToolbar();
  wireProps();
  wireKeyboard();
  wireZoom();
  wireAlignGuides();
  wireModals();
  // 首頁鈕(U2):有未存變更先確認
  $('#home-btn').onclick = () => {
    if (dirty && !confirm('Unsaved changes. Leave and go to home?')) return;
    location.search = '';
  };
  renderAll();
}

function renderAll() {
  renderLayers();
  renderProps();
  renderBadges();
  renderStatus();
  renderVarChip();
  updateHistoryButtons();
  scheduleHtmlPreviews();
}

// ---------- HTML/JS 圖層即時預覽(WYSIWYG)----------
// 把每個 html 圖層送「單元素 + 透明畫布」mini-scene 給 /api/render(子行程跑真出圖引擎,
// 含 allow-scripts/settle/透明)→ 回透明 PNG → 點陣化進佔位框(engine.setHtmlPreview)。
// 內容/尺寸沒變不重畫(hash 略過);改動後 debounce,避免每次選取都重出圖。
let previewTimer: ReturnType<typeof setTimeout> | undefined;
const previewUrls = new Map<string, string>();
const previewHash = new Map<string, string>();

function scheduleHtmlPreviews() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => void refreshHtmlPreviews(), 400);
}

async function refreshHtmlPreviews() {
  const s = scene();
  const liveIds = new Set<string>();
  for (const el of s.elements) {
    if (el.type !== 'html') continue;
    liveIds.add(el.id);
    const w = Math.max(1, Math.round(el.width));
    const h = Math.max(1, Math.round(el.height));
    const key = JSON.stringify([el.html ?? el.src ?? '', w, h]); // 旋轉/位置不影響內容
    if (previewHash.get(el.id) === key) continue; // 內容+尺寸沒變 → 不重出圖
    previewHash.set(el.id, key);
    // 單元素鋪平(rotation/位置歸零;佔位框自身的 angle 會把點陣轉回來)
    const mini: Template = {
      teditVersion: '0.1',
      canvas: { width: w, height: h, background: 'transparent' },
      elements: [{ ...el, x: 0, y: 0, rotation: 0, width: w, height: h }],
      bindings: [],
    };
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene: mini, data: {}, scale: 1 }),
      });
      if (!res.ok) {
        previewHash.delete(el.id); // 失敗 → 下次再試
        continue;
      }
      const url = URL.createObjectURL(await res.blob());
      await handle.setHtmlPreview(el.id, url);
      const old = previewUrls.get(el.id);
      if (old) URL.revokeObjectURL(old);
      previewUrls.set(el.id, url);
    } catch {
      previewHash.delete(el.id); // 預覽失敗不致命
    }
  }
  // 清掉已刪除圖層的快取
  for (const id of [...previewUrls.keys()]) {
    if (liveIds.has(id)) continue;
    const u = previewUrls.get(id);
    if (u) URL.revokeObjectURL(u);
    previewUrls.delete(id);
    previewHash.delete(id);
  }
}

// ---------- zoom(純視圖;座標不變)----------
function applyZoom() {
  const c = handle.canvas;
  c.setZoom(zoom);
  c.setDimensions({ width: designW * zoom, height: designH * zoom });
  const stage = $('#stage');
  stage.style.width = `${designW * zoom}px`;
  stage.style.height = `${designH * zoom}px`;
  stage.style.overflow = 'visible'; // loadScene 設成 hidden;放大後角標/陰影不該被裁
  $('#zoom-pct').textContent = `${Math.round(zoom * 100)}%`;
  $('#status-zoom').textContent = `${Math.round(zoom * 100)}%`;
  renderBadges();
}

function changeZoom(z: number) {
  zoom = Math.min(Z_MAX, Math.max(Z_MIN, z));
  applyZoom();
}

/** 縮放並把游標下的同一個畫布點釘在原位(以滑鼠為錨)。 */
function zoomAt(z: number, clientX: number, clientY: number) {
  const stage = $('#stage');
  const wrap = $('#canvas-wrap');
  const before = stage.getBoundingClientRect();
  // 游標對應的畫布內容座標(design px,與 zoom 無關)
  const cx = (clientX - before.left) / zoom;
  const cy = (clientY - before.top) / zoom;
  changeZoom(z); // 重設 stage 尺寸(可能因置中而位移)→ 讀新 rect 再補回捲動
  const next = Math.min(Z_MAX, Math.max(Z_MIN, z)); // changeZoom 夾過的實際值
  const after = stage.getBoundingClientRect();
  wrap.scrollLeft += after.left + cx * next - clientX;
  wrap.scrollTop += after.top + cy * next - clientY;
}

/** 符合視窗:把整張紙縮到工作區內(不放大超過 100%) */
function fitZoom() {
  const wrap = $('#canvas-wrap');
  const pad = 48;
  const z = Math.min((wrap.clientWidth - pad) / designW, (wrap.clientHeight - pad) / designH);
  changeZoom(Math.min(1, z || 1));
}

function wireZoom() {
  $('#zoom-in').onclick = () => changeZoom(zoom * 1.25);
  $('#zoom-out').onclick = () => changeZoom(zoom / 1.25);
  // 點百分比:非 100% → 回 100%;已是 100% → 符合視窗
  $('#zoom-pct').onclick = () => (Math.abs(zoom - 1) < 0.001 ? fitZoom() : changeZoom(1));

  // 滑鼠滾輪 / 觸控板雙指 → 以游標為錨縮放(deltaY<0 放大)。
  // passive:false 才能 preventDefault 阻止頁面捲動;指數步進讓縮放手感平滑。
  $('#canvas-wrap').addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    },
    { passive: false },
  );
}

// ---------- B2:對齊輔助線 + 吸附(純編輯器;不進場景)----------
// 拖移時把被移動物件的 左/中/右、上/中/下 與「畫布 0/中/邊」及「其他物件的同類線」
// 比對,落在閾值內就吸附並畫出洋紅參考線。座標全在 design 單位算,畫線時用 fabric 的
// viewportTransform 轉成螢幕 px → zoom 自動跟著對。輔助線畫在主 context(每幀重繪不殘留)。
type FObj = { left: number; top: number; width: number; height: number; scaleX: number; scaleY: number; setCoords(): void };
type FCanvas = {
  on(e: string, cb: (opt: { target?: FObj }) => void): void;
  getObjects(): FObj[];
  getContext(): CanvasRenderingContext2D;
  viewportTransform: [number, number, number, number, number, number];
  requestRenderAll(): void;
};
type Cand = { pos: number; a: number; b: number }; // pos=對齊座標;a..b=另一軸延伸範圍(畫線長度)
type Guide = { vertical: boolean; pos: number; a: number; b: number };

function boxOf(o: FObj) {
  const w = o.width * o.scaleX;
  const h = o.height * o.scaleY;
  return { l: o.left - w / 2, cx: o.left, r: o.left + w / 2, t: o.top - h / 2, cy: o.top, b: o.top + h / 2 };
}

/** 在候選線中找與物件三條參考線最近者(<tol);回傳要補的位移 + 命中的候選。 */
function nearestSnap(refs: number[], cands: Cand[], tol: number): { delta: number; cand: Cand } | null {
  let best: { delta: number; cand: Cand } | null = null;
  for (const ref of refs) {
    for (const cand of cands) {
      const d = cand.pos - ref;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, cand };
    }
  }
  return best;
}

function wireAlignGuides() {
  const c = handle.canvas as unknown as FCanvas;
  const SNAP_PX = 6; // 螢幕閾值;÷zoom 換回 design 單位 → 放大時更好對
  let guides: Guide[] = [];

  c.on('object:moving', (opt) => {
    const t = opt.target;
    if (!t) return;
    const tol = SNAP_PX / zoom;
    guides = [];

    // 候選線:畫布 0/中/邊 + 其他每個物件的 左中右 / 上中下
    const vert: Cand[] = [0, designW / 2, designW].map((pos) => ({ pos, a: 0, b: designH }));
    const horz: Cand[] = [0, designH / 2, designH].map((pos) => ({ pos, a: 0, b: designW }));
    for (const o of c.getObjects()) {
      if (o === t) continue;
      const b = boxOf(o);
      vert.push({ pos: b.l, a: b.t, b: b.b }, { pos: b.cx, a: b.t, b: b.b }, { pos: b.r, a: b.t, b: b.b });
      horz.push({ pos: b.t, a: b.l, b: b.r }, { pos: b.cy, a: b.l, b: b.r }, { pos: b.b, a: b.l, b: b.r });
    }

    const bx = boxOf(t);
    const sx = nearestSnap([bx.l, bx.cx, bx.r], vert, tol);
    if (sx) {
      t.left += sx.delta;
      const nb = boxOf(t);
      guides.push({ vertical: true, pos: sx.cand.pos, a: Math.min(nb.t, sx.cand.a), b: Math.max(nb.b, sx.cand.b) });
    }
    const by = boxOf(t);
    const sy = nearestSnap([by.t, by.cy, by.b], horz, tol);
    if (sy) {
      t.top += sy.delta;
      const nb = boxOf(t);
      guides.push({ vertical: false, pos: sy.cand.pos, a: Math.min(nb.l, sy.cand.a), b: Math.max(nb.r, sy.cand.b) });
    }
    t.setCoords();
  });

  const clear = () => {
    if (guides.length) {
      guides = [];
      c.requestRenderAll();
    }
  };
  c.on('object:modified', clear);
  c.on('mouse:up', clear);
  c.on('selection:cleared', clear);

  c.on('after:render', () => {
    if (!guides.length) return;
    const vt = c.viewportTransform;
    const ctx = c.getContext();
    ctx.save();
    ctx.strokeStyle = '#e5358a'; // 洋紅,與選取藍框區隔
    ctx.lineWidth = 1;
    for (const g of guides) {
      ctx.beginPath();
      if (g.vertical) {
        const x = Math.round(g.pos * vt[0] + vt[4]) + 0.5; // +0.5 避免 1px 線糊掉
        ctx.moveTo(x, g.a * vt[3] + vt[5]);
        ctx.lineTo(x, g.b * vt[3] + vt[5]);
      } else {
        const y = Math.round(g.pos * vt[3] + vt[5]) + 0.5;
        ctx.moveTo(g.a * vt[0] + vt[4], y);
        ctx.lineTo(g.b * vt[0] + vt[4], y);
      }
      ctx.stroke();
    }
    ctx.restore();
  });
}

// ---------- 狀態列 ----------
function renderStatus() {
  const el = selectedElement();
  const sel = $('#status-sel');
  if (!el) {
    sel.textContent = 'Nothing selected';
    return;
  }
  const dims = el.type === 'text' ? `W ${Math.round(el.width)}` : `${Math.round(el.width)}×${Math.round(el.height)}`;
  sel.textContent = `Selected: ${el.id} (${el.type}) ${dims} @(${Math.round(el.x)},${Math.round(el.y)})`;
}

// ---------- 變數 chip ----------
function renderVarChip() {
  $('#var-count').textContent = String(scanVars(scene()).length);
}

function markDirty() {
  if (dirty) return;
  dirty = true;
  $('#save-btn').textContent = 'Save *';
}

// ---------- 圖層列表(含拖排改 z-order)----------
let dragId: string | null = null;

function renderLayers() {
  const list = $('#layers-list');
  const selected = handle.selectedId();
  const layers = handle.listLayers().slice().reverse(); // 上而下 = z-order 由高到低
  list.innerHTML = '';
  for (const l of layers) {
    const row = document.createElement('div');
    row.className = 'layer-row' + (l.id === selected ? ' selected' : '');
    row.draggable = true;
    row.dataset.id = l.id;
    row.innerHTML = `<span class="layer-icon">${TYPE_ICON[l.type] ?? '?'}</span><span class="layer-id">${l.id}</span>`;
    row.onclick = () => handle.selectById(l.id);
    row.addEventListener('dragstart', () => (dragId = l.id));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drop-target');
      if (dragId && dragId !== l.id) void reorderLayer(dragId, l.id);
    });
    list.appendChild(row);
  }
  if (layers.length === 0) list.innerHTML = '<div class="empty">(empty canvas)</div>';
}

/** 把 dragId 移到 targetId 在顯示列表中的位置(顯示為 z 高→低,需轉回 elements 的低→高) */
async function reorderLayer(srcId: string, targetId: string) {
  const s = scene();
  const displayed = s.elements.map((e) => e.id).reverse(); // 顯示順序
  const from = displayed.indexOf(srcId);
  const to = displayed.indexOf(targetId);
  if (from < 0 || to < 0) return;
  displayed.splice(to, 0, displayed.splice(from, 1)[0]!);
  const bottomUp = displayed.slice().reverse();
  s.elements.sort((a, b) => bottomUp.indexOf(a.id) - bottomUp.indexOf(b.id));
  await commit(s, srcId);
}

// ---------- 屬性面板(可編輯)----------
function selectedElement(): SceneElement | null {
  const id = handle.selectedId();
  if (!id) return null;
  return scene().elements.find((e) => e.id === id) ?? null;
}

function renderProps() {
  const panel = $('#props-body');
  const el = selectedElement();
  if (!el) {
    // 沒選元素 → 顯示 Canvas(文件)屬性:尺寸 + 背景 + 常用 preset
    const c = scene().canvas;
    const bg = typeof c.background === 'string' ? c.background : null;
    let h = `<div class="prop-head">▭ Canvas <em>document</em></div>`;
    h += `<label class="prop"><span>Width</span><input data-canvas="width" type="number" min="1" value="${Math.round(c.width)}"></label>`;
    h += `<label class="prop"><span>Height</span><input data-canvas="height" type="number" min="1" value="${Math.round(c.height)}"></label>`;
    if (bg !== null) {
      h += `<label class="prop"><span>Background</span><input data-canvas="background" data-color="1" type="color" value="${toHex(bg)}"></label>`;
    } else {
      h += `<div class="prop"><span>Background</span><b>image</b></div>`;
    }
    const presets: [string, string][] = [
      ['', 'Preset…'],
      ['1080x1080', '1080×1080 · IG square'],
      ['1080x1350', '1080×1350 · IG portrait'],
      ['1080x1920', '1080×1920 · Story/Reel'],
      ['1200x630', '1200×630 · OG/Twitter'],
      ['1920x1080', '1920×1080 · HD 16:9'],
    ];
    h += `<label class="prop"><span>Size preset</span><select data-canvas-preset>${presets
      .map(([v, label]) => `<option value="${v}">${label}</option>`)
      .join('')}</select></label>`;
    h += `<div class="prop"><span></span><small style="color:var(--muted)">Select nothing to edit the canvas</small></div>`;
    panel.innerHTML = h;
    return;
  }
  const numF = (label: string, key: string, val: number) =>
    `<label class="prop"><span>${label}</span><input data-k="${key}" type="number" value="${Math.round(val)}"></label>`;
  const colorF = (label: string, key: string, val: string) =>
    `<label class="prop"><span>${label}</span><input data-k="${key}" data-color="1" type="color" value="${toHex(val)}"></label>`;
  const selF = (label: string, key: string, val: string, opts: string[]) =>
    `<label class="prop"><span>${label}</span><select data-k="${key}">${opts
      .map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`)
      .join('')}</select></label>`;

  let html = `<div class="prop-head">${TYPE_ICON[el.type]} ${el.id} <em>${el.type}</em></div>`;
  html += numF('X', 'x', el.x) + numF('Y', 'y', el.y);
  html += numF('W', 'width', el.width);
  if (el.type !== 'text') html += numF('H', 'height', el.height);
  html += numF('Rotation', 'rotation', el.rotation);

  if (el.type === 'text') {
    html += `<label class="prop col"><span>Content</span><textarea data-k="content" rows="3">${escapeHtml(el.content)}</textarea></label>`;
    html += numF('Size', 'fontSize', el.fontSize);
    html += selF('Font', 'fontFamily', el.fontFamily, fontFamilies());
    html += selF('Align', 'align', el.align, ['left', 'center', 'right']);
    html += colorF('Color', 'color', el.color);
  } else if (el.type === 'image') {
    html += `<div class="prop"><span>Source</span><b>${el.src}</b></div>`;
    html += selF('Fit', 'fit', el.fit, ['cover', 'contain', 'stretch']);
  } else if (el.type === 'shape') {
    html += selF('Shape', 'shape', el.shape, ['rect', 'ellipse', 'line']);
    html += colorF('Fill', 'fill', el.fill);
    html += colorF('Stroke', 'stroke', el.stroke);
    html += numF('Stroke W', 'strokeWidth', el.strokeWidth);
  } else {
    // html 元素(D22):畫布上顯示即時渲染預覽(可拖/縮放);內容貼上(inline)或本地檔路徑
    if (typeof el.src === 'string') {
      html += `<label class="prop"><span>HTML file</span><input data-k="src" type="text" value="${escapeHtml(el.src)}"></label>`;
    } else {
      html += `<label class="prop col"><span>HTML code (paste full snippet)</span><textarea data-k="html" rows="6">${escapeHtml(el.html ?? '')}</textarea></label>`;
    }
    html += `<div class="prop"><span></span><button type="button" data-html-open="1" style="cursor:pointer">↗ Open in new tab</button></div>`;
    html += `<div class="prop"><span></span><small style="color:var(--muted)">Live preview on canvas · pure HTML/CSS/JS, transparent body, self-contained assets</small></div>`;
  }

  // 綁定區(S04:面板開關 + 變數名);僅 text.content / image.src 可綁
  const spec = bindSpec(el.type);
  if (spec) {
    const b = bindingFor(scene(), el.id);
    html += `<div class="bind-box">
      <label class="bind-toggle"><input type="checkbox" data-bind-toggle="1" ${b ? 'checked' : ''}>
        <span>Bind variable (${spec.prop})</span></label>`;
    if (b) {
      html += `<label class="prop"><span>Variable</span><input data-bind-var="1" type="text" value="${escapeHtml(b.var)}"></label>`;
    }
    html += `</div>`;
  }
  panel.innerHTML = html;
}

/** 哪個屬性可綁(v1:text.content、image.src);shape 不可綁 */
function bindSpec(type: SceneElement['type']): { prop: 'content' | 'src'; vtype: 'text' | 'image' } | null {
  if (type === 'text') return { prop: 'content', vtype: 'text' };
  if (type === 'image') return { prop: 'src', vtype: 'image' };
  return null;
}

function bindingFor(s: Template, id: string) {
  return s.bindings.find((b) => b.element === id) ?? null;
}

function uniqueVar(s: Template): string {
  const used = new Set(s.bindings.map((b) => b.var));
  let i = 1;
  while (used.has('var' + i)) i++;
  return 'var' + i;
}

async function toggleBinding(id: string, on: boolean) {
  const s = scene();
  const el = s.elements.find((e) => e.id === id);
  if (!el) return;
  const spec = bindSpec(el.type);
  if (!spec) return;
  if (on) {
    if (!s.bindings.some((b) => b.element === id)) {
      s.bindings.push({ var: uniqueVar(s), element: id, prop: spec.prop, type: spec.vtype });
    }
  } else {
    s.bindings = s.bindings.filter((b) => b.element !== id);
  }
  await commit(s, id);
}

async function setBindingVar(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return; // 空名忽略,保留原值
  const s = scene();
  const b = s.bindings.find((x) => x.element === id);
  if (!b) return;
  b.var = trimmed;
  await commit(s, id);
}

// 畫布角標(S04;僅 UI 覆蓋,不進場景)。無縮放,schema 座標 == #stage 內 px
function renderBadges() {
  const layer = document.getElementById('badge-layer');
  if (!layer) return;
  layer.innerHTML = '';
  const s = scene();
  for (const b of s.bindings) {
    const el = s.elements.find((e) => e.id === b.element);
    if (!el) continue;
    const tag = document.createElement('div');
    tag.className = 'badge';
    tag.textContent = `{${b.var}}`;
    // 角標層是 #stage 的 DOM 覆蓋(非 fabric 物件),fabric zoom 不會帶到它 → 自行乘 zoom
    tag.style.left = `${el.x * zoom}px`;
    tag.style.top = `${el.y * zoom}px`;
    layer.appendChild(tag);
  }
}

function fontFamilies(): string[] {
  // 內建字 + 專案字體(去重;內建永遠可選)
  return [...new Set([...BUILTIN_FONTS.map((f) => f.family), ...config.fonts.map((f) => f.family)])];
}

function wireProps() {
  const panel = $('#props-body');
  const onEdit = (e: Event) => void applyPropEdit(e);
  panel.addEventListener('change', onEdit);
  // html 圖層「↗ Open in new tab」:在新分頁看真實 iframe 內容(live HTML/CSS/JS,可開 devtools)
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement)?.dataset?.htmlOpen) openHtmlLayerInTab();
  });
}

// 在新分頁打開選取 html 圖層的真實內容。本地檔 → 直接開 server 路徑(資產自然解析);
// 內嵌代碼 → 開空白同源分頁 document.write(同源故 /assets/… 仍解析、JS 照跑)。
function openHtmlLayerInTab() {
  const el = selectedElement();
  if (!el || el.type !== 'html') return;
  if (typeof el.src === 'string') {
    window.open('/' + el.src.replace(/^\//, ''), '_blank');
  } else if (typeof el.html === 'string') {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(el.html);
    w.document.close();
  }
}

async function applyPropEdit(e: Event) {
  const input = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  // 畫布(文件)屬性:沒選元素時編輯;先於元素分支處理
  if (input.dataset.canvasPreset !== undefined) {
    const [w, h] = input.value.split('x').map(Number);
    if (w && h) await setCanvasSize(w, h);
    return;
  }
  if (input.dataset.canvas) {
    const c = scene().canvas;
    if (input.dataset.canvas === 'width') await setCanvasSize(Number(input.value), c.height);
    else if (input.dataset.canvas === 'height') await setCanvasSize(c.width, Number(input.value));
    else if (input.dataset.canvas === 'background') await setCanvasBg(input.value);
    return;
  }

  const id = handle.selectedId();
  if (!id) return;
  // 綁定控制先處理
  if (input.dataset.bindToggle) {
    await toggleBinding(id, (input as HTMLInputElement).checked);
    return;
  }
  if (input.dataset.bindVar) {
    await setBindingVar(id, input.value);
    return;
  }
  const key = input.dataset.k as keyof SceneElement | undefined;
  if (!key) return;
  const s = scene();
  const el = s.elements.find((x) => x.id === id);
  if (!el) return;
  const numericKeys = ['x', 'y', 'width', 'height', 'rotation', 'fontSize', 'strokeWidth'];
  const val: string | number = numericKeys.includes(key) ? Number(input.value) : input.value;
  // 直接改 schema 欄位,reload 走映射層(origin/裁切換算由映射層負責)
  (el as unknown as Record<string, string | number>)[key] = val;
  await commit(s, id);
}

// ---------- 畫布(文件)尺寸 / 背景 ----------
// 設計尺寸在編輯器恆定 → 改尺寸要同步更新 designW/H(zoom 正規化與 applyZoom 都靠它)
async function setCanvasSize(w: number, hh: number) {
  const W = Math.max(1, Math.min(10000, Math.round(w || 0)));
  const H = Math.max(1, Math.min(10000, Math.round(hh || 0)));
  if (!W || !H) return;
  const s = scene();
  s.canvas.width = W;
  s.canvas.height = H;
  designW = W;
  designH = H;
  await commit(s);
}

async function setCanvasBg(color: string) {
  const s = scene();
  s.canvas.background = color;
  await commit(s);
}

// Document settings modal(工具列 doc 鈕):編輯本模板畫布尺寸/背景
function openDocModal() {
  const c = scene().canvas;
  ($('#doc-name') as HTMLInputElement).value = templateName;
  ($('#doc-w') as HTMLInputElement).value = String(Math.round(c.width));
  ($('#doc-h') as HTMLInputElement).value = String(Math.round(c.height));
  const bgInput = $('#doc-bg') as HTMLInputElement;
  if (typeof c.background === 'string') {
    bgInput.value = toHex(c.background);
    bgInput.disabled = false;
  } else {
    bgInput.disabled = true; // 背景是圖片 → 不用色票
  }
  ($('#doc-preset') as HTMLSelectElement).value = '';
  openModal('doc-modal');
}

async function applyDocEdit(e: Event) {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const w = Number(($('#doc-w') as HTMLInputElement).value);
  const h = Number(($('#doc-h') as HTMLInputElement).value);
  if (t.id === 'doc-preset' && t.value) {
    const [pw, ph] = t.value.split('x').map(Number);
    if (pw && ph) {
      await setCanvasSize(pw, ph);
      ($('#doc-w') as HTMLInputElement).value = String(pw);
      ($('#doc-h') as HTMLInputElement).value = String(ph);
    }
  } else if (t.id === 'doc-w' || t.id === 'doc-h') {
    await setCanvasSize(w, h);
  } else if (t.id === 'doc-bg') {
    await setCanvasBg((t as HTMLInputElement).value);
  }
}

// ---------- 工具列:新增 / 刪除 / 複製 ----------
function wireToolbar() {
  $('#save-btn').onclick = () => void save();
  $('#add-text').onclick = () => void addText();
  $('#add-shape').onclick = () => void addShape();
  $('#add-image').onclick = () => $('#file-input').click();
  $('#add-html').onclick = () => void addHtml();
  $('#del-btn').onclick = () => void deleteSelected();
  $('#dup-btn').onclick = () => void duplicateSelected();
  $('#undo-btn').onclick = () => undo();
  $('#redo-btn').onclick = () => redo();
  ($('#file-input') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void addImage(f);
    (e.target as HTMLInputElement).value = '';
  });
}

async function addText() {
  const fam = fontFamilies()[0]!; // 至少有內建 Noto Sans TC,永遠可新增文字
  const s = scene();
  const id = genId(s);
  s.elements.push({
    id, type: 'text', x: 80, y: 80, width: 400, rotation: 0,
    content: 'Double-click to edit', fontFamily: fam, fontSize: 48, color: '#111111',
    align: 'left', lineHeight: 1.3,
  });
  await commit(s, id);
}

async function addShape(shape: 'rect' | 'ellipse' | 'line' = 'rect') {
  const s = scene();
  const id = genId(s);
  if (shape === 'line') {
    // 線:schema 規定 height>0,給個小斜度(視覺近水平);strokeWidth>0 才看得到
    s.elements.push({
      id, type: 'shape', shape: 'line', x: 100, y: 200, width: 300, height: 4,
      rotation: 0, fill: 'transparent', stroke: '#4a9eff', strokeWidth: 4,
    });
  } else {
    s.elements.push({
      id, type: 'shape', shape, x: 100, y: 100, width: 300, height: 200,
      rotation: 0, fill: '#4a9eff', stroke: 'transparent', strokeWidth: 0,
    });
  }
  await commit(s, id);
}

/** 方向鍵微調選取元素位置(1px;Shift=10px) */
async function nudgeSelected(dx: number, dy: number) {
  const id = handle.selectedId();
  if (!id) return;
  const s = scene();
  const el = s.elements.find((e) => e.id === id);
  if (!el) return;
  el.x += dx;
  el.y += dy;
  await commit(s, id);
}

async function addHtml() {
  // 新增一個 html 圖層(佔位框);預設內嵌一段可立刻貼換的代碼
  const s = scene();
  const id = genId(s);
  s.elements.push({
    id, type: 'html', x: 120, y: 120, width: 400, height: 240, rotation: 0,
    html: '<div style="font:24px system-ui;padding:20px;color:#fff;background:#333">Paste your HTML</div>',
  });
  await commit(s, id);
}

async function addImage(file: File) {
  const name = sanitizeImageName(file.name);
  const buf = await file.arrayBuffer();
  const { path } = await api<{ path: string }>(`/api/assets/images?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: buf,
  });
  const s = scene();
  const id = genId(s);
  s.elements.push({
    id, type: 'image', x: 100, y: 100, width: 400, height: 300, rotation: 0, src: path, fit: 'cover',
  });
  await commit(s, id);
}

function sanitizeImageName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = (dot >= 0 ? name.slice(dot + 1) : 'png').toLowerCase().replace(/[^a-z]/g, '');
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^\w一-鿿-]/g, '_') || 'image';
  const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
  return `${base}.${safeExt}`;
}

async function deleteSelected() {
  const id = handle.selectedId();
  if (!id) return;
  const s = scene();
  s.elements = s.elements.filter((e) => e.id !== id);
  s.bindings = s.bindings.filter((b) => b.element !== id); // 連帶移除指向此元素的綁定
  await commit(s);
}

async function duplicateSelected() {
  const id = handle.selectedId();
  if (!id) return;
  const s = scene();
  const el = s.elements.find((e) => e.id === id);
  if (!el) return;
  const newId = genId(s);
  s.elements.push({ ...el, id: newId, x: el.x + 24, y: el.y + 24 }); // 複本不帶綁定
  await commit(s, newId);
}

// ---------- 剪貼簿(app 內 copy / cut / paste;不碰系統剪貼簿)----------
// 存目前選取元素的深拷貝(不含綁定,與 duplicate 一致)。多次貼上會階梯狀位移。
let clipboard: SceneElement | null = null;

function copySelected() {
  const el = selectedElement();
  if (!el) return;
  clipboard = structuredClone(el);
}

async function cutSelected() {
  const el = selectedElement();
  if (!el) return;
  clipboard = structuredClone(el);
  await deleteSelected();
}

async function pasteClipboard() {
  if (!clipboard) return;
  const s = scene();
  const id = genId(s);
  const copy = structuredClone(clipboard);
  copy.id = id;
  copy.x += 24;
  copy.y += 24;
  s.elements.push(copy);
  // 讓下一次貼上從這份位置再 +24(連續貼上呈階梯,不重疊)
  clipboard.x = copy.x;
  clipboard.y = copy.y;
  await commit(s, id);
}

// ---------- 鍵盤 ----------
function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const modalOpen = !!document.querySelector('.modal-backdrop.open');
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (e.key === 'Escape') {
      if (modalOpen) closeAllModals();
      else if (!typing) handle.deselect(); // 文字編輯中讓 fabric 自行退出,不搶著取消選取
      return;
    }
    if (typing) return; // 正在輸入(含 fabric 文字編輯的隱藏 textarea)→ 不攔截

    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    // ⌘/Ctrl 系列(modal 開著也允許,如 ⌘S)
    if (mod && key === 's') { e.preventDefault(); void save(); return; }
    if (mod && key === 'd') { e.preventDefault(); void duplicateSelected(); return; }
    if (mod && key === 'c') { e.preventDefault(); copySelected(); return; }
    if (mod && key === 'x') { e.preventDefault(); void cutSelected(); return; }
    if (mod && key === 'v') { e.preventDefault(); void pasteClipboard(); return; }
    if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'y') { e.preventDefault(); redo(); return; }
    if (mod || e.altKey) return; // 其餘修飾鍵組合交給瀏覽器/系統

    // 以下單鍵;modal 開著不觸發(避免在對話框後面亂改畫布)
    if (modalOpen) return;

    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void deleteSelected(); return; }

    // 方向鍵微調選取(Shift = 10px)
    if (e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (dx || dy) { e.preventDefault(); void nudgeSelected(dx, dy); }
      return;
    }

    // 單鍵新增工具(Figma 風;不吃 Shift)
    if (e.shiftKey) return;
    switch (key) {
      case 't': e.preventDefault(); void addText(); break;            // Text
      case 'r': e.preventDefault(); void addShape('rect'); break;     // Rectangle
      case 'o': e.preventDefault(); void addShape('ellipse'); break;  // Ellipse (O 形)
      case 'l': e.preventDefault(); void addShape('line'); break;     // Line
      case 'i': e.preventDefault(); ($('#file-input') as HTMLElement).click(); break; // Image
      case 'h': e.preventDefault(); void addHtml(); break;            // HTML
    }
  });
}

// ---------- 存檔 ----------
async function save() {
  const s = scene();
  try {
    await api(`/api/templates/${encodeURIComponent(templateName)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    });
  } catch (e) {
    // server 端 schema 驗證失敗(如變數型別衝突)→ 提示而非靜默
    alert(`Save failed:\n${String(e)}`);
    return;
  }
  dirty = false;
  $('#save-btn').textContent = 'Save ✓';
  setTimeout(() => ($('#save-btn').textContent = 'Save'), 1200);
}

// ---------- 小工具 ----------
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function toHex(css: string): string {
  // <input type=color> 只吃 #rrggbb;非此格式(transparent/具名色)退回黑色顯示
  return /^#[0-9a-f]{6}$/i.test(css) ? css : '#000000';
}

// ---------- Modal 基礎 ----------
function openModal(id: string) {
  $(`#${id}`).classList.add('open');
}
function closeModal(id: string) {
  $(`#${id}`).classList.remove('open');
}
function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
}

function wireModals() {
  // 關閉:× / 取消(data-close)/ 點背景空白(Esc 在 wireKeyboard)
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => {
    b.onclick = () => closeModal(b.dataset.close!);
  });
  document.querySelectorAll<HTMLElement>('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) bd.classList.remove('open');
    });
  });
  // 開啟入口
  $('#doc-btn').onclick = () => openDocModal();
  $('#doc-modal').addEventListener('change', (e) => void applyDocEdit(e));
  $('#tpl-chip').onclick = () => void openSaveModal();
  $('#export-btn').onclick = () => openExportModal();
  $('#var-chip').onclick = () => openExportModal();
  // 動作
  $('#save-confirm').onclick = () => void saveFromModal();
  $('#strict-toggle').addEventListener('change', renderExportPreview);
  $('#download-btn').onclick = () => void downloadPng();
}

// 網頁直接出圖下載:POST 目前場景(含填入的變數值)→ server 子行程跑 CLI render → 回 PNG blob
async function downloadPng() {
  const btn = $('#download-btn') as HTMLButtonElement;
  const statusEl = $('#dl-status');
  const scale = Number(($('#dl-scale') as HTMLSelectElement).value) || 2;
  const strict = ($('#strict-toggle') as HTMLInputElement).checked;
  const data: Record<string, string> = {};
  $('#export-vars')
    .querySelectorAll<HTMLInputElement>('input[data-export-var]')
    .forEach((inp) => {
      const v = inp.value.trim();
      if (v) data[inp.dataset.exportVar!] = v;
    });

  btn.disabled = true;
  statusEl.className = '';
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Rendering…';
  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scene: scene(), data, strict, scale }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
      statusEl.className = 'warn-strict';
      statusEl.textContent = `Failed: ${err.error ?? res.status}`;
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.style.color = 'var(--muted)';
    statusEl.textContent = 'Downloaded ✓';
  } catch (e) {
    statusEl.className = 'warn-strict';
    statusEl.textContent = `Failed: ${String(e)}`;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Save / history modal ----------
async function openSaveModal() {
  ($('#save-name') as HTMLInputElement).value = templateName;
  openModal('save-modal');
  const list = $('#history-list');
  list.innerHTML = '<li class="empty">Loading…</li>';
  try {
    const hist = await api<string[]>(`/api/templates/${encodeURIComponent(templateName)}/history`);
    if (hist.length === 0) {
      list.innerHTML = '<li class="empty">(no history yet — save once to create one)</li>';
      return;
    }
    list.innerHTML = '';
    for (const ts of hist) {
      const li = document.createElement('li');
      li.textContent = formatHistoryStamp(ts);
      list.appendChild(li);
    }
  } catch {
    list.innerHTML = '<li class="empty">(could not load history)</li>';
  }
}

async function saveFromModal() {
  await save();
  closeModal('save-modal');
}

/** 20260616-153012 → 2026-06-16 15:30:12 */
function formatHistoryStamp(ts: string): string {
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : ts;
}

// ---------- Export PNG / Render modal(唯讀示意:變數表 + YAML + CLI;與 mockup 誠實一致)----------
function openExportModal() {
  renderExportVars();
  openModal('export-modal');
}

function renderExportVars() {
  const vars = scanVars(scene());
  const tbody = $('#export-vars');
  if (vars.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" style="color:var(--muted)">(no bound variables — enable "Bind variable" in Properties)</td></tr>';
    renderExportPreview();
    return;
  }
  tbody.innerHTML = vars
    .map(
      (v) =>
        `<tr><td>{${escapeHtml(v.var)}}</td><td>${v.type}</td>` +
        `<td><input data-export-var="${escapeHtml(v.var)}" type="text" placeholder="design value: ${escapeHtml(v.locations[0]?.designValue ?? '')}"></td></tr>`,
    )
    .join('');
  tbody.querySelectorAll('input[data-export-var]').forEach((inp) => inp.addEventListener('input', renderExportPreview));
  renderExportPreview();
}

/** 依目前填值重算 YAML / CLI / 缺值警告 */
function renderExportPreview() {
  const vars = scanVars(scene());
  const filled: Record<string, string> = {};
  const missing: string[] = [];
  $('#export-vars')
    .querySelectorAll<HTMLInputElement>('input[data-export-var]')
    .forEach((inp) => {
      const name = inp.dataset.exportVar!;
      const val = inp.value.trim();
      if (val) filled[name] = val;
      else missing.push(name);
      const tr = inp.closest('tr');
      if (tr) tr.classList.toggle('missing', !val);
    });

  // YAML
  $('#export-yaml').textContent =
    vars.length === 0
      ? '# (no variables)'
      : vars
          .map((v) => `${v.var}: ${filled[v.var] !== undefined ? yamlScalar(filled[v.var]!) : '   # missing → falls back to design value'}`)
          .join('\n');

  // CLI
  const strict = ($('#strict-toggle') as HTMLInputElement).checked;
  $('#export-cli').textContent =
    `tedit render templates/${templateName}.template.json data.yaml -o ${templateName}.png` + (strict ? ' --strict' : '');

  // 缺值警告(--strict 改變文案:沿用 ↔ exit 4 中止,對應 US-5)
  const warn = $('#export-warn');
  if (missing.length === 0) {
    warn.textContent = 'All variables set → render exit 0.';
    warn.className = '';
    warn.style.color = 'var(--muted)';
  } else if (strict) {
    warn.style.color = '';
    warn.className = 'warn-strict';
    warn.textContent = `--strict: ${missing.length} missing (${missing.join(', ')}) → abort, exit 4.`;
  } else {
    warn.style.color = '';
    warn.className = 'warn-keep';
    warn.textContent = `${missing.length} missing (${missing.join(', ')}) → fall back to design values with warning, exit 0.`;
  }
}

/** YAML 純量:單純字串直接出,含特殊字元用 JSON 風格雙引號(YAML 相容) */
function yamlScalar(s: string): string {
  return /^[\w./@:-]+$/.test(s) ? s : JSON.stringify(s);
}

// ---------- U2:模板首頁(start page) ----------
// 與 server SAFE_NAME 同步:英數、-、_、CJK(一-鿿 = U+4E00–U+9FFF)
const TPL_NAME_RE = /^[\w一-鿿-]+$/;

function gotoTemplate(name: string) {
  location.search = '?template=' + encodeURIComponent(name);
}

async function showStartPage(names: string[]) {
  $('#start-folder').textContent = config.name ? `Project: ${config.name}` : 'Current folder';
  $('#start-title').textContent = names.length
    ? 'Pick a template, or create one'
    : 'No templates here yet — create the first:';

  // 每個模板抓 JSON → 顯示畫布尺寸 + 元素數(平行)
  const metas = await Promise.all(
    names.map(async (n) => {
      try {
        const t = await api<Template>(`/api/templates/${encodeURIComponent(n)}`);
        return { name: n, w: t.canvas.width, h: t.canvas.height, count: t.elements.length };
      } catch {
        return { name: n, w: 0, h: 0, count: -1 };
      }
    }),
  );

  const cards = metas
    .map(
      (m) =>
        `<div class="start-card" data-tpl="${escapeHtml(m.name)}" title="Open ${escapeHtml(m.name)}">` +
        `<div class="thumb">▦</div>` +
        `<div class="meta"><div class="name">${escapeHtml(m.name)}</div>` +
        `<div class="dim">${m.count < 0 ? '(load failed)' : `${m.w}×${m.h} · ${m.count} elements`}</div></div></div>`,
    )
    .join('');

  $('#start-grid').innerHTML =
    cards +
    `<div class="start-card create">` +
    `<div class="ttl">＋ New template</div>` +
    `<input id="new-name" type="text" placeholder="Template name (a–z 0–9 - _)" autocomplete="off">` +
    `<button id="create-btn">Create</button>` +
    `<div class="err" id="create-err"></div></div>`;

  // 卡片點擊 → 開該模板
  $('#start-grid')
    .querySelectorAll<HTMLElement>('.start-card[data-tpl]')
    .forEach((c) => (c.onclick = () => gotoTemplate(c.dataset.tpl!)));

  // 建立新模板:驗名 → PUT 空白具名模板 → 進編輯
  const nameInput = $('#new-name') as HTMLInputElement;
  const errEl = $('#create-err');
  const doCreate = async () => {
    const name = nameInput.value.trim();
    errEl.textContent = '';
    if (!name) {
      errEl.textContent = 'Enter a name';
      return;
    }
    if (!TPL_NAME_RE.test(name)) {
      errEl.textContent = 'Allowed: letters, digits, - _';
      return;
    }
    if (names.includes(name)) {
      gotoTemplate(name); // 已存在 → 直接開,不覆蓋
      return;
    }
    try {
      await api(`/api/templates/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(blankScene(config)),
      });
    } catch (e) {
      errEl.textContent = `Create failed: ${String(e)}`;
      return;
    }
    gotoTemplate(name);
  };
  ($('#create-btn') as HTMLElement).onclick = () => void doCreate();
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void doCreate();
  });

  $('#start-page').classList.add('open');
}

void init().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">Editor failed to start:\n${String(e)}</pre>`;
});
