// tedit vars <template> [--json] — 列出模板變數(S03:讀 bindings 區塊)。
// 欄位:變數名/型別/綁定位置(元素 id+屬性)/設計時預設值;同名綁多處列多行(JSON 為陣列)。

import { loadTemplate } from './shared.js';
import type { Template } from '../core/scene/types.js';

interface VarLocation {
  element: string;
  prop: string;
  designValue: string;
}

interface VarEntry {
  var: string;
  type: string;
  locations: VarLocation[];
}

export function collectVars(scene: Template): VarEntry[] {
  const byVar = new Map<string, VarEntry>();
  for (const b of scene.bindings) {
    const el = scene.elements.find((e) => e.id === b.element);
    let designValue = '';
    if (el?.type === 'text' && b.prop === 'content') designValue = el.content;
    if (el?.type === 'image' && b.prop === 'src') designValue = el.src;
    const entry = byVar.get(b.var) ?? { var: b.var, type: b.type, locations: [] };
    entry.locations.push({ element: b.element, prop: b.prop, designValue });
    byVar.set(b.var, entry);
  }
  return [...byVar.values()];
}

export function runVars(templatePath: string, json: boolean): void {
  const scene = loadTemplate(templatePath);
  const entries = collectVars(scene);

  if (json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  if (entries.length === 0) {
    console.log('(此模板沒有綁定任何變數)');
    return;
  }
  const rows: string[][] = [['變數名', '型別', '綁定位置', '設計時預設值']];
  for (const e of entries) {
    for (const loc of e.locations) {
      const preview = loc.designValue.length > 40 ? loc.designValue.slice(0, 39) + '…' : loc.designValue;
      rows.push([e.var, e.type, `${loc.element}.${loc.prop}`, preview]);
    }
  }
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => visualWidth(r[c]!))));
  for (const r of rows) {
    console.log(r.map((cell, c) => cell + ' '.repeat(widths[c]! - visualWidth(cell))).join('  '));
  }
}

/** CJK 全形字寬 2,維持表格對齊 */
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-￦]/.test(ch) ? 2 : 1;
  return w;
}
