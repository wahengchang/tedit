# tedit 專案說明(explain.md)

> 一份「用講的」說清楚整個專案的文件。給你快速掌握:這是什麼、怎麼分模塊、
> 核心資料結構長怎樣、現在做到哪、剩什麼、以及平行開工怎麼安排。
> (正式索引在 docs/README-HANDOVER.md;進度在 STATUS.md;圖在 docs/OVERVIEW-VISUAL.md)

---

## 1. 這個專案是什麼(一句話)

**tedit** = 本地的視覺模板編輯器。你在瀏覽器自由排版(文字/圖片/形狀),把某些元件
「綁成具名變數」存成模板;之後用 CLI 餵一份資料、headless 出一張 PNG。同一個模板換不同
資料,就能重複產出「版面相同、內容不同」的圖。

最硬的鐵律:**編輯器看到的 == CLI 出的圖,逐像素相同(diff = 0)**。
怎麼保證?編輯器頁和 headless 出圖頁,載入「同一份 engine bundle」、跑「同一顆 Chromium」。

```
   瀏覽器設計 ──▶ 模板.template.json ──▶ tedit render + 資料.yaml ──▶ PNG
                                              (換資料重複呼叫 → 換內容、同版面)
```

---

## 2. 模塊怎麼分(三層 + 兩個 bundle)

依賴鐵律(D01):箭頭只准指向 core;cli 與 web 互不依賴(ESLint 看守)。

```
                 ┌──────────────────────────────────────────┐
                 │ core/  共用核心(純邏輯為主)               │
                 │  scene/     型別 + 驗證(schema 真相)      │
                 │  resolver/  變數注入(純函式,零 I/O)      │
                 │  engine/    映射層 + 渲染守門(fabric v7)  │
                 │  project.ts project.json + 字體註冊表       │
                 └───────────▲───────────────────▲──────────┘
                             │                   │
                  ┌──────────┴───────┐  ┌────────┴──────────────┐
                  │ cli/             │  │ web/                  │
                  │  index 指令入口   │  │  server.ts 薄後端+REST │
                  │  render/vars/ui  │  │  ui/editor.ts 前端     │
                  │  headless 出圖    │  │  ui/index.html 深色殼  │
                  └──────────────────┘  └───────────────────────┘
                       ✗ cli ───────────────────── web ✗(互不 import)

兩個瀏覽器 bundle(esbuild 產到 dist/web/):
  engine.bundle.js  = core/engine   ← 編輯器頁 與 headless 頁「共用同一份」(同像素的保證)
  editor.bundle.js  = web/ui/editor ← 編輯器面板/工具列,只透過 window.teditEngine 跟引擎講話
```

各模塊一句話:
- **scene-core**:定義「模板長怎樣」的型別 + 驗證器(錯誤會定位到元素 id+欄位)。
- **resolver**:把資料的變數值注入模板;缺變數沿用設計時值 + 警告(`--strict` 才報錯)。
- **engine 映射層**:schema ↔ fabric 畫布物件 的雙向轉換。**全系統最危險的單點**(見 §4)。
- **engine 守門**:渲染前等字體 `fonts.ready` + 圖片 decode 完成,才允許截圖(同像素的時序保證)。
- **cli**:`tedit ui / render / vars` 三個指令;stdout 只印產物路徑,退出碼 0–5。
- **web/server**:起本地 server、模板讀寫 REST、資產上傳、存檔自動留 history 副本。
- **web/editor**:深色 Figma 風編輯器(選取/拖拉/控制柄/屬性/圖層/綁定/角標)。

---

## 3. 核心資料結構(模板 = 一棵 JSON 樹)★ 重點

整個專案的「單一真相」就是這棵樹。所有模塊都圍著它轉。

