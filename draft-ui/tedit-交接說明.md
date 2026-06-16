# tedit Mockup — 交接說明

> 對象：接手 tedit 介面的工程師
> 檔案：`tedit.dc.html`（單一檔，含介面 + 互動邏輯）
> 性質：**高保真可互動原型（mockup）**，不是正式產品程式碼。用來定義介面長相、區域分層、屬性面板、modal 與互動行為，作為實作規格。

---

## 1. 怎麼開啟 / 看這個檔

**最簡單**：直接用瀏覽器打開 `tedit.dc.html` 即可操作（旁邊的 `support.js` 是 runtime，必須跟它放在同一層）。

需要同時保留的檔：
```
tedit.dc.html      ← 介面 + 邏輯（你要看的）
support.js         ← 執行時 runtime，請勿改、勿刪
```

> 這是一個 **Design Component（DC）**。`tedit.dc.html` 裡分成兩塊：
> - `<x-dc> … </x-dc>` 之間是 **template**（畫面 markup，全部 inline style）
> - 底部 `<script type="text/x-dc">` 裡的 `class Component extends DCLogic { … }` 是 **邏輯**（state、互動、運算）
> 兩者由 `support.js` 組裝渲染。**這只是原型的呈現技術，正式產品不需要沿用**——下方第 7 節會講對應關係。

---

## 2. 介面區域分層（這份原型的重點）

由外到內：

```
┌─────────────────────────────────────────────────────────────┐
│ Top Toolbar  logo · 模板名 · 插入(T/圖/形/HTML) · 複製/刪除 ·   │
│              zoom · 變數chip · Export PNG                      │
├──────────┬──────────────────────────────────────┬────────────┤
│ Layers   │  Work area（深色 dot-grid，可捲動）     │ Properties │
│ 圖層列表  │   └ Paper（白色 artboard 1080×1350）   │ 屬性面板    │
│          │      └ Layer 元素（文字/圖/形/HTML）    │            │
│          │      └ 選取框 8 控制柄 + 旋轉柄          │            │
│          │      └ 變數 {name} 角標                 │            │
├──────────┴──────────────────────────────────────┴────────────┤
│ Status bar  路徑 · 「編輯器所見＝CLI出圖」· 選取資訊 · zoom       │
└─────────────────────────────────────────────────────────────┘
Modals（覆蓋層）：Save / history、Export PNG（變數表 + YAML + CLI）
```

| 區域 | 對應程式 | 說明 |
|---|---|---|
| Work area（工作區） | 中欄 `overflow:auto` 的深色 dot-grid 容器 | 點空白處取消選取（`onCanvasBg`） |
| Paper（紙區） | 工作區內白色 `position:relative` 容器 | 固定 1080×1350 設計座標，靠 `zoom` 等比縮放顯示 |
| Layer 元素 | `canvasLayers`（renderVals 算出） | 依 `state.layers` 順序由下往上疊（z-order） |

---

## 3. 資料模型（最重要，直接對應 `*.template.json`）

所有狀態在 `Component.state`。核心是 `state.layers` 陣列，**陣列順序 = z-order（index 0 在最底層，最後一個在最上層）**。

每個 layer 物件的共同欄位：
```js
{ id, type, name, visible, x, y, w, h, rot, bound, varName }
//  type: 'text' | 'image' | 'shape' | 'html'
//  x/y/w/h/rot 一律是 1080×1350 設計座標系的值（不是螢幕像素）
//  bound + varName：是否綁成具名變數、變數名
```

各 type 的額外欄位：
```js
text:  { content, size, weight, color, align, lh, ls, font }   // font: 'sans'|'serif'|'mono'
image: { src, fit, radius }                                    // fit: 'cover'|'contain'|'fill'
shape: { fill, strokeW, stroke, radius }
html:  { code }                                                // 整段 HTML 字串
```

> 這個結構就是 `templates/<名>.template.json` 應該長的樣子。`renderVals()` 只是把這些值換算成螢幕座標（`*scale`）與 inline style 後丟給畫面，**沒有任何隱藏資料**。

---

## 4. 互動清單（對應你那份 US）

