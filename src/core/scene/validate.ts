// scene-core 驗證器 — SPEC-SCENE-SCHEMA §3
// 手寫驗證(零依賴);錯誤訊息定位到元素 id + 欄位名,供 exit 3 時 stderr 輸出。
// 寬容原則:未知欄位報錯拒絕(嚴格模式),防映射層 save 遺漏被掩蓋(D12)。

import type { Template, SceneElement } from './types.js';

export interface ValidationError {
  /** 出錯位置,如 "canvas.width"、"elements[2](el_x3) .fontSize" */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /** ok 時為驗證過的 Template */
  template?: Template;
}

const TOP_KEYS = ['teditVersion', 'canvas', 'elements', 'bindings'];
const CANVAS_KEYS = ['width', 'height', 'background'];
const BASE_KEYS = ['id', 'type', 'x', 'y', 'rotation'];
// 文字元素不存 height(高度由內容推導,見 types.ts 註記)
const KEYS_BY_TYPE: Record<string, string[]> = {
  text: [...BASE_KEYS, 'width', 'content', 'fontFamily', 'fontSize', 'color', 'align', 'lineHeight'],
  image: [...BASE_KEYS, 'width', 'height', 'src', 'fit'],
  shape: [...BASE_KEYS, 'width', 'height', 'shape', 'fill', 'stroke', 'strokeWidth'],
  html: [...BASE_KEYS, 'width', 'height', 'src'],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateTemplate(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  if (!isObject(input)) {
    return { ok: false, errors: [{ path: '$', message: '模板必須是 JSON 物件' }] };
  }

  for (const key of Object.keys(input)) {
    if (!TOP_KEYS.includes(key)) err(key, `未知欄位(schema 嚴格模式拒絕)`);
  }

  if (typeof input.teditVersion !== 'string') err('teditVersion', '必須是字串');

  // canvas
  if (!isObject(input.canvas)) {
    err('canvas', '必須是物件');
  } else {
    const c = input.canvas;
    for (const key of Object.keys(c)) {
      if (!CANVAS_KEYS.includes(key)) err(`canvas.${key}`, '未知欄位');
    }
    if (!isFiniteNumber(c.width) || c.width <= 0) err('canvas.width', '必須是正數');
    if (!isFiniteNumber(c.height) || c.height <= 0) err('canvas.height', '必須是正數');
    const bg = c.background;
    const bgOk =
      typeof bg === 'string' ||
      (isObject(bg) && typeof bg.image === 'string' && Object.keys(bg).length === 1);
    if (!bgOk) err('canvas.background', '必須是 CSS 色值字串或 { image: 路徑 }');
  }

  // elements
  if (!Array.isArray(input.elements)) {
    err('elements', '必須是陣列');
  } else {
    const seenIds = new Set<string>();
    input.elements.forEach((el, i) => {
      validateElement(el, i, seenIds, err);
    });
  }

  // bindings(S03/D15)
  if (!Array.isArray(input.bindings)) {
    err('bindings', '必須是陣列');
  } else if (Array.isArray(input.elements)) {
    validateBindings(input.bindings, input.elements, err);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], template: input as unknown as Template };
}

