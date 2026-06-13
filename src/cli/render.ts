// tedit render <template> <data> [-o out.png] [--scale n] [--strict]
// 全鏈路:讀檔→驗證→resolve(變數注入)→headless→寫 PNG→stdout 只印絕對路徑(D04)。

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadTemplate, locateProject, CliError, EXIT } from './shared.js';
import { buildFontRegistry } from '../core/project.js';
import { findUnresolvedFonts } from '../core/scene/validate.js';
import { resolveScene } from '../core/resolver/index.js';
import { renderScenePng, AssetLoadError } from './headless/render-png.js';
import type { Template } from '../core/scene/types.js';

export interface RenderArgs {
  template: string;
  data: string;
  out: string;
  scale: number;
  strict: boolean;
}

export async function runRender(args: RenderArgs): Promise<void> {
  const scene = loadTemplate(args.template);
  const { projectDir, config } = locateProject(args.template);
  const fontRegistry = buildFontRegistry(config);

  // 字體規則(D09):不在註冊表或檔案不存在 → exit 5,不靜默 fallback
  const missing = findUnresolvedFonts(scene, Object.keys(fontRegistry));
  if (missing.length > 0) {
    throw new CliError(EXIT.ASSET, `模板引用的字體未在 project.json 註冊:${missing.join('、')}`);
  }
  for (const [family, file] of Object.entries(fontRegistry)) {
    if (!existsSync(path.join(projectDir, file))) {
      throw new CliError(EXIT.ASSET, `字體檔不存在:${family} → ${file}`);
    }
  }

  // 資料檔
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
  const data = rawData as Record<string, unknown>;

  // 圖片變數的路徑重映射(SPEC-CLI §6:值相對於資料檔目錄;headless 以專案根為基底)
  remapImageVars(scene, data, projectDir, path.dirname(path.resolve(args.data)));

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
