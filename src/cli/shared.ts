// cli 共用:退出碼表(D04)、模板/專案載入。
// D23:一資料夾一專案一模板。專案根 = 資料夾;模板 = 該夾的 template.json(固定保留檔名)。

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Template } from '../core/scene/types.js';
import { validateTemplate } from '../core/scene/validate.js';
import { parseProjectConfig, DEFAULT_PROJECT, type ProjectConfig } from '../core/project.js';

/** D23:模板固定保留檔名,一個專案資料夾剛好一份。 */
export const TEMPLATE_FILENAME = 'template.json';
/** project.json 是保留設定檔(可選);與 TEMPLATE_FILENAME 一同排除於「資料檔候選」之外。 */
export const PROJECT_FILENAME = 'project.json';

export const EXIT = {
  OK: 0,
  OTHER: 1,
  ARGS: 2,
  TEMPLATE: 3,
  MISSING_VAR: 4,
  ASSET: 5,
} as const;

export class CliError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

/** 讀取並驗證模板;失敗 → exit 3(D04 紀律:訊息走 stderr,由呼叫端輸出) */
export function loadTemplate(templatePath: string): Template {
  if (!existsSync(templatePath)) {
    throw new CliError(EXIT.TEMPLATE, `模板檔不存在:${templatePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(templatePath, 'utf8'));
  } catch (e) {
    throw new CliError(EXIT.TEMPLATE, `模板不是合法 JSON:${e instanceof Error ? e.message : e}`);
  }
  const result = validateTemplate(parsed);
  if (!result.ok || !result.template) {
    const lines = result.errors.map((er) => `  ${er.path}: ${er.message}`).join('\n');
    throw new CliError(EXIT.TEMPLATE, `模板 schema 驗證失敗:\n${lines}`);
  }
  return result.template;
}

/**
 * D23:把使用者輸入解析成「專案資料夾 + 其唯一模板檔」。
 *  - 指到資料夾  → 模板 = <夾>/template.json,根 = 該夾
 *  - 指到 .json 檔 → 該檔即模板,根 = 其所在夾(顯式檔案形式仍可用)
 * 不做向上搜尋:1:1 模型下資料夾就是專案根。
 */
export function resolveTemplateInput(input: string): { projectDir: string; templateFile: string } {
  const resolved = path.resolve(input);
  if (existsSync(resolved) && statSync(resolved).isFile()) {
    return { projectDir: path.dirname(resolved), templateFile: resolved };
  }
  return { projectDir: resolved, templateFile: path.join(resolved, TEMPLATE_FILENAME) };
}

/** 讀資料夾的 project.json(可選);不存在用 DEFAULT,格式錯則報錯。 */
export function loadProjectConfig(projectDir: string): ProjectConfig {
  const pj = path.join(path.resolve(projectDir), PROJECT_FILENAME);
  if (!existsSync(pj)) return DEFAULT_PROJECT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pj, 'utf8'));
  } catch (e) {
    throw new CliError(EXIT.OTHER, `project.json 不是合法 JSON:${e instanceof Error ? e.message : e}`);
  }
  const { config, error } = parseProjectConfig(parsed);
  if (!config) throw new CliError(EXIT.OTHER, error ?? 'project.json 格式錯誤');
  return config;
}

/** 專案根 = 模板所在資料夾(D23:不再向上搜尋)。回傳根 + 設定。 */
export function locateProject(templatePath: string): { projectDir: string; config: ProjectConfig } {
  const projectDir = path.dirname(path.resolve(templatePath));
  return { projectDir, config: loadProjectConfig(projectDir) };
}
