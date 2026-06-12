// 渲染前守門(兩原型共用,排除干擾變因):
// FontFace 載入 + fonts.ready + 圖片全 decode,完成前不得發「渲染完成」信號。

const loadedFamilies = new Set<string>();

export async function loadFont(family: string, url: string): Promise<void> {
  if (loadedFamilies.has(family)) return;
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
  loadedFamilies.add(family);
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
