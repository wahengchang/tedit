// fabric v7 映射層:load(scene)→物件樹、save(物件樹)→scene
// 來源:M0 spike 勝方原型(S01/D13),粗糙版,M1 整理。

import { Canvas, StaticCanvas, Rect, Ellipse, Line, Textbox, FabricImage, FabricObject } from 'fabric';
import type { Template, SceneElement, TextElement, ImageElement, ShapeElement, HtmlElement } from '../scene/types.js';
import { decodeImage } from './gate.js';

// fabric 行高含內部 _fontSizeMult=1.13 係數;schema lineHeight 是純倍數,映射層吸收。
// (workaround 記錄:風險盤點 d 項)
const FABRIC_LINE_HEIGHT_MULT = 1.13;

const round = (v: number) => Math.round(v * 1e6) / 1e6;

type AnyCanvas = Canvas | StaticCanvas;

interface TeditMeta {
  teditId: string;
  teditType: SceneElement['type'];
  teditSrc?: string;
  teditFit?: ImageElement['fit'];
  teditShape?: ShapeElement['shape'];
  teditNaturalW?: number;
  teditNaturalH?: number;
  /** 圖片設計框(schema 的 width/height)。contain 時物件尺寸=內容框≠設計框,
   *  save 必須以設計框回寫,否則設計意圖靜默遺失(D12 看守點) */
  teditBoxW?: number;
  teditBoxH?: number;
  /** 載入時 applyFit 設定的 scale;save 以 scaleX/teditLoadScaleX 還原使用者縮放倍率 */
  teditLoadScaleX?: number;
  teditLoadScaleY?: number;
  /** html 元素的內容(編輯器用佔位框表示;save 原樣保留,不入畫布渲染) */
  teditHtml?: string;
}

export async function load(canvas: AnyCanvas, scene: Template, assetBase: string): Promise<void> {
  canvas.clear();
  canvas.setDimensions({ width: scene.canvas.width, height: scene.canvas.height });
  if (typeof scene.canvas.background === 'string') {
    canvas.backgroundColor = scene.canvas.background;
  } else {
    const img = await decodeImage(assetBase + scene.canvas.background.image);
    canvas.backgroundImage = new FabricImage(img);
  }

  for (const el of scene.elements) {
    // 編輯器單 canvas:html 以佔位框表示(可拖/縮放/正確 z-order;真內容在 headless 出圖)
    const obj = el.type === 'html' ? htmlPlaceholder(el) : await elementToObject(el, assetBase);
    canvas.add(obj);
  }
  canvas.renderAll();
}

/** html 元素 → 畫布上的佔位框(虛線 + 標籤);內容存 meta,save 原樣保留 */
function htmlPlaceholder(el: HtmlElement): FabricObject {
  const meta: TeditMeta = { teditId: el.id, teditType: 'html' };
  if (typeof el.src === 'string') meta.teditSrc = el.src;
  if (typeof el.html === 'string') meta.teditHtml = el.html;
  const rect = new Rect({
    originX: 'center',
    originY: 'center',
    left: el.x + el.width / 2,
    top: el.y + el.height / 2,
    width: el.width,
    height: el.height,
    angle: el.rotation,
    fill: 'rgba(120,120,140,0.18)',
    stroke: '#8a8aa0',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    strokeUniform: true,
  });
  rect.set(meta as unknown as Record<string, unknown>);
  return rect;
}

/** schema 元素 → fabric 物件(單一元素;合成器逐層用,故 export)。html 不走 fabric。 */
export async function elementToObject(el: SceneElement, assetBase: string): Promise<FabricObject> {
  // html 元素由「多層合成器」用 iframe 渲染(D22),不走 fabric 物件(合成器路徑會跳過此函式)。
  if (el.type === 'html') {
    throw new Error('html 元素不走 fabric(由合成器以 iframe 渲染)');
  }
  const meta: TeditMeta = { teditId: el.id, teditType: el.type };

  if (el.type === 'shape') {
    meta.teditShape = el.shape;
    const common = {
      originX: 'center' as const,
      originY: 'center' as const,
      left: el.x + el.width / 2,
      top: el.y + el.height / 2,
      angle: el.rotation,
      fill: el.fill === 'transparent' ? '' : el.fill,
      stroke: el.stroke === 'transparent' ? '' : el.stroke,
      strokeWidth: el.strokeWidth,
      strokeUniform: true,
    };
    let obj: FabricObject;
    if (el.shape === 'rect') {
      obj = new Rect({ ...common, width: el.width, height: el.height });
    } else if (el.shape === 'ellipse') {
      obj = new Ellipse({ ...common, rx: el.width / 2, ry: el.height / 2 });
    } else {
      obj = new Line([el.x, el.y, el.x + el.width, el.y + el.height], {
        originX: 'center',
        originY: 'center',
        angle: el.rotation,
        stroke: common.stroke,
        strokeWidth: el.strokeWidth,
      });
    }
    obj.set(meta as unknown as Record<string, unknown>);
    return obj;
  }

  if (el.type === 'image') {
    meta.teditSrc = el.src;
    meta.teditFit = el.fit;
    const imgEl = await decodeImage(assetBase + el.src);
    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;
    meta.teditNaturalW = natW;
    meta.teditNaturalH = natH;
    const obj = new FabricImage(imgEl, {
      originX: 'center',
      originY: 'center',
      left: el.x + el.width / 2,
      top: el.y + el.height / 2,
      angle: el.rotation,
    });
    applyFit(obj, el.fit, el.width, el.height, natW, natH);
    meta.teditBoxW = el.width;
    meta.teditBoxH = el.height;
    meta.teditLoadScaleX = obj.scaleX;
    meta.teditLoadScaleY = obj.scaleY;
    obj.set(meta as unknown as Record<string, unknown>);
    return obj;
  }

  // text:height 由內容推導,不入庫
  const t = el as TextElement;
  const obj = new Textbox(t.content, {
    width: t.width,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    fill: t.color,
    textAlign: t.align,
    lineHeight: t.lineHeight / FABRIC_LINE_HEIGHT_MULT,
    splitByGrapheme: true, // CJK 自動換行;代價:英文單字會被攔腰折斷(風險盤點)
  });
  obj.set({
    originX: 'center',
    originY: 'center',
    left: t.x + t.width / 2,
    top: t.y + obj.height / 2,
    angle: t.rotation,
  });
  obj.set(meta as unknown as Record<string, unknown>);
  return obj;
}

