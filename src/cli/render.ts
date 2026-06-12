// tedit render <template> <data> [-o out.png] [--scale n] [--strict]
// M2 鏈路:讀檔→驗證→(resolver 等 M3)→headless→寫 PNG→stdout 只印絕對路徑(D04)。

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadTemplate, locateProject, CliError, EXIT } from './shared.js';
import { buildFontRegistry } from '../core/project.js';
import { findUnresolvedFonts } from '../core/scene/validate.js';
import { renderScenePng, AssetLoadError } from './headless/render-png.js';

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

  // 資料檔:M3 resolver 就位前先解析不灌入(stderr 警告;D05 行為屆時生效)
  if (!existsSync(args.data)) {
    throw new CliError(EXIT.OTHER, `資料檔不存在:${args.data}`);
  }
  try {
    yaml.load(readFileSync(args.data, 'utf8'));
  } catch (e) {
    throw new CliError(EXIT.OTHER, `資料檔解析失敗:${e instanceof Error ? e.message : e}`);
  }
  if (scene.bindings.length > 0) {
    console.error('warning: 變數注入(resolver)於 M3 實作,本次以設計時值出圖');
  }

  let png: Buffer;
  try {
    png = await renderScenePng({ scene, projectDir, fontRegistry, scale: args.scale });
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
