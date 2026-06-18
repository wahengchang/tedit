// 編輯器前端(M4 stage 1+2,vanilla TS / S02、深色 Figma 風 / D20)。
// 與 engine.bundle.js 解耦:只透過 window.teditEngine 的 handle API(不直接 import fabric)。
//
// stage 2 核心做法:所有「結構性變更」(改屬性/增刪/複製/排序)都走
//   saveScene() → 改 schema → loadScene() → 重選
// 復用 M1 已驗證的 load/save 映射,中心 origin↔左上角換算交給映射層,絕不手刻數學。

import type { Template, SceneElement, ImageElement } from '../../core/scene/types.js';
import type { ProjectConfig } from '../../core/project.js';
import { buildFontRegistry, BUILTIN_FONTS } from '../../core/project.js';
import type { EngineHandle } from '../../core/engine/browser-entry.js';
import { scanVars } from '../../core/resolver/index.js';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const TYPE_ICON: Record<string, string> = { text: 'T', image: '▦', shape: '◇', html: '◧' };

let handle: EngineHandle;
let config: ProjectConfig;
let fontReg: Record<string, string> = {};
// D23:一資料夾一專案一模板 → 沒有模板名;projectName 僅供顯示與出圖檔名(取自 project.json name)
let projectName = 'template';
let dirty = false;

// U1:zoom 是純視圖縮放(fabric setZoom);設計尺寸在編輯器恆定。
let zoom = 1;
let designW = 0;
let designH = 0;
const Z_MIN = 0.1;
const Z_MAX = 4;

