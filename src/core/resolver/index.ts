// resolver(M3):變數注入純函式,零 I/O、不知渲染存在(ARCHITECTURE §3)。
// IN : Scene + 資料 Map;OUT: ResolvedScene + warnings[] + missing[]。
// 缺變數行為(D05):沿用設計時值 + warning;--strict 的報錯(exit 4)由 cli 依 missing 決定。

import type { Template } from '../scene/types.js';

export interface VarLocation {
  element: string;
  prop: 'content' | 'src';
  /** 設計時預設值(D05 fallback 即此值) */
  designValue: string;
}

export interface VarEntry {
  var: string;
  type: 'text' | 'image';
  /** 同名變數綁多處 → 多筆 location */
  locations: VarLocation[];
}

/**
 * 掃描模板變數(vars 指令與工具共用;純函式)。
 * 同名變數聚合成一筆 entry、多個綁定位置列為 locations[]。
 */
export function scanVars(scene: Template): VarEntry[] {
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

export interface ResolveResult {
  /** 注入後的新場景(輸入不被改動) */
  scene: Template;
  /** 人類可讀警告(D04:由呼叫端印到 stderr) */
  warnings: string[];
  /** 未提供值的變數名(去重;strict 模式的判定依據) */
  missing: string[];
}

export function resolveScene(scene: Template, data: Record<string, unknown>): ResolveResult {
  const warnings: string[] = [];
  const missing: string[] = [];
  const out = structuredClone(scene);

  for (const b of out.bindings) {
    const value = data[b.var];
    if (value === undefined || value === null) {
      if (!missing.includes(b.var)) {
        missing.push(b.var);
        warnings.push(`變數 "${b.var}" 未提供,沿用設計時值`);
      }
      continue;
    }
    const el = out.elements.find((e) => e.id === b.element);
    if (!el) continue; // schema 驗證已保證存在;防衛性跳過
    if (b.prop === 'content' && el.type === 'text') {
      el.content = String(value);
    } else if (b.prop === 'src' && el.type === 'image') {
      el.src = String(value);
    }
  }

  const boundVars = new Set(out.bindings.map((b) => b.var));
  for (const key of Object.keys(data)) {
    if (!boundVars.has(key)) warnings.push(`資料鍵 "${key}" 不對應模板任何變數,已忽略`);
  }

  return { scene: out, warnings, missing };
}