```
Template ───────────────────────────────────────────────
  teditVersion : "0.1"        schema 版本(供未來遷移)
  canvas       : CanvasSpec    畫布
  elements     : Element[]     陣列順序 = z-order(索引 0 在最底)
  bindings     : Binding[]     變數定義(獨立區塊,不混進元素)

CanvasSpec
  width, height : number(px)
  background    : "#ffffff"  或  { image: "assets/.../bg.png" }

Element(三型,共用 ElementBase:id, type, x, y, rotation)
  TextElement   type:"text"   width, content, fontFamily, fontSize,
                              color, align, lineHeight
                              ⚠ 沒有 height —— 由內容推導,不入庫(D17)
  ImageElement  type:"image"  width, height, src, fit: cover|contain|stretch
  ShapeElement  type:"shape"  width, height, shape: rect|ellipse|line,
                              fill, stroke, strokeWidth

Binding(把某元素的某屬性綁到一個具名變數)
  var     : "title"           變數名(= 資料檔的 key)
  element : "txt1"            目標元素 id
  prop    : "content" | "src" v1 可綁:文字內容 / 圖片來源
  type    : "text" | "image"  與 prop 一致(驗證器強制)
  ※ 同一變數可綁多處(一處資料、多處反映);元素永遠存「設計時預設值」
```

幾個「為什麼這樣設計」的關鍵:
- **bindings 獨立成區塊**(不寫成 `{{title}}` 魔法字串):渲染與變數系統徹底解耦,
  `vars` 一個 filter 就列完,缺變數 fallback 免費實現,使用者打 `{{` 字面也不會誤觸發。
- **文字不存 height**(D17):fabric/Konva 都會自動推導文字高度;若存死,save 會寫回推導值、
  兩引擎還不一致 → 往返測試必爆。所以文字只存 width(換行寬),高度渲染時算。

### 一個具體例子(精簡 card 模板)

```jsonc
{
  "teditVersion": "0.1",
  "canvas": { "width": 1200, "height": 630, "background": "#f4f1ea" },
  "elements": [
    { "id": "rect1", "type": "shape", "shape": "rect",
      "x": 60, "y": 60, "width": 520, "height": 510, "rotation": 0,
      "fill": "#1e3a5f", "stroke": "#c9a86a", "strokeWidth": 6 },
    { "id": "img1", "type": "image",
      "x": 640, "y": 80, "width": 480, "height": 300, "rotation": 0,
      "src": "assets/images/test-photo.png", "fit": "cover" },
    { "id": "txt1", "type": "text",
      "x": 100, "y": 110, "width": 440, "rotation": 0,
      "content": "春江潮水連海平…",       // ← 設計時預設值
      "fontFamily": "Noto Sans TC", "fontSize": 28,
      "color": "#f4f1ea", "align": "left", "lineHeight": 1.5 }
  ],
  "bindings": [
    { "var": "title", "element": "txt1", "prop": "content", "type": "text"  },
    { "var": "photo", "element": "img1", "prop": "src",     "type": "image" }
  ]
}
```

---

## 4. 引擎命脈:映射層(schema ↔ 畫布物件)

```
        load(scene)                          save(物件樹)
schema ───────────▶  fabric 物件樹  ───────────▶  schema
(能描述)  座標換算      (能畫/能編)    座標換算      (存得回)

  座標系不同,映射層負責換算:
    schema:  x,y = 未旋轉左上角        fabric:  left,top = 中心點
    load → left = x + width/2          save → x = centerX - width/2
```

**為什麼是「最危險的單點」**:load(schema→物件)好寫;save(物件→schema)漏一個欄位,
就是「使用者編了、看見了,存檔後默默消失」——最陰險的 bug。
看守機制(D12 往返測試):load→save 必須逐欄位 == 原 JSON。
這條測試上線當天就抓到兩條真 bug(圖片 contain 把設計框存成內容框、line 形狀回寫了預設黑),
證明它存在的價值。

---

## 5. 現在做到哪(進度)

```
✅ M0  選型擂台      fabric v7 勝出(vs Konva;四任務全過、diff 全 0)
✅ M1  渲染核心      映射層整理 + test-harness(10 樣本 pixelmatch=0 + 往返)
✅ M2  render CLI    全鏈路 + --scale + 退出碼 0–5
✅ M3  變數綁定      resolver 注入 + --strict + vars
✅ M4  編輯器        深色 Figma 風:選取/拖拉/控制柄/屬性編輯/圖層拖排/
                    增刪複製/文字行內編輯/變數綁定 UI + 畫布角標
🔨 M5  整合打磨      ✅端到端同像素(編輯器 vs CLI = diff0)✅woff2 內建字
                    ✅examples+README;⏳剩 IME 人工驗證(需真人打注音)
❌ M6  擴充背包      undo/redo、群組、對齊輔助線吸附、URL 圖片變數、
                    批次量產、更多可綁屬性(顏色/可見性)、混排斷行…
🔬 探索  全圖層重構    HTML/iframe 與 canvas 平起平坐、逐層 z-order(見 layer-compositor-impact.md)
                    方向已定(先 spike→保留 fabric→iframe 隔離);**spike 已通過**(spike-result.md)
                    下一步=進正式重構(等開工);這會重寫渲染核心,屬大改
```

