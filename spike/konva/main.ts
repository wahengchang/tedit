// Konva 原型入口:window.proto 統一介面 + 編輯接線
// mode=edit:draggable + Transformer 控制柄 + 雙擊文字 overlay textarea
// mode=view:純渲染(headless 路徑)
// ?demo=1:人工體驗模式(自動載入場景 + 工具列),不影響擂台 harness

import Konva from 'konva';
import type { Template } from '../../src/core/scene/types.js';
import { load, save, bakeScale } from './mapping.js';
import { loadFont, markRenderStart, markRenderDone } from '../shared/gate.js';
import { attachDemoUi } from '../shared/demo-ui.js';

const FONTS: Record<string, string> = {
  'Noto Sans TC': '/assets/fonts/NotoSansTC-Regular.otf',
};

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'edit';

const stage = new Konva.Stage({ container: 'stage', width: 1200, height: 630 });
const bgLayer = new Konva.Layer({ listening: false });
const mainLayer = new Konva.Layer();
const uiLayer = new Konva.Layer();
stage.add(bgLayer, mainLayer, uiLayer);

const transformer = new Konva.Transformer({ rotateEnabled: true });
uiLayer.add(transformer);

let currentScene: Template | null = null;

function wireEditing(): void {
  for (const node of mainLayer.getChildren()) {
    node.draggable(true);
    node.on('transformend', () => bakeScale(node));
  }

  stage.on('click tap', (e) => {
    if (e.target === stage) {
      transformer.nodes([]);
      return;
    }
    if (e.target.getLayer() === mainLayer) transformer.nodes([e.target]);
  });

  // 雙擊文字 → overlay textarea(Konva 無內建文字編輯態)
  stage.on('dblclick dbltap', (e) => {
    if (!(e.target instanceof Konva.Text)) return;
    openTextOverlay(e.target);
  });
}

function openTextOverlay(textNode: Konva.Text): void {
  textNode.hide();
  transformer.nodes([]);

  const stageBox = stage.container().getBoundingClientRect();
  const topLeftX = textNode.x() - textNode.offsetX();
  const topLeftY = textNode.y() - textNode.offsetY();

  const ta = document.createElement('textarea');
  ta.id = 'text-overlay';
  ta.value = textNode.text();
  Object.assign(ta.style, {
    position: 'absolute',
    left: `${stageBox.left + topLeftX}px`,
    top: `${stageBox.top + topLeftY}px`,
    width: `${textNode.width()}px`,
    height: `${textNode.height() + textNode.fontSize()}px`,
    fontFamily: textNode.fontFamily(),
    fontSize: `${textNode.fontSize()}px`,
    lineHeight: String(textNode.lineHeight()),
    color: textNode.fill() as string,
    textAlign: textNode.align() as string,
    background: 'rgba(0,0,0,0.25)',
    border: '1px dashed #999',
    outline: 'none',
    padding: '0',
    margin: '0',
    overflow: 'hidden',
    resize: 'none',
    transformOrigin: 'left top',
    transform: textNode.rotation() ? `rotate(${textNode.rotation()}deg)` : '',
  });
  document.body.appendChild(ta);
  ta.focus();

  const commit = () => {
    // 改字後高度會變:固定 top-left,重算中心與 offset
    const oldTop = textNode.y() - textNode.offsetY();
    textNode.text(ta.value);
    const newH = textNode.height();
    textNode.offsetY(newH / 2);
    textNode.y(oldTop + newH / 2);
    textNode.show();
    mainLayer.draw();
    ta.remove();
  };
  ta.addEventListener('blur', commit);
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      ta.blur();
    }
  });
}

declare global {
  interface Window {
    proto: {
      load(scene: Template): Promise<void>;
      save(): Template;
      deselect(): void;
      selectById(id: string): void;
    };
  }
}

window.proto = {
  async load(scene: Template) {
    markRenderStart();
    currentScene = scene;
    transformer.nodes([]);
    for (const el of scene.elements) {
      if (el.type === 'text') {
        const url = FONTS[el.fontFamily];
        if (!url) throw new Error(`未註冊字體:${el.fontFamily}`);
        await loadFont(el.fontFamily, url);
      }
    }
    await load(stage, bgLayer, mainLayer, scene, '/');
    if (mode === 'edit') wireEditing();
    markRenderDone();
  },

  save(): Template {
    if (!currentScene) throw new Error('尚未載入場景');
    return save(stage, mainLayer, currentScene);
  },

  deselect() {
    transformer.nodes([]);
    uiLayer.draw();
  },

  selectById(id: string) {
    const node = mainLayer.getChildren().find((n) => n.getAttr('teditId') === id);
    if (!node) throw new Error(`找不到元素:${id}`);
    transformer.nodes([node]);
    uiLayer.draw();
  },
};

if (params.has('demo')) attachDemoUi(window.proto, 'Konva 10');
