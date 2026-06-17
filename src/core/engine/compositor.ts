// 多層合成器(D22 階段 2):把一份場景渲染成「一疊 DOM 圖層」。
//   背景    → 最底層(StaticCanvas)
//   每個非-html 元素 → 一個全舞台大小的透明 StaticCanvas(複用 elementToObject)
//   每個 html 元素   → 一個本地 iframe(sandbox=allow-same-origin allow-scripts:跑 JS,守門可讀)
// 依 scene.elements 順序排 z-order(DOM 疊放);跨 document 守門後才發 __renderDone。
//
// HTML/JS 圖層守門(D6 settle gate),每個 iframe 載入後等到「畫穩」才放行:
//   fonts.ready + images.decode → waitSettled():
//     ① win.__ready===true(作者/AI 主動舉手;非同步繪圖首選)
//     ② 連續 3 個 rAF 沒有 DOM 變動(同步/DOM 類:畫完就靜置)
//     ③ 硬期限 5s(內容理論上可永遠跑,絕不卡死)
//   ⚠ 純 canvas 的「非同步」繪圖不動 DOM、靜置偵測不到 → 必須用 window.__ready。
//
// 此模組提供「view(出圖)」路徑;編輯互動排階段 4。與單 canvas boot() 並存(strangler)。

import { StaticCanvas, FabricImage } from 'fabric';
import type { Template } from '../scene/types.js';
import { elementToObject } from './fabric-mapping.js';
import { loadFont, decodeImage, markRenderStart, markRenderDone } from './gate.js';

// D6 settle gate:等 HTML/JS 圖層「畫穩」才解除守門。三條規則取最先到達者。
function waitSettled(win: Window, doc: Document): Promise<void> {
  const DEADLINE_MS = 5000;
  const QUIET_FRAMES = 3;
  return new Promise<void>((resolve) => {
    let done = false;
    let quiet = 0;
    const start = performance.now();
    const finish = () => {
      if (done) return;
      done = true;
      obs.disconnect();
      resolve();
    };
    const obs = new MutationObserver(() => {
      quiet = 0; // 有變動 → 重數靜置
    });
    obs.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      if (done) return;
      if ((win as unknown as { __ready?: boolean }).__ready === true) return finish(); // ① 信號
      if (performance.now() - start > DEADLINE_MS) return finish(); // ③ 硬期限
      quiet += 1;
      if (quiet >= QUIET_FRAMES) return finish(); // ② 連續無變動 = 畫穩
      win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  });
}

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
      // allow-scripts:跑 JS(E2;D4 本地工具,安全暫不考量)。allow-same-origin:守門需讀 contentDocument。
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      iframeGates.push(
        new Promise<void>((resolve) => {
          iframe.addEventListener('load', () => {
            void (async () => {
              try {
                const doc = iframe.contentDocument;
                const win = iframe.contentWindow;
                if (doc && win) {
                  await doc.fonts.ready;
                  await Promise.all([...doc.images].map((im) => im.decode().catch(() => undefined)));
                  await waitSettled(win, doc); // D6:等 JS/非同步畫穩
                }
              } catch {
                // 跨源等例外:略過,仍解除守門(避免卡死)
              }
              resolve();
            })();
          });
        }),
      );
      // 內嵌代碼 → srcdoc;本地檔 → src(擇一,schema 已驗)
      if (typeof el.html === 'string') iframe.srcdoc = el.html;
      else iframe.src = assetBase + el.src!;
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