type ImageCrop = NonNullable<ImageElement['crop']>;

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
  projectName = config.name?.trim() || 'template';

  // D23:直接載入專案夾的唯一 template.json;不存在(新專案)→ 空白模板,首存即建檔
  let initial: Template;
  try {
    initial = await api<Template>('/api/template');
  } catch {
    initial = blankScene(config);
  }

  designW = initial.canvas.width;
  designH = initial.canvas.height;

  handle = window.teditEngine.boot('edit', $('#stage'));
  await handle.loadScene(initial, fontReg, '/');

  // 綁定角標層(S04:僅 UI 覆蓋,不進場景);#stage position:relative,inset 對齊畫布
  const badgeLayer = document.createElement('div');
  badgeLayer.id = 'badge-layer';
  $('#stage').appendChild(badgeLayer);
  const renderOverlay = document.createElement('div');
  renderOverlay.id = 'render-overlay';
  $('#stage').appendChild(renderOverlay);
  const cropInline = document.createElement('div');
  cropInline.id = 'image-ui';
  cropInline.className = 'hidden';
  cropInline.innerHTML =
    '<div id="image-ui-outer" class="image-ui-outer">' +
    '<div class="image-ui-outer-handle" data-pos="nw"></div>' +
    '<div class="image-ui-outer-handle" data-pos="n"></div>' +
    '<div class="image-ui-outer-handle" data-pos="ne"></div>' +
    '<div class="image-ui-outer-handle" data-pos="e"></div>' +
    '<div class="image-ui-outer-handle" data-pos="se"></div>' +
    '<div class="image-ui-outer-handle" data-pos="s"></div>' +
    '<div class="image-ui-outer-handle" data-pos="sw"></div>' +
    '<div class="image-ui-outer-handle" data-pos="w"></div>' +
    '<div class="image-ui-outer-rotate"></div>' +
    '</div>' +
    '<img id="image-ui-fullimg" class="image-ui-fullimg" alt="">' +
    '<div id="image-ui-shade-top" class="image-ui-shade"></div>' +
    '<div id="image-ui-shade-right" class="image-ui-shade"></div>' +
    '<div id="image-ui-shade-bottom" class="image-ui-shade"></div>' +
    '<div id="image-ui-shade-left" class="image-ui-shade"></div>' +
    '<div id="image-ui-cropbox" class="image-ui-cropbox">' +
    '<div class="image-ui-crop-handle" data-handle="nw"></div>' +
    '<div class="image-ui-crop-handle edge-h" data-handle="n"></div>' +
    '<div class="image-ui-crop-handle" data-handle="ne"></div>' +
    '<div class="image-ui-crop-handle edge-v" data-handle="e"></div>' +
    '<div class="image-ui-crop-handle" data-handle="se"></div>' +
    '<div class="image-ui-crop-handle edge-h" data-handle="s"></div>' +
    '<div class="image-ui-crop-handle" data-handle="sw"></div>' +
    '<div class="image-ui-crop-handle edge-v" data-handle="w"></div>' +
    '</div>' +
    '<div id="image-toolbar" class="image-toolbar"></div>';
  $('#stage').appendChild(cropInline);

  // 載入即「符合視窗」:大畫布(如 1920px)在 100% 會爆出工作區,fitZoom 縮到剛好放得下;
  // fitZoom 上限 100%,小畫布維持 1:1 不被放大。(loadScene 已把 canvas 設成 design)
  fitZoom();

  $('#tpl-name').textContent = projectName;
  $('#status-path').textContent = 'template.json';
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
  wireInlineCrop();
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
  renderInlineCrop();
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
    showRenderSpinner(el.id); // 轉圈提示:讓使用者知道在算、不是壞了
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
    } finally {
      hideRenderSpinner(el.id);
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

// 出圖轉圈提示:放在該 html 圖層中心(fabric 物件 left/top 為中心 × zoom)
function htmlObjCenter(id: string): { x: number; y: number } | null {
  for (const o of (handle.canvas as unknown as FCanvas).getObjects()) {
    const oo = o as unknown as { teditId?: string; left: number; top: number };
    if (oo.teditId === id) return { x: oo.left * zoom, y: oo.top * zoom };
  }
  return null;
}
function showRenderSpinner(id: string) {
  const overlay = document.getElementById('render-overlay');
  if (!overlay) return;
  let sp = overlay.querySelector<HTMLElement>(`[data-spin="${id}"]`);
  if (!sp) {
    sp = document.createElement('div');
    sp.className = 'render-spin';
    sp.dataset.spin = id;
    overlay.appendChild(sp);
  }
  const c = htmlObjCenter(id);
  if (c) {
    sp.style.left = `${c.x}px`;
    sp.style.top = `${c.y}px`;
  }
}
function hideRenderSpinner(id: string) {
  document.getElementById('render-overlay')?.querySelector(`[data-spin="${id}"]`)?.remove();
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
  renderInlineCrop();
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
  const wrap = $('#canvas-wrap');
  let panReady = false;
  let panActive = false;
  let panPointerId = -1;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const isTyping = () => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  };
  const syncPanClass = () => {
    wrap.classList.toggle('pan-ready', panReady && !panActive);
    wrap.classList.toggle('panning', panActive);
  };
  const stopPan = () => {
    panActive = false;
    panPointerId = -1;
    syncPanClass();
  };

  $('#zoom-in').onclick = () => changeZoom(zoom * 1.25);
  $('#zoom-out').onclick = () => changeZoom(zoom / 1.25);
  // 點百分比:非 100% → 回 100%;已是 100% → 符合視窗
  $('#zoom-pct').onclick = () => (Math.abs(zoom - 1) < 0.001 ? fitZoom() : changeZoom(1));

  // 一般滾輪/雙指保留原生捲動(方便放大後平移);Ctrl/Cmd+wheel 才縮放。
  wrap.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    },
    { passive: false },
  );

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || isTyping() || cropModeActive()) return;
    e.preventDefault();
    panReady = true;
    syncPanClass();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    panReady = false;
    if (!panActive) syncPanClass();
  });
  window.addEventListener('blur', () => {
    panReady = false;
    stopPan();
  });
  wrap.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (!panReady || e.button !== 0) return;
      panActive = true;
      panPointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = wrap.scrollLeft;
      startTop = wrap.scrollTop;
      wrap.setPointerCapture(e.pointerId);
      syncPanClass();
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  wrap.addEventListener('pointermove', (e: PointerEvent) => {
    if (!panActive || e.pointerId !== panPointerId) return;
    wrap.scrollLeft = startLeft - (e.clientX - startX);
    wrap.scrollTop = startTop - (e.clientY - startY);
  });
  wrap.addEventListener('pointerup', (e: PointerEvent) => {
    if (e.pointerId !== panPointerId) return;
    stopPan();
  });
  wrap.addEventListener('pointercancel', (e: PointerEvent) => {
    if (e.pointerId !== panPointerId) return;
    stopPan();
  });
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
  if (cropModeActive()) {
    sel.textContent = 'Crop mode: drag crop box or handles, wheel zoom image, Enter save, Esc cancel';
    return;
  }
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
  const selected = selectedSceneId();
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
  const id = selectedSceneId();
  if (!id) return null;
  return scene().elements.find((e) => e.id === id) ?? null;
}