| 操作 | 怎麼觸發 | 對應 US |
|---|---|---|
| 選取（列表↔畫布雙向） | 點圖層列 / 點畫布元素 | US-3 |
| 拖曳移動 | 在畫布元素上按住拖（`startDrag`，依 zoom 換算） | US-3 |
| 雙擊文字行內編輯 | 雙擊畫布文字（contentEditable，blur 寫回 content） | US-3 |
| 改屬性 | 右側 X/Y/W/H/旋轉/字級/字體/顏色… 即時雙向 | US-3 |
| 顯示/隱藏 | 點圖層列前面的圓點 | — |
| 新增 / 複製 / 刪除 | 工具列 icon、⌘D、Delete | US-3 |
| 變數綁定 | 屬性面板「Bind variable」開關 → 畫布出現 `{name}` 角標 | US-1 |
| 存檔 + 歷史 | ⌘S / 模板名 chip → Save modal（列出歷史副本） | US-3 |
| 變數 / 出圖 | 「{ }」chip 或 Export PNG → Render modal | US-1 / US-4 |
| 缺變數行為 | Render modal 內 `--strict` 開關：警告沿用 ↔ exit 4 中止 | US-5 |
| HTML 圖層 | 新增 HTML → 畫布顯示佔位框、屬性面板貼整段代碼 | US-6 |

快捷鍵：`⌘/Ctrl+S` 存檔、`⌘/Ctrl+D` 複製、`Delete` 刪除、`Esc` 關 modal。

---

## 5. 哪些是真的、哪些是 mock（交接誠實標註）

**原型內真的會動的**：選取、拖曳、屬性雙向編輯、雙擊改字、新增/複製/刪除、顯示切換、變數綁定與角標、zoom、modal 開關、`--strict` 切換改變提示文案。

**刻意做成假資料 / 視覺示意的**（正式版要接後端）：
- **圖片**：畫布上是條紋佔位框 + `{cover}` 角標，沒有真的載入圖片（與 spec「畫布只顯示佔位框」一致）。
- **HTML 圖層**：畫布只顯示虛線佔位框（真內容出圖時才渲染）。
- **Save**：只是把目前時間塞進 `state.history` 陣列，**沒有真的寫檔**。正式版要寫 `templates/<名>.template.json` + `.tedit/history/<名>.<時間戳>.json`。
- **Export PNG / 變數表 / YAML / CLI 指令**：modal 內是示意（`sampleVals` 寫死，含 `subtitle` 缺值 demo），**不會真的出圖**。
- 8 控制柄目前是**視覺呈現**（游標樣式正確），縮放/旋轉實際數值請走右側屬性面板輸入；正式版需把控制柄做成可拖。
- 圖層列表的拖曳改 z-order 尚未實作（footer 有提示文案，但拖排未接）。

---

## 6. Tweak（原型可調參數）

`tedit.dc.html` 底部 `data-props` 定義了兩個可調 prop（在預覽的 Tweaks 面板可改，不影響邏輯）：
- `accent`：主強調色（預設 `#4c8dff`，影響選取框、角標、HTML 框、強調形狀）
- `density`：`compact` / `cozy`，圖層列間距

---

## 7. 給工程師的落地建議

1. **資料結構照搬**：第 3 節的 layer schema 直接當 `template.json` 規格；座標一律存設計座標系（1080×1350），渲染時再 `*scale`。
2. **編輯器所見＝CLI 出圖（US-2）**：原型用同一份 `renderVals()` 算 layer 樣式。正式版請讓「編輯器渲染」與「headless 出圖」共用同一份 render/engine，確保逐像素一致。
3. **變數機制（US-1/US-4）**：`bound + varName` 就是具名變數來源。`tedit vars` = 掃 `layers` 取 `bound && varName`；`render` 時用 YAML 值覆蓋 `content`/`src`，缺值依 `--strict` 決定沿用設計時值或 exit 4。
4. **退出碼**：沿用 spec 的 0/1/2/3/4/5（原型只示意了 4 與「缺值沿用」的差異）。
5. **HTML 圖層（US-6）**：編輯器只存 `code` 字串並畫佔位框；出圖端再把 `code` 依 x/y/w/h/z-order 實際渲染進畫面。
6. **本檔可當視覺/互動驗收基準**：UI 文案、配色、間距、面板分區、modal 內容都已定稿，照著實作即可。

---

## 8. 改原型的話（如果要繼續調整這份 mock）

- 改畫面文字/樣式：編輯 `<x-dc>…</x-dc>` 內的 template（全 inline style）。
- 改行為/資料：編輯底部 `class Component` 裡的 `state`、各 method、`renderVals()`。
- 不要動 `support.js`。
- 想換示範內容（換成你們真實的卡片）：改 `state.layers` 初始值即可。
