# 全圖層重構:影響分析(layer-compositor-impact.md)

> 決定方向:把核心從「單一 fabric canvas」改成「**多層合成器**」——每個元素是獨立一層,
> 層可以是 fabric(向量/文字/圖)或 HTML/iframe(本地),逐層 z-order(DOM 疊放順序)。
> 這份是「要做什麼 + repo 裡哪些會動 + 牽動哪些決議 + 風險與建議」。**討論用,還沒動工。**

---

## 0. 一句話定性

這不是「加一個元素類型」,是**重寫渲染鋪面**(blast radius 高)。
現在:1 個 `<canvas>` 裝全部元素,z-order = canvas 內順序。
之後:`#stage` = 一疊 DOM 圖層,每層一個元素,z-order = `elements` 陣列順序(DOM 疊放)。

```
現在                          之後(全圖層重構)
┌──────────────┐            ┌──────────────┐  ← #stage 截圖對象不變
│ 1 個 fabric   │            │ layer3 文字   │  z 高
│ canvas        │            │ layer2 iframe │
│ (裝全部元素)  │    ──▶     │ layer1 圖片   │
└──────────────┘            │ layer0 形狀   │  z 低
                            └──────────────┘  每層獨立 DOM,可任意交錯
```

**核心岔路(要先決定)**:全圖層後,fabric 還留嗎?
- **A. 每元素一個 fabric canvas**:保留 fabric 的變換/互動,但要管 N 個 canvas、跨 canvas 選取。
- **B. 放棄 fabric,改 DOM/SVG 渲染**:文字→HTML、形狀→SVG、圖→`<img>`、html→iframe;
  選取/拖拉/控制柄要自己做或換小庫。**這條等於把編輯器在 DOM 上重建。**
- → 這直接牽動 **D13(fabric v7)**,要開新決議。

---

## 1. 影響地圖(repo 裡哪些會動)

| 檔案 | 行數 | 衝擊 | 改什麼 |
|------|------|------|--------|
| `core/engine/browser-entry.ts` | 119 | 🔴 大改 | boot 從「建一個 fabric Canvas」→「建多層合成器」;`EngineHandle` 語意重定義 |
| `core/engine/fabric-mapping.ts` | 237 | 🔴 重寫 | 目前 Template ⇄ fabric 物件;改成「每層映射」或整個換成 DOM/SVG 映射。**最危的 save 方向在這** |
| `web/ui/editor.ts` | 423 | 🔴 大改 | 互動模型重做:單 canvas 的免費選取/拖拉/控制柄沒了,改逐層 proxy 或自寫 |
| `cli/headless/render-png.ts` | 112 | 🟠 中改 | 截圖對象從「canvas」→「多層合成」;守門要等**每個 iframe 各自**的 fonts.ready + 圖 decode |
| `core/engine/gate.ts` | 34 | 🟠 中改 | 守門擴充到「跨 document(每個 iframe)」 |
| `core/scene/types.ts` | 81 | 🟠 中改 | 新增 `html`/`iframe` 元素類型(src 本地、尺寸、sandbox 旗標) |
| `core/scene/validate.ts` | 227 | 🟠 中改 | 新元素類型驗證 + src 必須本地 |
| e2e harness(parity/editor/run-e2e) | — | 🟠 中改 | 截圖比對對象變、守門時序變、要加交錯+iframe 樣本 |
| `core/resolver/index.ts` | 77 | 🟢 幾乎不動 | 變數注入是純資料,不碰渲染(html 若要綁變數才加 prop) |
| `cli/render.ts` `vars.ts` `index.ts` | 259 | 🟢 不動 | CLI 鏈路只是叫 headless 出圖,介面不變 |
| `web/server.ts` | 183 | 🟢 不動 | REST 只讀寫 Template + 資產 |
| `core/project.ts` | 64 | 🟢 不動 | 字體註冊不變 |

**粗估**:🔴 三個檔(~780 行)是重寫等級;🟠 五處是中改;🟢 約一半的碼不受影響(賺到的是 core 的資料層 / CLI / server 都跟渲染解耦得夠乾淨)。

---

## 2. 牽動的決議(要重新確認 / 可能推翻)

| 決議 | 影響 |
|------|------|
| **D13 fabric v7** | ⚠ **可能推翻**:全圖層若走 B(DOM/SVG),fabric 角色大縮甚至移除。**要開新決議** |
| **D11 同像素** | ✅ 仍成立(單 Chromium),但守門時序更複雜(多 document),harness 要強化 |
| **D06 引擎只跑瀏覽器** | ✅ 更貼合(DOM 合成本來就只能瀏覽器跑) |
| **D07/D12 薄 schema + 映射層 + 往返測試** | ✅ 仍要;映射對象從 fabric 物件 → DOM 節點,往返測試照守(更重要了) |
| **D17 文字高度不入庫** | ✅ 精神不變;文字若改 DOM 渲染,高度推導換地方 |

