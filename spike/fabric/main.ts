// fabric 原型入口:window.proto 統一介面 + 編輯接線
// mode=edit:互動畫布(選取/拖拉/控制柄/IText);mode=view:StaticCanvas(headless 路徑)

import { Canvas, StaticCanvas } from 'fabric';
import type { Template } from '../../src/core/scene/types.js';
import { load, save } from './mapping.js';
import { loadFont, markRenderStart, markRenderDone } from '../shared/gate.js';

const FONTS: Record<string, string> = {
  'Noto Sans TC': '/assets/fonts/NotoSansTC-Regular.otf',
};

const mode = new URLSearchParams(location.search).get('mode') ?? 'edit';

const stageDiv = document.getElementById('stage')!;
const canvasEl = document.createElement('canvas');
stageDiv.appendChild(canvasEl);

const canvas = mode === 'view' ? new StaticCanvas(canvasEl) : new Canvas(canvasEl);
let currentScene: Template | null = null;

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
    for (const el of scene.elements) {
      if (el.type === 'text') {
        const url = FONTS[el.fontFamily];
        if (!url) throw new Error(`未註冊字體:${el.fontFamily}`);
        await loadFont(el.fontFamily, url);
      }
    }
    await load(canvas, scene, '/');
    markRenderDone();
  },

  save(): Template {
    if (!currentScene) throw new Error('尚未載入場景');
    return save(canvas, currentScene);
  },

  deselect() {
    if (canvas instanceof Canvas) {
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  },

  selectById(id: string) {
    if (!(canvas instanceof Canvas)) return;
    const obj = canvas.getObjects().find((o) => (o as unknown as { teditId: string }).teditId === id);
    if (!obj) throw new Error(`找不到元素:${id}`);
    canvas.setActiveObject(obj);
    canvas.renderAll();
  },
};