function selectedSceneId(): string | null {
  return cropEditId ?? handle.selectedId();
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
    html += `<div class="prop"><span></span><small style="color:var(--muted)">${cropEditId === el.id ? 'Crop with on-canvas handles and floating actions below.' : 'Use the floating image toolbar below the selection for replace / crop actions.'}</small></div>`;
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
    html += `<div class="prop"><span></span><span style="display:flex;gap:6px;width:100%">` +
      `<button type="button" class="prop-edit-btn" data-html-edit="1" style="flex:1">✎ Edit HTML…</button>` +
      `<button type="button" class="prop-edit-btn" data-html-refresh="1" title="Refresh preview" style="flex:none;width:40px">⟳</button>` +
      `</span></div>`;
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
  // html 圖層「✎ Edit HTML…」→ 開 Modal;「⟳」→ 強制重畫該層預覽
  panel.addEventListener('click', (e) => {
    const ds = (e.target as HTMLElement)?.dataset;
    if (ds?.htmlEdit) void openHtmlEditModal();
    else if (ds?.htmlRefresh) forceRefreshSelectedHtml();
  });
}

let cropEditId: string | null = null;
let pendingImageReplaceId: string | null = null;
let cropDraft:
  | null
  | {
      id: string;
      src: string;
      natW: number;
      natH: number;
      imageX: number;
      imageY: number;
      imageW: number;
      imageH: number;
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;
    } = null;
let cropGesture:
  | null
  | {
      pointerId: number;
      mode: 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
      startX: number;
      startY: number;
      imageX: number;
      imageY: number;
      imageW: number;
      imageH: number;
      cropX: number;
      cropY: number;
      cropW: number;
      cropH: number;
    } = null;

function cropModeActive(): boolean {
  return cropEditId !== null && cropDraft !== null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function defaultCoverCrop(boxW: number, boxH: number, natW: number, natH: number): ImageCrop {
  const scale = Math.max(boxW / natW, boxH / natH);
  const cropW = boxW / scale;
  const cropH = boxH / scale;
  return {
    x: (natW - cropW) / 2 / natW,
    y: (natH - cropH) / 2 / natH,
    width: cropW / natW,
    height: cropH / natH,
  };
}

function currentCropRect(): ImageCrop {
  if (!cropDraft) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: clamp((cropDraft.cropX - cropDraft.imageX) / cropDraft.imageW, 0, 1),
    y: clamp((cropDraft.cropY - cropDraft.imageY) / cropDraft.imageH, 0, 1),
    width: clamp(cropDraft.cropW / cropDraft.imageW, 0.000001, 1),
    height: clamp(cropDraft.cropH / cropDraft.imageH, 0.000001, 1),
  };
}

function isDefaultCrop(crop: ImageCrop, boxW: number, boxH: number, natW: number, natH: number): boolean {
  const d = defaultCoverCrop(boxW, boxH, natW, natH);
  return Math.abs(crop.x - d.x) < 1e-6
    && Math.abs(crop.y - d.y) < 1e-6
    && Math.abs(crop.width - d.width) < 1e-6
    && Math.abs(crop.height - d.height) < 1e-6;
}

function clampCropDraft() {
  if (!cropDraft) return;
  const minSize = 24;
  cropDraft.cropW = clamp(cropDraft.cropW, minSize, cropDraft.imageW);
  cropDraft.cropH = clamp(cropDraft.cropH, minSize, cropDraft.imageH);
  cropDraft.cropX = clamp(cropDraft.cropX, cropDraft.imageX, cropDraft.imageX + cropDraft.imageW - cropDraft.cropW);
  cropDraft.cropY = clamp(cropDraft.cropY, cropDraft.imageY, cropDraft.imageY + cropDraft.imageH - cropDraft.cropH);
}

