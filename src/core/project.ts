// project.json 解析與字體註冊表(SPEC-CLI §3.2/§4)。純邏輯零 I/O,讀檔在 cli/web。

export interface ProjectFont {
  family: string;
  /** 專案內相對路徑,如 assets/fonts/NotoSansTC-Regular.otf */
  file: string;
}

export interface ProjectConfig {
  name?: string;
  canvasDefaults?: { width: number; height: number; background: string };
  fonts: ProjectFont[];
}

export const DEFAULT_PROJECT: ProjectConfig = {
  canvasDefaults: { width: 1200, height: 630, background: '#ffffff' },
  fonts: [],
};

export function parseProjectConfig(input: unknown): { config?: ProjectConfig; error?: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'project.json 必須是物件' };
  }
  const obj = input as Record<string, unknown>;
  const fonts: ProjectFont[] = [];
  if (obj.fonts !== undefined) {
    if (!Array.isArray(obj.fonts)) return { error: 'project.json fonts 必須是陣列' };
    for (const [i, f] of obj.fonts.entries()) {
      const fo = f as Record<string, unknown>;
      if (typeof fo?.family !== 'string' || typeof fo?.file !== 'string') {
        return { error: `project.json fonts[${i}] 須含 family 與 file 字串欄位` };
      }
      fonts.push({ family: fo.family, file: fo.file });
    }
  }
  const config: ProjectConfig = { fonts };
  if (typeof obj.name === 'string') config.name = obj.name;
  const cd = obj.canvasDefaults as Record<string, unknown> | undefined;
  if (cd && typeof cd.width === 'number' && typeof cd.height === 'number' && typeof cd.background === 'string') {
    config.canvasDefaults = { width: cd.width, height: cd.height, background: cd.background };
  }
  return { config };
}

/** family → 專案內相對路徑(瀏覽器端再轉 URL) */
export function buildFontRegistry(config: ProjectConfig): Record<string, string> {
  const registry: Record<string, string> = {};
  for (const f of config.fonts) registry[f.family] = f.file;
  return registry;
}