測試現況:`npm test` 五關全綠 = 單元 + 同像素 parity(10) + CLI 情境 + 編輯器 e2e + 端到端 e2e。
spike 另有獨立驗證:`node spike/run-compositor.mjs`(全圖層三層交錯 diff=0)。

---

## 6. 怎麼跑(npm 入口)

```bash
npm run ui:demo                  # 建置 + 開編輯器(範例專案)+ 開瀏覽器
npm run ui -- ./我的專案          # 開自己的專案夾(可 --port 5174 / --no-open)
npm run render:demo              # 一鍵:同模板 × 兩份資料 → 兩張圖
npm run tedit -- vars examples/demo/templates/card.template.json   # 任意 CLI 子指令
npm test                        # 全套測試
```

---

## 7. 重要決議(總帳 D01–D21,完整在 README-HANDOVER §4)

挑幾條最影響全局的:
- **D01** 三分架構 core/cli/web、單向依賴。
- **D06/D11** 引擎只跑瀏覽器;同像素靠「同 bundle + 同 Chromium」+ pixelmatch=0 CI 硬指標。
- **D07/D12** 自訂薄 schema + 映射層;往返測試看守 save 方向。
- **D13** 渲染基底 = fabric v7。  **D14** 前端 = vanilla TS。
- **D15/D16** bindings 獨立區塊 + 面板開關綁定 UX。
- **D17** 文字高度不入庫。  **D18** 映射層用 center origin(「編輯態毛刺」是誤判,已撤銷)。
- **D19** 內建字 Noto Sans TC(woff2,不子集)。  **D20** 編輯器深色 Figma 風。
- **D21** 圖片變數路徑:相對資料檔、必須在專案夾內,否則 exit 5。
- **(新,2026-06-16)全圖層重構方向**:先 spike→保留 fabric(每元素一 canvas)→HTML 層用 iframe;
  spike 已通過。**因保留 fabric,D13 不被推翻**。詳見 layer-compositor-impact.md / spike-result.md。

---

## 8. 平行開工計畫(git worktree)★ 你最近問的

逐檔比對「寫入集」後的結論:**有兩個序列化熱區,不能硬並行**:
1. **契約三角**(types.ts + validate.ts + fabric-mapping.ts)——所有 schema 類功能都撞這裡。
2. **editor.ts(423 行單檔)**——undo/redo、對齊輔助線、每個 schema 功能的屬性面板都寫這裡。

**乾淨車道(寫入集不相交,可真平行)**:server.ts(history)、headless(keep-alive)、
cli/render(URL圖片 或 批次,擇一)。

**已定方案:開 2 條 worktree**
```
WT-1  feature/schema-v0.2   地基,先做先合
        opacity/visible 欄位 + Binding 擴充(color/fill/visible)
        繳五步漣漪稅:schema+validate / load / save / 屬性面板 / 測試
WT-2  feature/keep-alive    乾淨車道(鎖在 cli/headless,零碰 schema/editor/server)

衛生規則:worktree 內別改 STATUS.md/docs(合併後統一更新);先合 WT-1 再合 WT-2。
node_modules 不共用 → 用 symlink:ln -s 主repo/node_modules worktree/node_modules
```

> 註(2026-06-16):上面的 2-worktree 是「M6 一般擴充」的規劃。另外**全圖層重構**已成獨立一條軌
> (spike 已過,見 §5、layer-compositor-impact.md),它會重寫渲染核心、獨佔 fabric-mapping + editor 熱區,
> 因此**不宜跟其他 editor 重功能並行**——要嘛先做它、要嘛它跟「乾淨車道」(server/headless)並行。

---

## 一句話總結

地基(schema + 映射層 + 同像素)很穩、測試很硬,編輯器和 CLI 兩端都通了、而且端到端逐像素一致。
v1 幾乎完成(只剩 IME 人工驗證)。目前最大的待辦是**全圖層重構**:方向已定、spike 已通過,
等你說開工就進正式重構(會重寫渲染核心,strangler 漸進)。
