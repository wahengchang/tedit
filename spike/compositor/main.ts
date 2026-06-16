// SPIKE:全圖層合成器最小驗證(不碰正式 src/)
// 驗兩件事:
//  ① 逐層交錯:每元素一個 fabric StaticCanvas 當一層 + 一個 iframe 層,DOM 疊放排 z-order
//     疊法(底→頂):矩形 canvas(z0)→ iframe 本地 HTML(z1)→ 文字 canvas(z2)
//  ② 跨 document 守門:等 iframe 自己的 document.fonts.ready + 圖片 decode,才發 __renderDone
// 成功 = 兩次獨立渲染 #stage 截圖 pixelmatch diff=0,且 iframe 內容正確夾在中間。

import { StaticCanvas, Rect, Textbox } from 'fabric';

const FONT_FAMILY = 'Noto Sans TC';
const FONT_URL = '/assets/fonts/NotoSansTC-Regular.otf';
const W = 800;
const H = 500;

declare global {
  interface Window {
    __renderDone: boolean;
  }
}

function makeLayerCanvas(stage: HTMLElement, z: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.style.position = 'absolute';
  c.style.left = '0';
  c.style.top = '0';
  c.style.zIndex = String(z);
  stage.appendChild(c);
  return c;
}

async function loadParentFont(): Promise<void> {
  const face = new FontFace(FONT_FAMILY, `url(${FONT_URL})`);
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
}

async function boot(): Promise<void> {
  window.__renderDone = false;
  const stage = document.getElementById('stage')!;
  stage.style.position = 'relative';
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  stage.style.overflow = 'hidden';
  stage.style.background = '#f4f1ea'; // 確定性底色

  // 父頁字體要先載,文字層才不會先用 fallback 再跳字
  await loadParentFont();

  // ── 層 0(最底):矩形 ──
  const c0 = makeLayerCanvas(stage, 0);
  const rectCanvas = new StaticCanvas(c0, { backgroundColor: '' });
  rectCanvas.setDimensions({ width: W, height: H });
  rectCanvas.add(
    new Rect({
      left: 80, top: 80, width: 640, height: 360,
      fill: '#1e3a5f', stroke: '#c9a86a', strokeWidth: 6,
    }),
  );
  rectCanvas.renderAll();

  // ── 層 1(中間):iframe,本地 HTML 畫的東西(漸層 + 中文 + 本地圖) ──
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.left = '140px';
  iframe.style.top = '120px';
  iframe.style.width = '520px';
  iframe.style.height = '260px';
  iframe.style.border = '0';
  iframe.style.zIndex = '1';
  const iframeReady = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => {
      void (async () => {
        const doc = iframe.contentDocument!;
        // 跨 document 守門:等 iframe 自己的字體 + 圖片
        await doc.fonts.ready;
        await Promise.all([...doc.images].map((img) => img.decode().catch(() => undefined)));
        resolve();
      })();
    });
  });
  iframe.src = '/compositor/bg.html';
  stage.appendChild(iframe);

  // ── 層 2(最頂):文字,故意蓋過 iframe 上緣以證明 z 在 iframe 之上 ──
  const c2 = makeLayerCanvas(stage, 2);
  const textCanvas = new StaticCanvas(c2, { backgroundColor: '' });
  textCanvas.setDimensions({ width: W, height: H });
  const txt = new Textbox('最上層文字 top layer\n蓋過 iframe 證明 z-order', {
    left: 160, top: 150, width: 460,
    fontFamily: FONT_FAMILY, fontSize: 30, fill: '#ffffff',
    textAlign: 'left',
  });
  textCanvas.add(txt);
  textCanvas.renderAll();

  // 守門:等 iframe 完成 + 父頁字體就緒,再多等兩個 RAF 讓最後一次繪製上屏
  await iframeReady;
  await document.fonts.ready;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  window.__renderDone = true;
}

void boot();
