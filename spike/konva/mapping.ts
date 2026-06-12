// Konva 映射層:load(scene)→物件樹、save(物件樹)→scene
// 介面與 fabric/mapping.ts 一致(擂台規則)。
// 旋轉繞中心:以 offsetX/offsetY = 尺寸/2、x/y = 中心點 表示。
// 注:擂台已收官(S01=fabric 勝)。本目錄為供人工體驗/IME 驗證而復活的展示版。

import Konva from 'konva';
import type { Template, SceneElement, TextElement, ImageElement, ShapeElement } from '../../src/core/scene/types.js';
import { decodeImage } from '../shared/gate.js';

const round = (v: number) => Math.round(v * 1e6) / 1e6;

interface TeditAttrs {
  teditId: string;
  teditType: SceneElement['type'];
  teditSrc?: string;
  teditFit?: ImageElement['fit'];
  teditShape?: ShapeElement['shape'];
  teditNaturalW?: number;
  teditNaturalH?: number;
}

export async function load(
  stage: Konva.Stage,
  bgLayer: Konva.Layer,
  mainLayer: Konva.Layer,
  scene: Template,
  assetBase: string,
): Promise<void> {
  bgLayer.destroyChildren();
  mainLayer.destroyChildren();
  stage.size({ width: scene.canvas.width, height: scene.canvas.height });

  if (typeof scene.canvas.background === 'string') {
    bgLayer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: scene.canvas.width,
        height: scene.canvas.height,
        fill: scene.canvas.background,
        listening: false,
      }),
    );
  } else {
    const img = await decodeImage(assetBase + scene.canvas.background.image);
    bgLayer.add(
      new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: scene.canvas.width,
        height: scene.canvas.height,
        listening: false,
      }),
    );
  }

  for (const el of scene.elements) {
    mainLayer.add(await elementToNode(el, assetBase));
  }
  bgLayer.draw();
  mainLayer.draw();
}

async function elementToNode(el: SceneElement, assetBase: string): Promise<Konva.Node> {
  const attrs: TeditAttrs = { teditId: el.id, teditType: el.type };

  if (el.type === 'shape') {
    attrs.teditShape = el.shape;
    const fill = el.fill === 'transparent' ? undefined : el.fill;
    const stroke = el.stroke === 'transparent' ? undefined : el.stroke;
    if (el.shape === 'rect') {
      return new Konva.Rect({
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
        offsetX: el.width / 2,
        offsetY: el.height / 2,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        fill,
        stroke,
        strokeWidth: el.strokeWidth,
        strokeScaleEnabled: false,
        ...attrs,
      });
    }
    if (el.shape === 'ellipse') {
      return new Konva.Ellipse({
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
        radiusX: el.width / 2,
        radiusY: el.height / 2,
        rotation: el.rotation,
        fill,
        stroke,
        strokeWidth: el.strokeWidth,
        ...attrs,
      });
    }
    return new Konva.Line({
      points: [el.x, el.y, el.x + el.width, el.y + el.height],
      rotation: el.rotation,
      stroke,
      strokeWidth: el.strokeWidth,
      ...attrs,
    });
  }

  if (el.type === 'image') {
    attrs.teditSrc = el.src;
    attrs.teditFit = el.fit;
    const img = await decodeImage(assetBase + el.src);
    attrs.teditNaturalW = img.naturalWidth;
    attrs.teditNaturalH = img.naturalHeight;
    const node = new Konva.Image({
      image: img,
      x: el.x + el.width / 2,
      y: el.y + el.height / 2,
      offsetX: el.width / 2,
      offsetY: el.height / 2,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      ...attrs,
    });
    applyFit(node, el.fit, el.width, el.height, img.naturalWidth, img.naturalHeight);
    return node;
  }

  // text:height 由內容推導,不入庫
  const t = el as TextElement;
  const node = new Konva.Text({
    x: 0,
    y: 0,
    width: t.width,
    text: t.content,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    fill: t.color,
    align: t.align,
    lineHeight: t.lineHeight,
    wrap: 'char', // CJK 自動換行;代價:英文單字會被攔腰折斷(風險盤點)
    rotation: t.rotation,
    ...attrs,
  });
  const h = node.height();
  node.offsetX(t.width / 2);
  node.offsetY(h / 2);
  node.x(t.x + t.width / 2);
  node.y(t.y + h / 2);
  return node;
}

