// engine.bundle.js 入口 — 編輯器頁與 headless 頁共用同一份 bundle(D06/D11 結構保證)。
// 對頁面暴露 window.teditEngine;渲染完成信號 = window.__renderDone(守門後才置真)。

import { Canvas, StaticCanvas } from 'fabric';
import type { Template } from '../scene/types.js';
import { load, save } from './fabric-mapping.js';
import { loadFont, markRenderStart, markRenderDone } from './gate.js';

export interface EngineHandle {
  loadScene(scene: Template, fontRegistry: Record<string, string>, assetBase: string): Promise<void>;
  saveScene(): Template;
  deselect(): void;
  /** 底層 fabric 畫布(編輯器接線用;headless 不碰) */
  canvas: Canvas | StaticCanvas;
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
  };
}

declare global {
  interface Window {
    teditEngine: { boot: typeof boot };
  }
}

window.teditEngine = { boot };
