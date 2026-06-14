// 編輯器前端(M4 stage 1+2,vanilla TS / S02、深色 Figma 風 / D20)。
// 與 engine.bundle.js 解耦:只透過 window.teditEngine 的 handle API(不直接 import fabric)。
//
// stage 2 核心做法:所有「結構性變更」(改屬性/增刪/複製/排序)都走
//   saveScene() → 改 schema → loadScene() → 重選
// 復用 M1 已驗證的 load/save 映射,中心 origin↔左上角換算交給映射層,絕不手刻數學。

import type { Template, SceneElement } from '../../core/scene/types.js';
import type { ProjectConfig } from '../../core/project.js';
import type { EngineHandle } from '../../core/engine/browser-entry.js';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const TYPE_ICON: Record<string, string> = { text: 'T', image: '▦', shape: '◇' };

let handle: EngineHandle;
let config: ProjectConfig;
let fontReg: Record<string, string> = {};
let templateName = '';
let dirty = false;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

function buildFontReg(c: ProjectConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of c.fonts) map[f.family] = '/' + f.file;
  return map;
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

const scene = () => handle.saveScene();

/** 結構性變更的唯一入口:套用新 scene 並(可選)重選某元素 */
async function commit(next: Template, selectId?: string) {
  await handle.loadScene(next, fontReg, '/');
  if (selectId) handle.selectById(selectId);
  markDirty();
  renderAll();
}

async function init() {
  config = await api<ProjectConfig>('/api/project');
  fontReg = buildFontReg(config);
  const names = await api<string[]>('/api/templates');
  const wanted = new URLSearchParams(location.search).get('template');
  templateName = wanted && names.includes(wanted) ? wanted : (names[0] ?? 'untitled');

  handle = window.teditEngine.boot('edit', $('#stage'));
  const initial = names.includes(templateName)
    ? await api<Template>(`/api/templates/${encodeURIComponent(templateName)}`)
    : blankScene(config);
  await handle.loadScene(initial, fontReg, '/');

  $('#tpl-name').textContent = templateName;
  handle.onChange(renderAll);
  // onChange 也在文字行內編輯後觸發 → 標記 dirty
  handle.onChange(() => markDirty());
  wireToolbar();
  wireProps();
  wireKeyboard();
  renderAll();
}

function renderAll() {
  renderLayers();
  renderProps();
}

function markDirty() {
  if (dirty) return;
  dirty = true;
  $('#save-btn').textContent = '存檔 *';
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
  if (layers.length === 0) list.innerHTML = '<div class="empty">（空畫布,尚無元素）</div>';
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
    panel.innerHTML = '<div class="empty">（未選取元素）</div>';
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
  html += numF('寬', 'width', el.width);
  if (el.type !== 'text') html += numF('高', 'height', el.height);
  html += numF('旋轉', 'rotation', el.rotation);

  if (el.type === 'text') {
    html += `<label class="prop col"><span>內容</span><textarea data-k="content" rows="3">${escapeHtml(el.content)}</textarea></label>`;
    html += numF('字級', 'fontSize', el.fontSize);
    html += selF('字體', 'fontFamily', el.fontFamily, fontFamilies());
    html += selF('對齊', 'align', el.align, ['left', 'center', 'right']);
    html += colorF('顏色', 'color', el.color);
  } else if (el.type === 'image') {
    html += `<div class="prop"><span>來源</span><b>${el.src}</b></div>`;
    html += selF('裁切', 'fit', el.fit, ['cover', 'contain', 'stretch']);
  } else {
    html += selF('形狀', 'shape', el.shape, ['rect', 'ellipse', 'line']);
    html += colorF('填色', 'fill', el.fill);
    html += colorF('描邊', 'stroke', el.stroke);
    html += numF('描邊寬', 'strokeWidth', el.strokeWidth);
  }
  panel.innerHTML = html;
}

function fontFamilies(): string[] {
  const fams = config.fonts.map((f) => f.family);
  return fams.length > 0 ? fams : ['Noto Sans TC'];
}

function wireProps() {
  const panel = $('#props-body');
  const onEdit = (e: Event) => void applyPropEdit(e);
  panel.addEventListener('change', onEdit);
}

async function applyPropEdit(e: Event) {
  const input = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const key = input.dataset.k as keyof SceneElement | undefined;
  const id = handle.selectedId();
  if (!key || !id) return;
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
  $('#del-btn').onclick = () => void deleteSelected();
  $('#dup-btn').onclick = () => void duplicateSelected();
  ($('#file-input') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void addImage(f);
    (e.target as HTMLInputElement).value = '';
  });
}

async function addText() {
  const fam = fontFamilies()[0]!;
  if (config.fonts.length === 0) {
    alert('專案尚未在 project.json 註冊字體,無法新增文字。');
    return;
  }
  const s = scene();
  const id = genId(s);
  s.elements.push({
    id, type: 'text', x: 80, y: 80, width: 400, rotation: 0,
    content: '雙擊以編輯文字', fontFamily: fam, fontSize: 48, color: '#111111',
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

// ---------- 鍵盤 ----------
function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (typing) return; // 正在輸入(含 fabric 文字編輯的隱藏 textarea)→ 不攔截
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      void duplicateSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void deleteSelected();
    }
  });
}

// ---------- 存檔 ----------
async function save() {
  const s = scene();
  await api(`/api/templates/${encodeURIComponent(templateName)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(s),
  });
  dirty = false;
  $('#save-btn').textContent = '存檔 ✓';
  setTimeout(() => ($('#save-btn').textContent = '存檔'), 1200);
}

// ---------- 小工具 ----------
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function toHex(css: string): string {
  // <input type=color> 只吃 #rrggbb;非此格式(transparent/具名色)退回黑色顯示
  return /^#[0-9a-f]{6}$/i.test(css) ? css : '#000000';
}

void init().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">編輯器啟動失敗:\n${String(e)}</pre>`;
});