/** fit 模式 → fabric 的 crop + scale(cover 置中裁切) */
function applyFit(
  obj: FabricImage,
  fit: ImageElement['fit'],
  boxW: number,
  boxH: number,
  natW: number,
  natH: number,
): void {
  if (fit === 'stretch') {
    obj.set({ cropX: 0, cropY: 0, width: natW, height: natH, scaleX: boxW / natW, scaleY: boxH / natH });
  } else if (fit === 'cover') {
    const scale = Math.max(boxW / natW, boxH / natH);
    const cropW = boxW / scale;
    const cropH = boxH / scale;
    obj.set({
      cropX: (natW - cropW) / 2,
      cropY: (natH - cropH) / 2,
      width: cropW,
      height: cropH,
      scaleX: scale,
      scaleY: scale,
    });
  } else {
    // contain:置中、不裁切(顯示框=實際內容框,save 時寫回縮後尺寸)
    const scale = Math.min(boxW / natW, boxH / natH);
    obj.set({ cropX: 0, cropY: 0, width: natW, height: natH, scaleX: scale, scaleY: scale });
  }
}

export function save(canvas: AnyCanvas, scene: Template): Template {
  const out: Template = {
    teditVersion: scene.teditVersion,
    canvas: {
      width: canvas.width!,
      height: canvas.height!,
      background:
        typeof scene.canvas.background === 'string'
          ? (canvas.backgroundColor as string)
          : scene.canvas.background,
    },
    elements: [],
    bindings: scene.bindings,
  };

  for (const obj of canvas.getObjects()) {
    const m = obj as unknown as TeditMeta & FabricObject;
    const dispW = round(m.width * m.scaleX);
    const dispH = round(m.height * m.scaleY);
    const cx = m.left;
    const cy = m.top;
    const base = {
      id: m.teditId,
      x: round(cx - dispW / 2),
      y: round(cy - dispH / 2),
      rotation: round(m.angle),
    };

    if (m.teditType === 'html') {
      const htmlEl: HtmlElement = { ...base, type: 'html', width: dispW, height: dispH };
      if (m.teditHtml !== undefined) htmlEl.html = m.teditHtml;
      else htmlEl.src = m.teditSrc!;
      out.elements.push(htmlEl);
    } else if (m.teditType === 'shape') {
      out.elements.push({
        ...base,
        type: 'shape',
        shape: m.teditShape!,
        width: dispW,
        height: dispH,
        // line 的 fill 無效(schema 規定),不回寫 fabric 的預設黑
        fill: m.teditShape === 'line' ? 'transparent' : (((m.fill as string) || 'transparent') as string),
        stroke: ((m.stroke as string) || 'transparent') as string,
        strokeWidth: m.strokeWidth,
      });
    } else if (m.teditType === 'image') {
      // 以「設計框 × 使用者縮放倍率」回寫:contain 時物件尺寸是內容框≠設計框,
      // 直接回寫會把設計意圖靜默改掉(本 bug 由往返測試抓出,D12 生效實例)
      const userSx = m.scaleX / m.teditLoadScaleX!;
      const userSy = m.scaleY / m.teditLoadScaleY!;
      const boxW = round(m.teditBoxW! * userSx);
      const boxH = round(m.teditBoxH! * userSy);
      out.elements.push({
        id: m.teditId,
        x: round(cx - boxW / 2),
        y: round(cy - boxH / 2),
        rotation: round(m.angle),
        type: 'image',
        width: boxW,
        height: boxH,
        src: m.teditSrc!,
        fit: m.teditFit!,
      });
    } else {
      const t = m as unknown as Textbox & TeditMeta;
      out.elements.push({
        id: m.teditId,
        type: 'text',
        x: round(cx - (t.width * t.scaleX) / 2),
        y: round(cy - (t.height * t.scaleY) / 2),
        rotation: round(t.angle),
        width: round(t.width * t.scaleX),
        content: t.text,
        fontFamily: t.fontFamily,
        fontSize: round(t.fontSize * t.scaleX),
        color: t.fill as string,
        align: t.textAlign as TextElement['align'],
        lineHeight: round(t.lineHeight * FABRIC_LINE_HEIGHT_MULT),
      });
    }
  }
  return out;
}