---

## 3. 新增 schema(草案,逐層 z-order 不必改結構)

`elements` 陣列順序**本來就是 z-order**,所以「逐層」這件事 schema 不用動,渲染端真的逐層套用即可。只要**新增一個元素類型**:

```jsonc
{
  "id": "html1",
  "type": "html",                 // 新元素類型(或 "iframe")
  "x": 0, "y": 0, "width": 1200, "height": 630, "rotation": 0,
  "src": "assets/html/bg.html",   // 本地 HTML 檔(D08 自足;不可外連)
  "sandbox": true                 // 禁 script,只當靜態渲染(安全)
}
```

---

## 4. 風險與成本(誠實版)

- **blast radius 高**:動到渲染鋪面 + 互動模型 + 守門 + 測試 harness 四大塊。
- **失去 fabric 的免費互動**(若走 B):選取框、8 控制柄、旋轉、IText 行內編輯,全要重做或換庫——這是當初選 fabric(D13)的主因,等於把那筆投資退掉一部分。
- **守門變難**:每個 iframe 自己的 document,fonts.ready 要逐一等,時序錯一點同像素就破。
- **既有 5 關測試**要大改(parity/editor e2e 的截圖對象與時序都變)。

---

## 5. 建議的推進方式(不要 big bang)

1. **先決 D13**:fabric 留(走 A)還是換 DOM/SVG(走 B)?這是岔路口,定了才好估工。
2. **先做一個 spike**:只驗「一個 iframe 層**夾在**矩形與文字之間,編輯器 vs headless 出圖 diff=0」。
   這是全圖層最關鍵的未知數(交錯 + 跨 document 守門)。spike 過了再全面動。
3. **strangler 漸進**,不要一次掀掉:可先讓合成器**同時容納**「舊的單 fabric canvas(當其中一層)」+「新的 iframe 層」,
   逐步把元素搬出單 canvas,而不是一天內全改。
4. **保留 🟢 那半邊**(resolver / CLI / server / project):它們跟渲染解耦,別動。

---

## 6. 已定案(2026-06-16)

| # | 議題 | 決定 |
|---|------|------|
| 1 | 節奏 | **先做 spike 驗關鍵**,過了才全面重構(不 big bang) |
| 2 | fabric 去留(D13) | **留**:每個元素一個 fabric canvas 當一層;保住選取/控制柄/IText 免費功能,又能逐層交錯 |
| 3 | HTML 隔離 | **iframe**(獨立 document,本地檔);守門要多等 iframe 自己的 fonts.ready |
| 4 | 排程 | 待 spike 結果再排(會搶 editor.ts 熱區,故先別跟 undo/群組並行) |

---

## 7. SPIKE 任務書 — ✅ 已執行,通過(2026-06-16,結論見 `spike-result.md`)

**目標(一役驗成敗關鍵)**:
> 一個本地 **iframe 層,z-order 夾在矩形(底)與文字(頂)之間**,
> 編輯器畫面 vs headless CLI 出圖 **pixelmatch diff = 0**。

**同時驗到的兩個未知數**:
1. **逐層交錯**:每元素一個 fabric canvas + 一個 iframe 層,用 DOM 疊放排 z-order,合成截圖。
2. **跨 document 守門**:headless 要等 **iframe 自己的 `document.fonts.ready` + 圖片 decode** 才截圖。

**做法**:在 `spike/` 下開最小原型(**不碰正式 `src/`**),手寫一個三層場景
(矩形 canvas → iframe(本地 HTML 畫的東西)→ 文字 canvas),跑「編輯器頁截圖 vs Playwright 同 bundle 截圖」比對。

**成功定義**:diff = 0,且 iframe 內容(本地 HTML/CSS 畫出來的)在兩條路徑都正確出現。
非 0 要能解釋並判定可修/不可修(沿用 M0 擂台的判準)。

**範圍紀律**:只驗「交錯 + 跨 document 守門」。**不做**選取/拖拉/控制柄/屬性面板/綁定——
那些等 spike 過、正式重構時才做。

**預算**:1–2 天(CC 幾十分鐘)。產出:一張 diff=0 證據圖 + 一頁 spike 結論(成/敗 + 風險)。

**spike 過了之後才動**:§1 影響地圖裡的 🔴 三個核心檔(strangler 漸進,不一次掀)。
