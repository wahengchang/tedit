// engine.bundle.js 入口 — 編輯器頁與 headless 頁共用同一份 bundle(D06/D11 結構保證)。
// 對頁面暴露 window.teditEngine;渲染完成信號 = window.__renderDone(守門後才置真)。

import { Canvas, StaticCanvas, Pattern, type FabricObject } from 'fabric';
import type { Template, SceneElement } from '../scene/types.js';
import { load, save } from './fabric-mapping.js';
import { loadFont, markRenderStart, markRenderDone } from './gate.js';
import { renderLayers } from './compositor.js';

/** 圖層列表項(編輯器左欄用) */
export interface LayerInfo {
  id: string;
  type: SceneElement['type'];
}

export interface EngineHandle {
  loadScene(scene: Template, fontRegistry: Record<string, string>, assetBase: string): Promise<void>;
  saveScene(): Template;
  deselect(): void;
  /** 底層 fabric 畫布(編輯器接線用;headless 不碰) */
  canvas: Canvas | StaticCanvas;

  // --- 編輯器專用 API(M4;headless 路徑永不呼叫,不影響同像素)---
  /** 圖層列表,陣列順序 = z-order(索引 0 在最底,與 schema 一致) */
  listLayers(): LayerInfo[];
  /** 依 id 選取元素 */
  selectById(id: string): void;
  /** 目前選取的元素 id(無選取為 null) */
  selectedId(): string | null;
  /** 訂閱「選取或物件變動」事件;回傳取消訂閱函式 */
  onChange(cb: () => void): () => void;
  /**
   * 編輯器:把 html 圖層佔位框的填充換成「即時渲染好的透明 PNG」(WYSIWYG);
   * imageUrl=null → 還原虛線佔位框。內容點陣化成 fabric Pattern → z-order/控制柄/存檔都不變。
   */
  setHtmlPreview(id: string, imageUrl: string | null): Promise<void>;
}

function teditId(obj: FabricObject): string | undefined {
  return (obj as unknown as { teditId?: string }).teditId;
}

function boot(mode: 'edit' | 'view', container: HTMLElement): EngineHandle {
  const canvasEl = document.createElement('canvas');
  container.appendChild(canvasEl);
  const canvas = mode === 'view' ? new StaticCanvas(canvasEl) : new Canvas(canvasEl);
  let currentScene: Template | null = null;

  return {
    canvas,
    async loadScene(scene, fontRegistry, assetBase) {
      markRenderStart();
      currentScene = scene;
      // 容器鎖成場景尺寸:inline canvas 的 baseline 縫隙會讓容器多 ~4px 高,
      // 截圖尺寸就不等於場景尺寸(同像素破口)
      container.style.width = `${scene.canvas.width}px`;
      container.style.height = `${scene.canvas.height}px`;
      container.style.overflow = 'hidden';
      for (const el of scene.elements) {
        if (el.type !== 'text') continue;
        const url = fontRegistry[el.fontFamily];
        if (!url) throw new Error(`字體未註冊:${el.fontFamily}`);
        await loadFont(el.fontFamily, url);
      }
      await load(canvas, scene, assetBase);
      markRenderDone();
    },
    saveScene() {
      if (!currentScene) throw new Error('尚未載入場景');
      return save(canvas, currentScene);
    },
    deselect() {
      if (canvas instanceof Canvas) {
        canvas.discardActiveObject();
        canvas.renderAll();
      }
    },

    listLayers() {
      const out: LayerInfo[] = [];
      for (const obj of canvas.getObjects()) {
        const id = teditId(obj);
        const type = (obj as unknown as { teditType?: SceneElement['type'] }).teditType;
        if (id && type) out.push({ id, type });
      }
      return out;
    },
    selectById(id) {
      if (!(canvas instanceof Canvas)) return;
      const obj = canvas.getObjects().find((o) => teditId(o) === id);
      if (!obj) return;
      canvas.setActiveObject(obj);
      canvas.renderAll();
    },
    selectedId() {
      if (!(canvas instanceof Canvas)) return null;
      const active = canvas.getActiveObject();
      return active ? (teditId(active) ?? null) : null;
    },
    onChange(cb) {
      if (!(canvas instanceof Canvas)) return () => {};
      // 含文字行內編輯事件(雙擊改字後刷新屬性/標記 dirty)
      const events = [
        'selection:created',
        'selection:updated',
        'selection:cleared',
        'object:modified',
        'text:changed',
        'text:editing:exited',
      ] as const;
      for (const e of events) canvas.on(e, cb);
      return () => {
        for (const e of events) canvas.off(e, cb);
      };
    },
    async setHtmlPreview(id, imageUrl) {
      if (!(canvas instanceof Canvas)) return;
      const obj = canvas.getObjects().find((o) => teditId(o) === id);
      if (!obj) return;
      if (!imageUrl) {
        // 還原虛線佔位框(與 fabric-mapping.htmlPlaceholder 一致)
        obj.set({ fill: 'rgba(120,120,140,0.18)', stroke: '#8a8aa0', strokeDashArray: [6, 4] });
        canvas.requestRenderAll();
        return;
      }
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('preview image load failed'));
        im.src = imageUrl;
      });
      // 把縮放「烘平」回 scale=1:用控制柄縮放後,物件是 width 不變、scaleX≠1;
      // 但新 PNG 是依「顯示尺寸」算的,若不烘平,pattern(no-repeat)只會填到角落 → 內容縮在左上。
      // 烘平成 width=顯示尺寸、scale=1(origin=center 故位置不變),pattern 才剛好鋪滿。
      const m = obj as unknown as { width: number; height: number; scaleX: number; scaleY: number };
      const w = m.width * m.scaleX;
      const h = m.height * m.scaleY;
      // 透明 PNG → Pattern 填進佔位框:仍是同一物件,z-order/控制柄/save 全不變
      obj.set({
        width: w,
        height: h,
        scaleX: 1,
        scaleY: 1,
        fill: new Pattern({ source: img, repeat: 'no-repeat' }),
        stroke: 'rgba(138,138,160,0.45)',
        strokeDashArray: [],
      });
      obj.setCoords();
      canvas.requestRenderAll();
    },
  };
}

declare global {
  interface Window {
    teditEngine: { boot: typeof boot; renderLayers: typeof renderLayers };
  }
}

// boot:既有單 canvas(v1)。renderLayers:多層合成器(D22 階段 2,view 路徑)。並存。
window.teditEngine = { boot, renderLayers };