function validateElement(
  el: unknown,
  index: number,
  seenIds: Set<string>,
  err: (path: string, message: string) => void,
): void {
  const at = (field: string) => {
    const id = isObject(el) && typeof el.id === 'string' ? `(${el.id})` : '';
    return `elements[${index}]${id}.${field}`;
  };

  if (!isObject(el)) {
    err(`elements[${index}]`, '必須是物件');
    return;
  }

  if (typeof el.id !== 'string' || el.id.length === 0) {
    err(at('id'), '必須是非空字串');
  } else if (seenIds.has(el.id)) {
    err(at('id'), `id 重複:"${el.id}"`);
  } else {
    seenIds.add(el.id);
  }

  const type = el.type;
  if (type !== 'text' && type !== 'image' && type !== 'shape' && type !== 'html') {
    err(at('type'), '必須是 "text" | "image" | "shape" | "html"');
    return;
  }

  for (const key of Object.keys(el)) {
    if (!KEYS_BY_TYPE[type]!.includes(key)) err(at(key), '未知欄位(schema 嚴格模式拒絕)');
  }

  for (const f of ['x', 'y'] as const) {
    if (!isFiniteNumber(el[f])) err(at(f), '必須是數字');
  }
  if (!isFiniteNumber(el.width) || (el.width as number) <= 0) err(at('width'), '必須是正數');
  if (type !== 'text' && (!isFiniteNumber(el.height) || (el.height as number) <= 0))
    err(at('height'), '必須是正數');
  if (!isFiniteNumber(el.rotation)) err(at('rotation'), '必須是數字(度)');

  if (type === 'text') {
    if (typeof el.content !== 'string') err(at('content'), '必須是字串');
    if (typeof el.fontFamily !== 'string' || el.fontFamily.length === 0)
      err(at('fontFamily'), '必須是非空字串');
    if (!isFiniteNumber(el.fontSize) || (el.fontSize as number) <= 0)
      err(at('fontSize'), '必須是正數');
    if (typeof el.color !== 'string') err(at('color'), '必須是 CSS 色值字串');
    if (el.align !== 'left' && el.align !== 'center' && el.align !== 'right')
      err(at('align'), '必須是 "left" | "center" | "right"');
    if (!isFiniteNumber(el.lineHeight) || (el.lineHeight as number) <= 0)
      err(at('lineHeight'), '必須是正數(倍數)');
  } else if (type === 'image') {
    if (typeof el.src !== 'string' || el.src.length === 0) err(at('src'), '必須是非空路徑字串');
    if (el.fit !== 'cover' && el.fit !== 'contain' && el.fit !== 'stretch')
      err(at('fit'), '必須是 "cover" | "contain" | "stretch"');
  } else if (type === 'shape') {
    if (el.shape !== 'rect' && el.shape !== 'ellipse' && el.shape !== 'line')
      err(at('shape'), '必須是 "rect" | "ellipse" | "line"');
    if (typeof el.fill !== 'string') err(at('fill'), '必須是 CSS 色值字串或 "transparent"');
    if (typeof el.stroke !== 'string') err(at('stroke'), '必須是 CSS 色值字串或 "transparent"');
    if (!isFiniteNumber(el.strokeWidth) || (el.strokeWidth as number) < 0)
      err(at('strokeWidth'), '必須是 >= 0 的數字');
  } else if (type === 'html') {
    if (typeof el.src !== 'string' || el.src.length === 0)
      err(at('src'), '必須是非空路徑字串(本地 HTML 檔)');
  }
}

const BINDING_KEYS = ['var', 'element', 'prop', 'type'];
const PROP_RULES: Record<string, { elementType: string; varType: string }> = {
  content: { elementType: 'text', varType: 'text' },
  src: { elementType: 'image', varType: 'image' },
};

function validateBindings(
  bindings: unknown[],
  elements: unknown[],
  err: (path: string, message: string) => void,
): void {
  const elTypeById = new Map<string, string>();
  for (const e of elements) {
    if (isObject(e) && typeof e.id === 'string' && typeof e.type === 'string')
      elTypeById.set(e.id, e.type);
  }
  const varTypes = new Map<string, string>();
  const boundTargets = new Set<string>();

  bindings.forEach((b, i) => {
    const at = (f: string) => `bindings[${i}].${f}`;
    if (!isObject(b)) {
      err(`bindings[${i}]`, '必須是物件');
      return;
    }
    for (const key of Object.keys(b)) {
      if (!BINDING_KEYS.includes(key)) err(at(key), '未知欄位(schema 嚴格模式拒絕)');
    }
    if (typeof b.var !== 'string' || b.var.length === 0) err(at('var'), '必須是非空字串');
    if (typeof b.prop !== 'string' || !(b.prop in PROP_RULES)) {
      err(at('prop'), '必須是 "content" | "src"');
      return;
    }
    const rule = PROP_RULES[b.prop]!;
    if (typeof b.element !== 'string' || !elTypeById.has(b.element)) {
      err(at('element'), `找不到元素 id:"${String(b.element)}"`);
    } else if (elTypeById.get(b.element) !== rule.elementType) {
      err(at('prop'), `"${b.prop}" 只能綁 ${rule.elementType} 元素(${b.element} 是 ${elTypeById.get(b.element)})`);
    }
    if (b.type !== rule.varType) err(at('type'), `prop "${b.prop}" 的型別必須是 "${rule.varType}"`);

    if (typeof b.var === 'string') {
      const prev = varTypes.get(b.var);
      if (prev && prev !== rule.varType) {
        err(at('type'), `同名變數 "${b.var}" 型別衝突(先前為 ${prev})`);
      }
      varTypes.set(b.var, rule.varType);
    }
    if (typeof b.element === 'string') {
      const target = `${b.element}#${b.prop}`;
      if (boundTargets.has(target)) err(at('element'), `(${b.element}, ${b.prop}) 被重複綁定`);
      boundTargets.add(target);
    }
  });
}

/**
 * 語義驗證的字體部分獨立出來:模板引用的 fontFamily 是否都可解析。
 * 註冊表 = project.json fonts[] 的 family 名單 + 內建預設字。
 * 缺字體 → cli exit 5(D09),故與結構驗證(exit 3)分開回報。
 */
export function findUnresolvedFonts(template: Template, registeredFamilies: string[]): string[] {
  const known = new Set(registeredFamilies);
  const missing = new Set<string>();
  for (const el of template.elements) {
    if (el.type === 'text' && !known.has(el.fontFamily)) missing.add(el.fontFamily);
  }
  return [...missing];
}

export type { SceneElement };