/** fit 模式 → Konva 的 crop(source 座標)+ 顯示尺寸 */
function applyFit(
  node: Konva.Image,
  fit: ImageElement['fit'],
  boxW: number,
  boxH: number,
  natW: number,
  natH: number,
): void {
  if (fit === 'stretch') {
    node.crop({ x: 0, y: 0, width: natW, height: natH });
  } else if (fit === 'cover') {
    const scale = Math.max(boxW / natW, boxH / natH);
    const cropW = boxW / scale;
    const cropH = boxH / scale;
    node.crop({ x: (natW - cropW) / 2, y: (natH - cropH) / 2, width: cropW, height: cropH });
  } else {
    // contain:顯示框縮為實際內容框(置中),save 寫回縮後尺寸
    const scale = Math.min(boxW / natW, boxH / natH);
    const w = natW * scale;
    const h = natH * scale;
    node.crop({ x: 0, y: 0, width: natW, height: natH });
    node.width(w);
    node.height(h);
    node.offsetX(w / 2);
    node.offsetY(h / 2);
  }
}

/** transform 後把 scale 烘回 width/height,維持 scale=1 不變量(save 依賴) */
export function bakeScale(node: Konva.Node): void {
  const sx = node.scaleX();
  const sy = node.scaleY();
  if (sx === 1 && sy === 1) return;
  if (node instanceof Konva.Ellipse) {
    node.radiusX(node.radiusX() * sx);
    node.radiusY(node.radiusY() * sy);
  } else {
    node.width(node.width() * sx);
    node.height(node.height() * sy);
    node.offsetX(node.width() / 2);
    node.offsetY(node.height() / 2);
  }
  node.scaleX(1);
  node.scaleY(1);
}

export function save(stage: Konva.Stage, mainLayer: Konva.Layer, scene: Template): Template {
  const out: Template = {
    teditVersion: scene.teditVersion,
    canvas: {
      width: stage.width(),
      height: stage.height(),
      background: scene.canvas.background,
    },
    elements: [],
    bindings: scene.bindings,
  };

  for (const node of mainLayer.getChildren()) {
    const a = node.getAttrs() as TeditAttrs & Record<string, unknown>;
    if (!a.teditId) continue; // Transformer 等非元素節點

    if (a.teditType === 'shape') {
      let w: number, h: number;
      if (node instanceof Konva.Ellipse) {
        w = node.radiusX() * 2;
        h = node.radiusY() * 2;
      } else {
        w = node.width();
        h = node.height();
      }
      out.elements.push({
        id: a.teditId,
        type: 'shape',
        shape: a.teditShape!,
        x: round(node.x() - w / 2),
        y: round(node.y() - h / 2),
        width: round(w),
        height: round(h),
        rotation: round(node.rotation()),
        fill: (node.getAttr('fill') as string | undefined) ?? 'transparent',
        stroke: (node.getAttr('stroke') as string | undefined) ?? 'transparent',
        strokeWidth: node.getAttr('strokeWidth') as number,
      });
    } else if (a.teditType === 'image') {
      const w = node.width();
      const h = node.height();
      out.elements.push({
        id: a.teditId,
        type: 'image',
        x: round(node.x() - w / 2),
        y: round(node.y() - h / 2),
        width: round(w),
        height: round(h),
        rotation: round(node.rotation()),
        src: a.teditSrc!,
        fit: a.teditFit!,
      });
    } else {
      const t = node as Konva.Text;
      const w = t.width();
      const h = t.height();
      out.elements.push({
        id: a.teditId,
        type: 'text',
        x: round(t.x() - w / 2),
        y: round(t.y() - h / 2),
        width: round(w),
        rotation: round(t.rotation()),
        content: t.text(),
        fontFamily: t.fontFamily(),
        fontSize: round(t.fontSize()),
        color: t.fill() as string,
        align: t.align() as TextElement['align'],
        lineHeight: round(t.lineHeight()),
      });
    }
  }
  return out;
}
