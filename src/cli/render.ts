// tedit render <template> <data> [-o out.png] [--scale n] [--strict]
// 全鏈路:讀檔→驗證→resolve(變數注入)→headless→寫 PNG→stdout 只印絕對路徑(D04)。

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadTemplate, resolveTemplateInput, loadProjectConfig, CliError, EXIT } from './shared.js';
import { buildFontRegistry } from '../core/project.js';
import { findUnresolvedFonts } from '../core/scene/validate.js';
import { resolveScene } from '../core/resolver/index.js';
import { renderScenePng, AssetLoadError } from './headless/render-png.js';
import type { Template } from '../core/scene/types.js';

export interface RenderArgs {
  /** D23:資料夾(推 template.json)或顯式 .json 模板檔 */
  template: string;
  /** 可選資料檔;省略 = 空資料(全走設計時值) */
  data?: string;
  out: string;
  scale: number;
  strict: boolean;
  /** 明確指定專案根(web /api/render 用;不給則 = 模板所在資料夾)。 */
  projectDir?: string;
}

export async function runRender(args: RenderArgs): Promise<void> {
  // D23:input 可為資料夾(推 template.json)或顯式檔案;專案根 = 模板所在資料夾(--dir 可覆寫)
  const { projectDir: inferredDir, templateFile } = resolveTemplateInput(args.template);
  const scene = loadTemplate(templateFile);
  const projectDir = args.projectDir ? path.resolve(args.projectDir) : inferredDir;
  const config = loadProjectConfig(projectDir);
  const fontRegistry = buildFontRegistry(config);

  // 字體規則(D09):不在註冊表(含內建字)或檔案不存在 → exit 5,不靜默 fallback
  const missing = findUnresolvedFonts(scene, Object.keys(fontRegistry));
  if (missing.length > 0) {
    throw new CliError(EXIT.ASSET, `模板引用的字體未註冊(且非內建字):${missing.join('、')}`);
  }
  // 只驗專案自帶字體檔存在;內建字隨 dist 打包,缺檔會在渲染守門時報 exit 5
  for (const f of config.fonts) {
    if (!existsSync(path.join(projectDir, f.file))) {
      throw new CliError(EXIT.ASSET, `字體檔不存在:${f.family} → ${f.file}`);
    }
  }

  // 資料檔(D23:可選;省略 = 空資料,全走設計時值)
  let data: Record<string, unknown> = {};
  let dataDir = projectDir;
  if (args.data) {
    if (!existsSync(args.data)) {
      throw new CliError(EXIT.OTHER, `資料檔不存在:${args.data}`);
    }
    let rawData: unknown;
    try {
      rawData = yaml.load(readFileSync(args.data, 'utf8')) ?? {};
    } catch (e) {
      throw new CliError(EXIT.OTHER, `資料檔解析失敗:${e instanceof Error ? e.message : e}`);
    }
    if (typeof rawData !== 'object' || rawData === null || Array.isArray(rawData)) {
      throw new CliError(EXIT.OTHER, '資料檔必須是 key→value 的對應(物件)');
    }
    data = rawData as Record<string, unknown>;
    dataDir = path.dirname(path.resolve(args.data));
  }

  // 圖片變數的路徑重映射(SPEC-CLI §6:值相對於資料檔目錄;headless 以專案根為基底)
  remapImageVars(scene, data, projectDir, dataDir);

  // 變數注入(D05:缺變數沿用設計時值 + warning;--strict → exit 4)
  const resolved = resolveScene(scene, data);
  for (const w of resolved.warnings) console.error(`warning: ${w}`);
  if (args.strict && resolved.missing.length > 0) {
    throw new CliError(EXIT.MISSING_VAR, `--strict:資料缺變數:${resolved.missing.join('、')}`);
  }

  let png: Buffer;
  try {
    png = await renderScenePng({ scene: resolved.scene, projectDir, fontRegistry, scale: args.scale });
  } catch (e) {
    if (e instanceof AssetLoadError) {
      throw new CliError(EXIT.ASSET, `資產載入失敗:${e.message}`);
    }
    throw e;
  }

  const outPath = path.resolve(args.out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
  // D04:stdout 只印產物絕對路徑一行
  console.log(outPath);
}

/**
 * 圖片變數(binding.type==='image')的資料值:在原地把「相對資料檔目錄的本地路徑」
 * 改寫成「相對專案根的路徑」,供 headless server(根=專案夾)取用。
 * 檔案不存在或落在專案夾外 → exit 5(D09 精神:資產問題不靜默)。
 * 未綁定為圖片的鍵不動;缺值的鍵由 resolver 處理(走設計時值)。
 */
function remapImageVars(
  scene: Template,
  data: Record<string, unknown>,
  projectDir: string,
  dataDir: string,
): void {
  const imageVars = new Set(scene.bindings.filter((b) => b.type === 'image').map((b) => b.var));
  const root = path.resolve(projectDir);
  for (const v of imageVars) {
    const raw = data[v];
    if (raw === undefined || raw === null) continue;
    const abs = path.resolve(dataDir, String(raw));
    if (!existsSync(abs)) {
      throw new CliError(EXIT.ASSET, `圖片變數 "${v}" 的檔案不存在:${String(raw)}`);
    }
    const rel = path.relative(root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new CliError(EXIT.ASSET, `圖片變數 "${v}" 必須位於專案資料夾內:${String(raw)}`);
    }
    data[v] = rel.split(path.sep).join('/');
  }
}
