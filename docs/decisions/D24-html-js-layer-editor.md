# D24 — HTML/JS 圖層:編輯器即時預覽 + 編輯 Modal + JS/透明出圖

> 2026-06-17 · branch `feat/html-js-layer`(從 main 49a395f 開)
> 立項盤點 / 訪談 / 六個小實驗(E1–E6)記錄見 `project-2026-06-17-1037/`(decisions.md / plan.md)。

## 背景(問題)
HTML 圖層在編輯器只顯示**虛線佔位框**(D22 階段 4 的「佔位框法」),使用者看不到內容、
也不能改 `src` 檔層的代碼。根因:**編輯器(單 canvas 壓平 + 佔位框)與出圖(多層 iframe 合成)
是兩套渲染模型**,所有「看不到 / 所見≠所得」都從這個分岔來。

## 決策(怎麼解)
**不重寫編輯器、不把活 DOM 塞進 canvas 圖層之間;改成「把活 DOM 光柵化成透明 PNG,
讓 fabric 當普通圖片合成」。** z-order / 控制柄 / 存檔全部天生正確,且編輯器與出圖共用
同一條出圖引擎(DRY:強化一次,編輯器預覽與 CLI 都受惠)。

### 引擎(compositor + render-png;編輯器與 CLI 共用)
- iframe `sandbox` 加 `allow-scripts` → HTML 圖層可跑 JS(canvas/SVG/DOM 繪圖)。E2 證。
- **D6 settle gate** `waitSettled()`:等「畫穩」才截圖,三條取最先到 —
  ① `window.__ready===true`(作者/AI 主動舉手;非同步繪圖首選)
  ② MutationObserver 連續 3 幀無 DOM 變動(同步/DOM 類)
  ③ 硬期限 5s(內容可永遠跑,絕不卡死)。E6 證。
- `render-png` 截圖加 `omitBackground` → `canvas.background:"transparent"` 時去背出圖;
  截圖前 bounded `networkidle`(允許網路 fetch)。E3/E4/E5 證。

### 編輯器(browser-entry + editor.ts + index.html)
- `EngineHandle.setHtmlPreview(id, url)`:把透明 PNG 點陣化成 fabric Pattern 填進佔位框;
  套圖前**烘平縮放**(width=width×scaleX、scaleX=1,origin=center 位置不變)→ 用控制柄縮放後
  內容仍剛好鋪滿(修 resize 角落 bug)。
- `editor.ts`:每個 html 圖層送「單元素 + 透明畫布」mini-scene 給 `/api/render`(復用 U5,
  無新端點)→ 回透明 PNG → setHtmlPreview。debounce 400ms、內容+尺寸 hash 沒變不重畫、
  刪層清快取。出圖中該層中心顯示**轉圈**提示。
- **Edit HTML Modal**(pop-up,左固定尺寸即時預覽 + 右可編輯代碼):
  - 左:元素 W×H 固定尺寸,transform scale 縮到 pane,透明棋盤格底;live iframe srcdoc 邊打邊更新、跑 JS。
  - 右:代碼編輯器,零依賴語法高亮(透明 textarea 疊高亮 `<pre>`,標籤/屬性/字串/註解上色)。
  - **統一規則:inline 與 src 兩種都能編輯、永不卡唯讀。** inline 載入字串;src 載入檔案內容;
    Done 一律存成 inline(src 層編過即脫鉤原共用檔)。Cancel 丟棄。
- 屬性面板:`src` 路徑可編輯 input;「✎ Edit HTML…」開 Modal、旁邊「⟳」強制重畫預覽。

## 第一性原理邊界(推導,非規定)
- ✅ 可做:任何瀏覽器畫得出來的(HTML/CSS、SVG、canvas2D、WebGL、網頁字體、內建圖)、
  JS 算完即停、AI 用 HTML 或 JS 寫。
- ❌ 不行(模型決定):輸出不能互動(靜止 PNG)、抓不到「永遠畫不完」的內容(→ D6 信號/期限)、
  非純函數程式碼不保證像素一致(用 random/time/network → 每次不同)、一層看不到另一層、
  有網路依賴就不能離線/可重現。
- 規則:**body 必須透明**(否則整框不透明蓋掉下層)。JS 層不強求硬同像素;純 CSS/原生層維持硬保證。

## 驗證
- 六關 `npm test` 全綠;非-html parity 仍 `diff=0`(omitBackground/allow-scripts/settle 不動既有像素)。
- 瀏覽器實測:編輯器看得到 HTML/JS 圖層、改碼即時更新、Done 後畫布更新、resize 後鋪滿、
  高亮/spinner/⟳ 皆正常。
- **CLI 同結果**:editor `#stage` vs `tedit render` html-card = 0.62% 像素差(僅 AA 邊緣,內容相同);
  HTML/JS 層逐層走同一條 `/api/render` 引擎,本質相同。

## 待辦(reconcile)
本分支從**舊 main**(49a395f)開;平行進行的 **D23(一專案一模板)**改寫了 `editor.ts`/`server.ts`/
`index.html`。合併順序後到者需 rebase:`compositor.ts`/`render-png.ts`/`browser-entry.ts` 乾淨套用,
`editor.ts` + `index.html` 需手動 reconcile(D23 也改了它們)。
