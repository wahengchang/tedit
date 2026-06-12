// cli 共用:退出碼表(D04)、模板/專案載入。

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Template } from '../core/scene/types.js';
import { validateTemplate } from '../core/scene/validate.js';
import { parseProjectConfig, DEFAULT_PROJECT, type ProjectConfig } from '../core/project.js';

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

/** 從模板路徑向上找 project.json,定位專案根(找不到 = 模板所在目錄 + 預設設定) */
export function locateProject(templatePath: string): { projectDir: string; config: ProjectConfig } {
  let dir = path.dirname(path.resolve(templatePath));
  for (let i = 0; i < 5; i++) {
    const pj = path.join(dir, 'project.json');
    if (existsSync(pj)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(pj, 'utf8'));
      } catch (e) {
        throw new CliError(EXIT.OTHER, `project.json 不是合法 JSON:${e instanceof Error ? e.message : e}`);
      }
      const { config, error } = parseProjectConfig(parsed);
      if (!config) throw new CliError(EXIT.OTHER, error ?? 'project.json 格式錯誤');
      return { projectDir: dir, config };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { projectDir: path.dirname(path.resolve(templatePath)), config: DEFAULT_PROJECT };
}
