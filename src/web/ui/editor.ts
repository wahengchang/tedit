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

  applyZoom(); // 套初始 zoom(100%):loadScene 已把 canvas 設成 design,這裡接 zoom 與 #stage 尺寸

  $('#tpl-name').textContent = templateName;
  $('#status-path').textContent = `templates/${templateName}.template.json`;
  handle.onChange(renderAll);
  // onChange 也在文字行內編輯後觸發 → 標記 dirty
  handle.onChange(() => markDirty());
  wireToolbar();
  wireProps();
  wireKeyboard();
  wireZoom();
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
    panel.innerHTML = '<div class="empty">(nothing selected)</div>';
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
    // html 元素(D22):佔位框在畫布上可拖/縮放;內容在此貼上(inline)或顯示檔案來源
    if (typeof el.src === 'string') {
      html += `<div class="prop"><span>HTML file</span><b>${el.src}</b></div>`;
    } else {
      html += `<label class="prop col"><span>HTML code (paste full snippet)</span><textarea data-k="html" rows="6">${escapeHtml(el.html ?? '')}</textarea></label>`;
    }
    html += `<div class="prop"><span></span><small style="color:var(--muted)">Rendered at export; placeholder shown on canvas</small></div>`;
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
}

async function applyPropEdit(e: Event) {
  const input = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
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

// ---------- 工具列:新增 / 刪除 / 複製 ----------
function wireToolbar() {
  $('#save-btn').onclick = () => void save();
  $('#add-text').onclick = () => void addText();
  $('#add-shape').onclick = () => void addShape();
  $('#add-image').onclick = () => $('#file-input').click();
  $('#add-html').onclick = () => void addHtml();
  $('#del-btn').onclick = () => void deleteSelected();
  $('#dup-btn').onclick = () => void duplicateSelected();
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

async function addShape() {
  const s = scene();
  const id = genId(s);
  s.elements.push({
    id, type: 'shape', shape: 'rect', x: 100, y: 100, width: 300, height: 200,
    rotation: 0, fill: '#4a9eff', stroke: 'transparent', strokeWidth: 0,
  });
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
    if (e.key === 'Escape') {
      closeAllModals();
      return;
    }
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (typing) return; // 正在輸入(含 fabric 文字編輯的隱藏 textarea)→ 不攔截
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 's') {
      e.preventDefault();
      void save();
    } else if (mod && key === 'd') {
      e.preventDefault();
      void duplicateSelected();
    } else if (mod && key === 'c') {
      e.preventDefault();
      copySelected();
    } else if (mod && key === 'x') {
      e.preventDefault();
      void cutSelected();
    } else if (mod && key === 'v') {
      e.preventDefault();
      void pasteClipboard();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void deleteSelected();
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
  $('#tpl-chip').onclick = () => void openSaveModal();
  $('#export-btn').onclick = () => openExportModal();
  $('#var-chip').onclick = () => openExportModal();
  // 動作
  $('#save-confirm').onclick = () => void saveFromModal();
  $('#strict-toggle').addEventListener('change', renderExportPreview);
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