function setCropZoom(nextScale: number, anchorX: number, anchorY: number) {
  if (!cropDraft) return;
  const prevScale = cropDraft.imageW / cropDraft.natW;
  const next = clamp(nextScale, 0.05, 20);
  const srcAnchorX = (anchorX - cropDraft.imageX) / prevScale;
  const srcAnchorY = (anchorY - cropDraft.imageY) / prevScale;
  cropDraft.imageW = cropDraft.natW * next;
  cropDraft.imageH = cropDraft.natH * next;
  cropDraft.imageX = anchorX - srcAnchorX * next;
  cropDraft.imageY = anchorY - srcAnchorY * next;
  clampCropDraft();
  renderInlineCrop();
}

function renderInlineCrop() {
  const root = document.getElementById('image-ui');
  const outer = document.getElementById('image-ui-outer');
  const img = document.getElementById('image-ui-fullimg') as HTMLImageElement | null;
  const cropbox = document.getElementById('image-ui-cropbox');
  const toolbar = document.getElementById('image-toolbar');
  if (!root || !outer || !img || !cropbox || !toolbar) return;
  const selected = selectedElement();
  if (!selected || selected.type !== 'image') {
    root.classList.add('hidden');
    return;
  }
  const el = cropEditId ? scene().elements.find((e) => e.id === cropEditId) : selected;
  if (!el || el.type !== 'image') {
    cropEditId = null;
    cropDraft = null;
    root.classList.add('hidden');
    return;
  }
  const toolbarMarkup = cropModeActive()
    ? imageToolbarMarkup(true)
    : imageToolbarMarkup(false);
  if (toolbar.innerHTML !== toolbarMarkup) toolbar.innerHTML = toolbarMarkup;
  root.style.pointerEvents = cropModeActive() ? 'auto' : 'none';

  const boxX = cropModeActive() && cropDraft ? cropDraft.cropX : el.x;
  const boxY = cropModeActive() && cropDraft ? cropDraft.cropY : el.y;
  const boxW = cropModeActive() && cropDraft ? cropDraft.cropW : el.width;
  const boxH = cropModeActive() && cropDraft ? cropDraft.cropH : el.height;
  root.classList.remove('hidden');
  toolbar.style.left = `${(boxX + boxW / 2) * zoom}px`;
  toolbar.style.top = `${(boxY + boxH) * zoom + 16}px`;
  toolbar.style.transform = 'translateX(-50%)';

  if (!cropModeActive() || !cropDraft) {
    outer.style.display = 'none';
    cropbox.style.display = 'none';
    img.style.display = 'none';
    for (const id of ['top', 'right', 'bottom', 'left']) {
      const shade = document.getElementById(`image-ui-shade-${id}`);
      if (shade) shade.style.display = 'none';
    }
    return;
  }

  const d = cropDraft;
  outer.style.display = 'block';
  cropbox.style.display = 'block';
  img.style.display = 'block';
  outer.style.left = `${d.imageX * zoom}px`;
  outer.style.top = `${d.imageY * zoom}px`;
  outer.style.width = `${d.imageW * zoom}px`;
  outer.style.height = `${d.imageH * zoom}px`;
  img.style.left = `${d.imageX * zoom}px`;
  img.style.top = `${d.imageY * zoom}px`;
  img.style.width = `${d.imageW * zoom}px`;
  img.style.height = `${d.imageH * zoom}px`;
  cropbox.style.left = `${d.cropX * zoom}px`;
  cropbox.style.top = `${d.cropY * zoom}px`;
  cropbox.style.width = `${d.cropW * zoom}px`;
  cropbox.style.height = `${d.cropH * zoom}px`;

  const shades = {
    top: [d.imageX, d.imageY, d.imageW, d.cropY - d.imageY],
    right: [d.cropX + d.cropW, d.cropY, d.imageX + d.imageW - (d.cropX + d.cropW), d.cropH],
    bottom: [d.imageX, d.cropY + d.cropH, d.imageW, d.imageY + d.imageH - (d.cropY + d.cropH)],
    left: [d.imageX, d.cropY, d.cropX - d.imageX, d.cropH],
  } as const;
  for (const [id, [x, y, w, h]] of Object.entries(shades)) {
    const shade = document.getElementById(`image-ui-shade-${id}`);
    if (!shade) continue;
    shade.style.display = 'block';
    shade.style.left = `${x * zoom}px`;
    shade.style.top = `${y * zoom}px`;
    shade.style.width = `${Math.max(0, w) * zoom}px`;
    shade.style.height = `${Math.max(0, h) * zoom}px`;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = '/' + src.replace(/^\//, '');
  });
}

