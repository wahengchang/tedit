// 渲染前守門(兩原型共用,排除干擾變因):
// FontFace 載入 + fonts.ready + 圖片全 decode,完成前不得發「渲染完成」信號。

// dedup key = family|weight(同 family 多字重要各自載入,不能只認 family)
const loadedFaces = new Set<string>();

export async function loadFont(family: string, url: string, weight = 400): Promise<void> {
  const key = `${family}|${weight}`;
  if (loadedFaces.has(key)) return;
  const face = new FontFace(family, `url(${url})`, { weight: String(weight) });
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
  loadedFaces.add(key);
}

export async function decodeImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

declare global {
  interface Window {
    __renderDone: boolean;
  }
}

export function markRenderStart(): void {
  window.__renderDone = false;
}

export function markRenderDone(): void {
  window.__renderDone = true;
}
