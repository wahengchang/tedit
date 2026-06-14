// 編輯器前端(M4 stage 1,vanilla TS / S02、深色 Figma 風 / D20)。
// 職責:載入模板 → 畫布編輯(fabric 內建選取/拖拉/控制柄)→ 圖層列表 ↔ 選取同步
//      → 屬性面板顯示/改座標 → 存檔(PUT /api/templates/:name + history)。
// 與 engine.bundle.js 解耦:只透過 window.teditEngine 的 handle API(不直接 import fabric)。

// 型別取自引擎(import type 編譯後抹除,不把 engine 程式碼打進 editor.bundle;
// window.teditEngine 的 global 宣告在 browser-entry.ts,本檔直接沿用)。
import type { Template, SceneElement } from '../../core/scene/types.js';
import type { ProjectConfig } from '../../core/project.js';
import type { EngineHandle } from '../../core/engine/browser-entry.js';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const TYPE_ICON: Record<string, string> = { text: 'T', image: '▦', shape: '◇' };

let handle: EngineHandle;
let templateName = '';
let dirty = false;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

function fontUrls(config: ProjectConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of config.fonts) map[f.family] = '/' + f.file;
  return map;
}

function blankScene(config: ProjectConfig): Template {
  const cd = config.canvasDefaults ?? { width: 1200, height: 630, background: '#ffffff' };
  return { teditVersion: '0.1', canvas: { ...cd }, elements: [], bindings: [] };
}

async function init() {
  const config = await api<ProjectConfig>('/api/project');
  const names = await api<string[]>('/api/templates');
  const wanted = new URLSearchParams(location.search).get('template');
  templateName = wanted && names.includes(wanted) ? wanted : (names[0] ?? 'untitled');

  handle = window.teditEngine.boot('edit', $('#stage'));

  let scene: Template;
  if (names.includes(templateName)) {
    scene = await api<Template>(`/api/templates/${encodeURIComponent(templateName)}`);
  } else {
    scene = blankScene(config);
  }
  await handle.loadScene(scene, fontUrls(config), '/');

  $('#tpl-name').textContent = templateName;
  handle.onChange(() => {
    renderLayers();
    renderProps();
    markDirty();
  });
  renderLayers();
  renderProps();
  wireToolbar();
}

function markDirty() {
  if (dirty) return;
  dirty = true;
  $('#save-btn').textContent = '存檔 *';
}

function renderLayers() {
  const list = $('#layers-list');
  const selected = handle.selectedId();
  const layers = handle.listLayers().slice().reverse(); // 列表由上而下 = z-order 由高到低
  list.innerHTML = '';
  for (const l of layers) {
    const row = document.createElement('div');
    row.className = 'layer-row' + (l.id === selected ? ' selected' : '');
    row.innerHTML = `<span class="layer-icon">${TYPE_ICON[l.type] ?? '?'}</span><span class="layer-id">${l.id}</span>`;
    row.onclick = () => handle.selectById(l.id);
    list.appendChild(row);
  }
  if (layers.length === 0) list.innerHTML = '<div class="empty">（空畫布,尚無元素）</div>';
}

function selectedElement(): SceneElement | null {
  const id = handle.selectedId();
  if (!id) return null;
  return handle.saveScene().elements.find((e) => e.id === id) ?? null;
}

// stage 1:屬性面板為唯讀即時顯示(拖拉/縮放時隨 onChange 更新數值)。
// 可編輯欄位(輸入框雙向綁定)排 stage 2,連同完整屬性與綁定 UI 一起做。
function renderProps() {
  const panel = $('#props-body');
  const el = selectedElement();
  if (!el) {
    panel.innerHTML = '<div class="empty">（未選取元素）</div>';
    return;
  }
  const row = (label: string, val: string | number) =>
    `<div class="prop"><span>${label}</span><b>${val}</b></div>`;
  let html = `<div class="prop-head">${TYPE_ICON[el.type]} ${el.id} <em>${el.type}</em></div>`;
  html += row('X', Math.round(el.x)) + row('Y', Math.round(el.y));
  html += row('寬', Math.round(el.width));
  if (el.type !== 'text') html += row('高', Math.round(el.height));
  html += row('旋轉', `${Math.round(el.rotation)}°`);
  if (el.type === 'text') {
    html += row('字級', el.fontSize) + row('字體', el.fontFamily);
    html += row('內容', el.content.length > 24 ? el.content.slice(0, 23) + '…' : el.content);
  }
  if (el.type === 'image') html += row('來源', el.src) + row('裁切', el.fit);
  if (el.type === 'shape') html += row('形狀', el.shape) + row('填色', el.fill);
  panel.innerHTML = html;
}

function wireToolbar() {
  $('#save-btn').onclick = () => void save();
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      void save();
    }
  });
}

async function save() {
  const scene = handle.saveScene();
  await api(`/api/templates/${encodeURIComponent(templateName)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scene),
  });
  dirty = false;
  $('#save-btn').textContent = '存檔 ✓';
  setTimeout(() => ($('#save-btn').textContent = '存檔'), 1200);
}

void init().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f88;padding:20px">編輯器啟動失敗:\n${String(e)}</pre>`;
});
