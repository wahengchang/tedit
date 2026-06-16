// 多層合成器(D22 階段 2):把一份場景渲染成「一疊 DOM 圖層」。
//   背景    → 最底層(StaticCanvas)
//   每個非-html 元素 → 一個全舞台大小的透明 StaticCanvas(複用 elementToObject)
//   每個 html 元素   → 一個本地 iframe(sandbox=allow-same-origin:禁 script、但守門可讀)
// 依 scene.elements 順序排 z-order(DOM 疊放);跨 document 守門後才發 __renderDone。
//
// 此模組目前提供「view(出圖)」路徑;編輯互動(每元素一互動 canvas)排階段 4。
// 不取代既有單 canvas boot(),兩者並存(strangler);切換在後續階段。

import { StaticCanvas, FabricImage } from 'fabric';
import type { Template } from '../scene/types.js';
import { elementToObject } from './fabric-mapping.js';
import { loadFont, decodeImage, markRenderStart, markRenderDone } from './gate.js';

function layerCanvas(container: HTMLElement, z: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.style.position = 'absolute';
  c.style.left = '0';
  c.style.top = '0';
  c.style.zIndex = String(z);
  container.appendChild(c);
  void w;
  void h;
  return c;
}

/**
 * 把 scene 渲染成多層合成,填進 container。完成後 window.__renderDone 置真(headless 據此截圖)。
 * @param assetBase 資產 URL 前綴(通常 '/')
 */
export async function renderLayers(
  container: HTMLElement,
  scene: Template,
  fontRegistry: Record<string, string>,
  assetBase: string,
): Promise<void> {
  markRenderStart();
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = `${scene.canvas.width}px`;
  container.style.height = `${scene.canvas.height}px`;
  container.style.overflow = 'hidden';

  // 父頁字體(給文字層),要先載
  for (const el of scene.elements) {
    if (el.type !== 'text') continue;
    const url = fontRegistry[el.fontFamily];
    if (!url) throw new Error(`字體未註冊:${el.fontFamily}`);
    await loadFont(el.fontFamily, url);
  }

  // 背景 = 最底層(z 0)
  const bgEl = layerCanvas(container, 0, scene.canvas.width, scene.canvas.height);
  const bgCanvas = new StaticCanvas(bgEl, { backgroundColor: '' });
  bgCanvas.setDimensions({ width: scene.canvas.width, height: scene.canvas.height });
  if (typeof scene.canvas.background === 'string') {
    bgCanvas.backgroundColor = scene.canvas.background;
  } else {
    bgCanvas.backgroundImage = new FabricImage(await decodeImage(assetBase + scene.canvas.background.image));
  }
  bgCanvas.renderAll();

  // 元素層(z 從 1 起,順序 = z-order)
  const iframeGates: Promise<void>[] = [];
  let z = 1;
  for (const el of scene.elements) {
    if (el.type === 'html') {
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute',
        left: `${el.x}px`,
        top: `${el.y}px`,
        width: `${el.width}px`,
        height: `${el.height}px`,
        border: '0',
        zIndex: String(z),
      });
      if (el.rotation) {
        iframe.style.transformOrigin = 'center';
        iframe.style.transform = `rotate(${el.rotation}deg)`;
      }
      // 安全:禁 script;allow-same-origin 保留同源(守門需讀 contentDocument)
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframeGates.push(
        new Promise<void>((resolve) => {
          iframe.addEventListener('load', () => {
            void (async () => {
              try {
                const doc = iframe.contentDocument;
                if (doc) {
                  await doc.fonts.ready;
                  await Promise.all([...doc.images].map((im) => im.decode().catch(() => undefined)));
                }
              } catch {
                // 跨源等例外:略過,仍解除守門(避免卡死)
              }
              resolve();
            })();
          });
        }),
      );
      iframe.src = assetBase + el.src;
      container.appendChild(iframe);
    } else {
      const cEl = layerCanvas(container, z, scene.canvas.width, scene.canvas.height);
      const c = new StaticCanvas(cEl, { backgroundColor: '' });
      c.setDimensions({ width: scene.canvas.width, height: scene.canvas.height });
      c.add(await elementToObject(el, assetBase));
      c.renderAll();
    }
    z++;
  }

  await Promise.all(iframeGates);
  await document.fonts.ready;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  markRenderDone();
}