async function openImageCropModal() {
  const el = selectedElement();
  if (!el || el.type !== 'image') return;
  cropEditId = el.id;
  const img = await loadImage(el.src);
  const applied = el.fit === 'cover' && el.crop ? el.crop : defaultCoverCrop(el.width, el.height, img.naturalWidth, img.naturalHeight);
  const scale = el.width / (applied.width * img.naturalWidth);
  const imageW = img.naturalWidth * scale;
  const imageH = img.naturalHeight * scale;
  cropDraft = {
    id: el.id,
    src: img.src,
    natW: img.naturalWidth,
    natH: img.naturalHeight,
    imageX: el.x - applied.x * imageW,
    imageY: el.y - applied.y * imageH,
    imageW,
    imageH,
    cropX: el.x,
    cropY: el.y,
    cropW: el.width,
    cropH: el.height,
  };
  const fullImg = document.getElementById('image-ui-fullimg') as HTMLImageElement | null;
  if (fullImg) fullImg.src = img.src;
  renderProps();
  renderStatus();
  renderInlineCrop();
}

async function commitImageCrop() {
  if (!cropEditId || !cropDraft) return;
  const id = cropEditId;
  const draft = cropDraft;
  cropEditId = null;
  cropDraft = null;
  cropGesture = null;
  renderInlineCrop();
  const s = scene();
  const el = s.elements.find((e) => e.id === id);
  if (el && el.type === 'image') {
    el.fit = 'cover';
    el.x = Math.round(draft.cropX * 1e6) / 1e6;
    el.y = Math.round(draft.cropY * 1e6) / 1e6;
    el.width = Math.round(draft.cropW * 1e6) / 1e6;
    el.height = Math.round(draft.cropH * 1e6) / 1e6;
    const crop = {
      x: clamp((draft.cropX - draft.imageX) / draft.imageW, 0, 1),
      y: clamp((draft.cropY - draft.imageY) / draft.imageH, 0, 1),
      width: clamp(draft.cropW / draft.imageW, 0.000001, 1),
      height: clamp(draft.cropH / draft.imageH, 0.000001, 1),
    };
    if (isDefaultCrop(crop, el.width, el.height, draft.natW, draft.natH)) delete (el as ImageElement).crop;
    else el.crop = crop;
    await commit(s, id);
  }
}

function cancelImageCrop() {
  if (!cropEditId) return;
  cropEditId = null;
  cropDraft = null;
  cropGesture = null;
  renderInlineCrop();
  renderProps();
  renderStatus();
}

function resetImageCrop() {
  if (!cropDraft) return;
  cropDraft.cropX = cropDraft.imageX;
  cropDraft.cropY = cropDraft.imageY;
  cropDraft.cropW = cropDraft.imageW;
  cropDraft.cropH = cropDraft.imageH;
  renderInlineCrop();
}

function imageToolbarMarkup(cropMode: boolean): string {
  if (cropMode) {
    return [
      '<button type="button" data-image-crop-reset="1" title="Reset crop" aria-label="Reset crop">',
      svgIcon('reset'),
      '</button>',
      '<button type="button" data-image-crop-cancel="1" title="Cancel crop" aria-label="Cancel crop">',
      svgIcon('close'),
      '</button>',
      '<button type="button" data-image-crop-done="1" title="Apply crop" aria-label="Apply crop">',
      svgIcon('check'),
      '</button>',
    ].join('');
  }
  return [
    '<button type="button" data-image-replace="1" title="Replace image" aria-label="Replace image">',
    svgIcon('image'),
    '</button>',
    '<button type="button" data-image-crop="1" title="Crop" aria-label="Crop">',
    svgIcon('crop'),
    '</button>',
  ].join('');
}

