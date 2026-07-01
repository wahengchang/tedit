// project.json 解析與字體註冊表(SPEC-CLI §3.2/§4)。純邏輯零 I/O,讀檔在 cli/web。

export interface ProjectFont {
  family: string;
  /** 專案內相對路徑,如 assets/fonts/NotoSansTC-Regular.otf */
  file: string;
  /** 字重 100–900(選填,預設 400);同一 family 可註冊多個字重檔 */
  weight?: number;
}

/** family → 可載入的字面清單(一 family 可有多字重) */
export interface FontFaceSpec {
  /** 瀏覽器可直接使用的 URL */
  url: string;
  weight: number;
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
      const font: ProjectFont = { family: fo.family, file: fo.file };
      if (fo.weight !== undefined) {
        if (typeof fo.weight !== 'number' || !Number.isFinite(fo.weight) || fo.weight < 100 || fo.weight > 900) {
          return { error: `project.json fonts[${i}].weight 必須是 100..900 的數字` };
        }
        font.weight = fo.weight;
      }
      fonts.push(font);
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

/**
 * 內建預設字體(D19/Q7):Noto Sans TC Regular,不子集、woff2。
 * 隨 dist/web/fonts 打包,經 /__tedit/fonts 由編輯器 server 與 headless server 共同提供。
 * 使用者沒註冊任何字體時的兜底(D09:不靜默 fallback,但「內建字」是合法可解析字體)。
 */
export const BUILTIN_FONTS: { family: string; url: string; weight: number }[] = [
  { family: 'Noto Sans TC', url: '/__tedit/fonts/NotoSansTC-Regular.woff2', weight: 400 },
];

/**
 * family → 該 family 的所有字面(url + weight)。
 * 先放內建字,再讓專案註冊表覆蓋 / 追加:
 *   - 同 (family, weight) → 專案覆蓋內建;
 *   - 專案新增其他字重 → 追加(例如自帶 Bold 700)。
 * 專案字體 URL = '/' + 相對路徑(由 server 從專案根提供);weight 省略視為 400。
 * 註:某 family 缺某字重時不是錯誤——瀏覽器合成粗體兜底(見 TextElement.fontWeight)。
 */
export function buildFontRegistry(config: ProjectConfig): Record<string, FontFaceSpec[]> {
  const registry: Record<string, FontFaceSpec[]> = {};
  const put = (family: string, url: string, weight: number) => {
    const specs = (registry[family] ??= []);
    const i = specs.findIndex((s) => s.weight === weight);
    if (i >= 0) specs[i] = { url, weight };
    else specs.push({ url, weight });
  };
  for (const bf of BUILTIN_FONTS) put(bf.family, bf.url, bf.weight);
  for (const f of config.fonts) put(f.family, '/' + f.file, f.weight ?? 400);
  return registry;
}
