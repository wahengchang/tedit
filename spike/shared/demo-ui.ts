// 人工體驗工具列(?demo=1 才掛載,不影響擂台 harness):
// 自動載入範例場景 + 「重載場景 / save→重新load(往返) / 下載 JSON」按鈕。

import type { Template } from '../../src/core/scene/types.js';

interface ProtoLike {
  load(scene: Template): Promise<void>;
  save(): Template;
  deselect(): void;
}

async function fetchScene(): Promise<Template> {
  const res = await fetch('/spike-scene.template.json');
  return (await res.json()) as Template;
}

export function attachDemoUi(proto: ProtoLike, label: string): void {
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    zIndex: '1000',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    background: 'rgba(20,20,20,0.85)',
    color: '#eee',
    padding: '8px 10px',
    borderRadius: '8px',
  });

  const tag = document.createElement('span');
  tag.textContent = label;
  tag.style.fontWeight = '600';
  bar.appendChild(tag);

  const btn = (text: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      font: 'inherit',
      padding: '4px 10px',
      borderRadius: '6px',
      border: '1px solid #666',
      background: '#333',
      color: '#eee',
      cursor: 'pointer',
    });
    b.onclick = fn;
    bar.appendChild(b);
  };

  btn('重載場景', () => {
    void fetchScene().then((s) => proto.load(s));
  });
  btn('save→load 往返', () => {
    proto.deselect();
    void proto.load(proto.save());
  });
  btn('下載 JSON', () => {
    proto.deselect();
    const json = JSON.stringify(proto.save(), null, 2);
    console.log(json);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'saved.template.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const hint = document.createElement('span');
  hint.textContent = '拖拉移動|點選出控制柄|雙擊文字改字(試試注音!)';
  hint.style.opacity = '0.7';
  bar.appendChild(hint);

  document.body.appendChild(bar);
  void fetchScene().then((s) => proto.load(s));
}