// ⟳:清掉該層預覽快取 → 立刻重畫(src 檔在外部改過、或想手動刷新時用)
function forceRefreshSelectedHtml() {
  const id = handle.selectedId();
  if (!id) return;
  previewHash.delete(id);
  void refreshHtmlPreviews();
}

// ---------- HTML 圖層編輯 Modal ----------
// 統一規則:inline 與 src 兩種都能在同一個 Modal 編輯,永不卡唯讀。
// inline → 載入 el.html;src → fetch 檔案內容載入。一旦 Done 一律存成 inline(src 層編過即脫鉤原檔)。
let htmlEditId: string | null = null;
let htmlEditTimer: ReturnType<typeof setTimeout> | undefined;

async function openHtmlEditModal() {
  const el = selectedElement();
  if (!el || el.type !== 'html') return;
  htmlEditId = el.id;
  const W = Math.max(1, Math.round(el.width));
  const H = Math.max(1, Math.round(el.height));
  ($('#he-dim') as HTMLElement).textContent = `${W} × ${H}`;
  const code = $('#he-code') as HTMLTextAreaElement;
  // 載入內容:inline 直接用字串;src 去 fetch 那個檔(載進來編輯 → Done 轉 inline)
  let content = el.html ?? '';
  if (typeof el.src === 'string') {
    try {
      content = await (await fetch('/' + el.src.replace(/^\//, ''))).text();
    } catch {
      content = `<!-- 載入 ${el.src} 失敗,可直接在此重寫 -->`;
    }
  }
  code.value = content;
  const frame = $('#he-frame') as HTMLIFrameElement;
  const hl = $('#he-hl') as HTMLElement;
  const syncHighlight = () => {
    hl.innerHTML = highlightHtml(code.value);
    hl.scrollTop = code.scrollTop;
    hl.scrollLeft = code.scrollLeft;
  };
  const renderPrev = () => {
    frame.srcdoc = code.value;
  };
  code.oninput = () => {
    syncHighlight(); // 高亮即時跟
    clearTimeout(htmlEditTimer);
    htmlEditTimer = setTimeout(renderPrev, 180); // 預覽 debounce
  };
  code.onscroll = () => {
    hl.scrollTop = code.scrollTop;
    hl.scrollLeft = code.scrollLeft;
  };
  openModal('html-modal');
  sizeHtmlEditFrame(W, H); // modal 已開 → prevwrap 有尺寸可量
  syncHighlight();
  renderPrev();
  code.focus();
}

// 零依賴 HTML 語法高亮(供編輯器疊層用)。先 escape,再上色:註解 / 標籤名 / 屬性名 / 字串值。
// 不解析 <style>/<script> 內部(留原樣文字),正則誤判也只是少上色、不會壞顯示。
function highlightHtml(src: string): string {
  let s = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/&lt;!--[\s\S]*?--&gt;/g, (m) => `<span class="hl-com">${m}</span>`);
  s = s.replace(/(&lt;\/?)([a-zA-Z][\w-]*)([\s\S]*?)(\/?&gt;)/g, (_m, open, tag, attrs, close) => {
    const a = attrs.replace(
      /([\w-]+)(=)(&quot;[^&]*&quot;|"[^"]*"|'[^']*')/g,
      (_mm: string, n: string, eq: string, v: string) => `<span class="hl-attr">${n}</span>${eq}<span class="hl-str">${v}</span>`,
    );
    return `${open}<span class="hl-tag">${tag}</span>${a}${close}`;
  });
  return s;
}

// 把 W×H 的 iframe 等比縮到預覽 pane 內(transform scale;忠實呈現固定尺寸)
function sizeHtmlEditFrame(W: number, H: number) {
  const wrap = $('#html-modal .he-prevwrap') as HTMLElement;
  const scaler = $('#he-scaler') as HTMLElement;
  const frame = $('#he-frame') as HTMLElement;
  const pad = 32;
  const s = Math.min(1, (wrap.clientWidth - pad) / W, (wrap.clientHeight - pad) / H) || 1;
  frame.style.width = `${W}px`;
  frame.style.height = `${H}px`;
  frame.style.transform = `scale(${s})`;
  frame.style.transformOrigin = 'top left';
  scaler.style.width = `${W * s}px`;
  scaler.style.height = `${H * s}px`;
}

// Done:把編輯內容存回該層(一律 inline);src 層編過即轉 inline(脫鉤原共用檔)
async function commitHtmlEdit() {
  if (!htmlEditId) return;
  const id = htmlEditId;
  const s = scene();
  const el = s.elements.find((e) => e.id === id);
  if (el && el.type === 'html') {
    el.html = ($('#he-code') as HTMLTextAreaElement).value;
    delete (el as { src?: string }).src; // 統一存 inline
    await commit(s, id);
  }
  htmlEditId = null;
  closeModal('html-modal');
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
  ($('#doc-name') as HTMLInputElement).value = projectName;
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
    if (f) {
      if (pendingImageReplaceId) void replaceSelectedImage(f);
      else void addImage(f);
    }
    pendingImageReplaceId = null;
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
  const path = await uploadImageFile(file);
  const s = scene();
  const id = genId(s);
  s.elements.push({
    id, type: 'image', x: 100, y: 100, width: 400, height: 300, rotation: 0, src: path, fit: 'cover',
  });
  await commit(s, id);
}

async function uploadImageFile(file: File): Promise<string> {
  const name = sanitizeImageName(file.name);
  const buf = await file.arrayBuffer();
  const { path } = await api<{ path: string }>(`/api/assets/images?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body: buf,
  });
  return path;
}

async function replaceSelectedImage(file: File) {
  const id = pendingImageReplaceId ?? selectedSceneId();
  if (!id) return;
  const s = scene();
  const el = s.elements.find((e) => e.id === id);
  if (!el || el.type !== 'image') return;
  el.src = await uploadImageFile(file);
  delete el.crop;
  el.fit = 'cover';
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

    if (cropModeActive() && !typing) {
      if (e.key === 'Escape') { e.preventDefault(); cancelImageCrop(); return; }
      if (e.key === 'Enter') { e.preventDefault(); void commitImageCrop(); return; }
    }

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
    if (cropModeActive()) return;

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
    await api('/api/template', {
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
function svgIcon(name: 'magic' | 'image' | 'crop' | 'format' | 'reset' | 'close' | 'check'): string {
  if (name === 'magic') {
    return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l5.5-5.5"/><path d="M9 2.5l.8 1.7L11.5 5l-1.7.8L9 7.5l-.8-1.7L6.5 5l1.7-.8L9 2.5z"/><path d="M12.5 8.5l.5 1 .9.5-.9.5-.5 1-.5-1-.9-.5.9-.5.5-1z"/><path d="M2.5 12.5l1 1"/></svg>';
  }
  if (name === 'image') {
    return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="5.5" cy="6.3" r="1"/><path d="M3 11l3-2.4 2.2 1.8 2-1.6 2.8 2.2"/></svg>';
  }
  if (name === 'crop') {
    return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5v8a1 1 0 0 0 1 1h7.5"/><path d="M2.5 5H10.5a1 1 0 0 1 1 1V13.5"/></svg>';
  }
  if (name === 'format') {
    return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h7l-1.5 3h-4z"/><path d="M6.5 7.5v4.5"/><path d="M10.5 5l2.5 2.5-3.5 3.5H7v-2.5z"/></svg>';
  }
  if (name === 'reset') {
    return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2"/><path d="M3.5 3.5v3h3"/></svg>';
  }
  if (name === 'close') {
    return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  }
  return '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8l3 3 6-6"/></svg>';
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
  $('#he-done').onclick = () => void commitHtmlEdit();
}

function wireInlineCrop() {
  const root = document.getElementById('image-ui');
  const cropbox = document.getElementById('image-ui-cropbox');
  const toolbar = document.getElementById('image-toolbar');
  if (!root || !cropbox || !toolbar) return;

  root.addEventListener('wheel', (e: WheelEvent) => {
    if (!cropModeActive() || !cropDraft) return;
    e.preventDefault();
    const rect = root.getBoundingClientRect();
    const anchorX = (e.clientX - rect.left) / zoom;
    const anchorY = (e.clientY - rect.top) / zoom;
    setCropZoom((cropDraft.imageW / cropDraft.natW) * Math.exp(-e.deltaY * 0.0015), anchorX, anchorY);
  }, { passive: false });

  cropbox.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!cropModeActive() || !cropDraft || e.button !== 0) return;
    const handleName = ((e.target as HTMLElement).dataset.handle ?? 'move') as NonNullable<typeof cropGesture>['mode'];
    cropGesture = {
      pointerId: e.pointerId,
      mode: handleName,
      startX: e.clientX,
      startY: e.clientY,
      imageX: cropDraft.imageX,
      imageY: cropDraft.imageY,
      imageW: cropDraft.imageW,
      imageH: cropDraft.imageH,
      cropX: cropDraft.cropX,
      cropY: cropDraft.cropY,
      cropW: cropDraft.cropW,
      cropH: cropDraft.cropH,
    };
    cropbox.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  cropbox.addEventListener('pointermove', (e: PointerEvent) => {
    if (!cropDraft || !cropGesture || e.pointerId !== cropGesture.pointerId) return;
    const dx = (e.clientX - cropGesture.startX) / zoom;
    const dy = (e.clientY - cropGesture.startY) / zoom;
    const g = cropGesture;
    cropDraft.cropX = g.cropX;
    cropDraft.cropY = g.cropY;
    cropDraft.cropW = g.cropW;
    cropDraft.cropH = g.cropH;
    if (g.mode === 'move') {
      cropDraft.cropX = g.cropX + dx;
      cropDraft.cropY = g.cropY + dy;
    } else {
      const east = g.mode.includes('e');
      const west = g.mode.includes('w');
      const north = g.mode.includes('n');
      const south = g.mode.includes('s');
      if (west) {
        cropDraft.cropX = g.cropX + dx;
        cropDraft.cropW = g.cropW - dx;
      }
      if (east) cropDraft.cropW = g.cropW + dx;
      if (north) {
        cropDraft.cropY = g.cropY + dy;
        cropDraft.cropH = g.cropH - dy;
      }
      if (south) cropDraft.cropH = g.cropH + dy;
    }
    clampCropDraft();
    renderInlineCrop();
  });
  const stopGesture = (e: PointerEvent) => {
    if (!cropGesture || e.pointerId !== cropGesture.pointerId) return;
    cropGesture = null;
  };
  cropbox.addEventListener('pointerup', stopGesture);
  cropbox.addEventListener('pointercancel', stopGesture);

  toolbar.addEventListener('click', (e) => {
    const ds = (e.target as HTMLElement).closest('button')?.dataset;
    if (!ds) return;
    if (ds.imageCrop) void openImageCropModal();
    else if (ds.imageReplace) {
      const id = selectedSceneId();
      if (!id) return;
      pendingImageReplaceId = id;
      ($('#file-input') as HTMLInputElement).click();
    } else if (ds.imageCropDone) void commitImageCrop();
    else if (ds.imageCropReset) resetImageCrop();
    else if (ds.imageCropCancel) cancelImageCrop();
  });
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
      const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
        error?: string;
        hint?: string;
        action?: string;
      };
      statusEl.className = 'warn-strict';
      statusEl.textContent = formatDownloadError(err.error ?? `HTTP ${res.status}`, err.hint, err.action);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.png`;
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

function formatDownloadError(error: string, hint?: string, action?: string): string {
  return ['Failed: ' + error, hint, action].filter(Boolean).join('\n');
}

// ---------- Save / history modal ----------
async function openSaveModal() {
  ($('#save-name') as HTMLInputElement).value = projectName;
  openModal('save-modal');
  const list = $('#history-list');
  list.innerHTML = '<li class="empty">Loading…</li>';
  try {
    const hist = await api<string[]>('/api/template/history');
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
    `tedit render . data.json -o ${projectName}.png` + (strict ? ' --strict' : '');

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

void init().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">Editor failed to start:\n${String(e)}</pre>`;
});
