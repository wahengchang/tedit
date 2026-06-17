# demo 範例專案

完整可跑的範例,給 `tedit` 三個指令練手。

## 內容

```
project.json                  畫布預設 + 字體註冊(Noto Sans TC)
templates/
  card.template.json          矩形 + 圖片 + 文字;綁 title(文字)、photo(圖片)
  multibind.template.json     同一個 title 綁到兩處文字(示範同名變數綁多處)
  html-card.template.json     HTML 圖層(本地檔)+ 矩形 + 文字疊在其上(示範分層)
  html-badge.template.json    HTML 圖層(內嵌代碼):CSS 漸層做圓形 50% OFF 徽章
  html-stats.template.json    HTML 圖層(本地檔):flex 三欄 KPI、漸層文字
  html-pricing.template.json  HTML 圖層(本地檔):價目卡(清單 + 勾選 + CTA 按鈕)
  html-quote.template.json    HTML 圖層(內嵌代碼):中文引言、漸層底、內嵌字體
  html-photo.template.json    HTML 圖層(本地檔):照片當底圖 + 漸層遮罩 + 標題
assets/
  fonts/NotoSansTC-Regular.otf
  images/test-photo.png
  html/panel.html             html-card 用的本地 HTML 檔
  html/stats.html  pricing.html  photo-overlay.html   上面三個 html-* 範例的本地檔
data/
  a.yaml / b.yaml             兩份完整資料(title + photo)
  partial.yaml                只給 title(示範缺變數 fallback)
  empty.yaml                  空資料(全用設計時值)
render-all.sh                 一鍵:card × a/b → out/card-a.png、out/card-b.png
```

## 跑跑看(在 repo 根目錄,先 `npm run build`)

```bash
# 設計
tedit ui --dir examples/demo

# 變數清單
tedit vars examples/demo/templates/card.template.json

# 出圖(換 a.yaml / b.yaml 看同版面不同內容)
tedit render examples/demo/templates/card.template.json examples/demo/data/a.yaml -o out.png

# 缺變數:預設 fallback(警告但出圖)
tedit render examples/demo/templates/card.template.json examples/demo/data/partial.yaml -o out.png
# 嚴格模式:缺變數報錯(exit 4)
tedit render examples/demo/templates/card.template.json examples/demo/data/partial.yaml --strict

# 一鍵示範(含 5 個 HTML 圖層範例)
bash examples/demo/render-all.sh
```

## HTML 圖層怎麼用

當原生「文字/圖片/形狀」做不到某種版面(CSS 漸層、flex/grid 排版、圓角陰影、
文字裁切漸層…)時,改用 **HTML 圖層**:一塊由 HTML/CSS 描述、出圖時經
**`<iframe>` 渲染**成像素的圖層。

**兩種內容來源,擇一:**

| 來源 | schema 欄位 | 怎麼來 | 範例 |
|------|------------|--------|------|
| 內嵌代碼 | `"html": "<...>"` | 編輯器右側屬性面板「貼上整段 HTML」(→ iframe `srcdoc`) | `html-badge` / `html-quote` |
| 本地檔 | `"src": "assets/html/x.html"` | 專案內的 `.html` 檔(→ iframe `src`) | `html-stats` / `html-pricing` / `html-photo` |

**規則(很重要):**

- **不跑 script**:iframe `sandbox="allow-same-origin"`(無 `allow-scripts`)。純 HTML/CSS,`<script>` 不會執行 → 純靜態版面、出圖才能像素穩定。
- **資產走絕對路徑**:HTML 內引用專案資產用 `/assets/...`,例如
  `@font-face{src:url('/assets/fonts/NotoSansTC-Regular.otf')}`、
  `background:url('/assets/images/test-photo.png')`。**不可外連網路**(出圖須自足)。
- **可與原生圖層疊放**:HTML 圖層就是 elements 裡的一個元素,依順序決定 z-order;
  `html-card` 就示範了「文字層疊在 HTML 圖層之上」。
- **編輯器內是佔位框**:在 `tedit ui` 裡 HTML 圖層顯示為可拖拉/縮放的框,真實內容
  在 `tedit render` 出圖時才渲染。

```bash
# 單獨出某一個 HTML 範例
tedit render examples/demo/templates/html-pricing.template.json examples/demo/data/empty.yaml -o out.png
```
