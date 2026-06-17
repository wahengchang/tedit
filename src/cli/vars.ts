// tedit vars <template> [--json] — 列出模板變數(S03:讀 bindings 區塊)。
// 欄位:變數名/型別/綁定位置(元素 id+屬性)/設計時預設值;同名綁多處列多行(JSON 為陣列)。
// 掃描邏輯在 core/resolver(vars 與 resolver 共用);本檔只負責呈現(D01:cli 不放核心邏輯)。

import { loadTemplate, resolveTemplateInput } from './shared.js';
import { scanVars } from '../core/resolver/index.js';

export function runVars(templatePath: string, json: boolean): void {
  // D23:接受資料夾(推 template.json)或顯式檔案
  const { templateFile } = resolveTemplateInput(templatePath);
  const scene = loadTemplate(templateFile);
  const entries = scanVars(scene);

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
