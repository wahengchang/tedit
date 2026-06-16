# tedit 視覺化總覽(OVERVIEW-VISUAL)

> 一份「用圖看懂全貌」的文件。截至 2026-06-15,M0–M4 全完成。
> 想看進度見 ../project-manager.md;想看決議見 docs/decisions/。

---

## 1. 一張圖看懂 tedit

```
   ┌──────────────────────────────────────────────────────────────┐
   │  瀏覽器編輯器（tedit ui）— 深色 Figma 風                          │
   │  自由設計版面 → 把元件綁成具名變數 → 存成模板                       │
   └──────────────────────────────┬───────────────────────────────┘
                                   │ 存檔
                                   ▼
                    ┌──────────────────────────────┐
                    │  card.template.json           │
                    │  場景(元素+畫布)+ 變數定義      │  ← 單一真相(JSON)
                    └──────────────┬───────────────┘
                                   │
              tedit render 模板 + 資料.yaml(填變數值)
                                   ▼
                    ┌──────────────────────────────┐
                    │   一張 PNG                     │  ← 換資料重複呼叫 = 換內容、同版面
                    └──────────────────────────────┘

   最硬的鐵律(D11):編輯器畫面  ==  CLI 出圖,逐像素相同。
   怎麼保證?兩邊載入「同一份 engine.bundle.js」、跑「同一顆 Chromium」。
```

---

## 2. 編輯器長相 + 功能地圖

```
┌─────────────────────────────────────────────────────────────────────────┐
│ tedit   ＋文字 ＋圖片 ＋形狀   複製 刪除          模板：card      [存檔]    │ ← 工具列
├────────────┬────────────────────────────────────────────┬───────────────┤
│ 圖層        │                                            │ 屬性           │
│            │     {title}┌────────────────┐  {photo}      │ T txt1  text  │
│ T txt1 ◀選 │          ╔═│春江潮水連海平…   │═╗ ┌────────┐  │ X    [100]    │
│ ▦ img1     │          ║ │(可拖拉/縮放/旋轉)│ ║ │ 圖片    │  │ Y    [110]    │
│ ◇ rect1    │          ╚═└────────────────┘═╝ └────────┘  │ 寬   [440]    │
│            │             ▲控制柄(8 點+旋轉)              │ 旋轉 [0]      │
│ ↕拖排改     │                                            │ 內容 [春江…]   │
│  z-order   │           畫布(置中,深灰襯底)               │ 字級 [28]     │
│            │           雙擊文字→行內編輯                  │ 字體 [Noto▾]  │
│            │                                            │ 對齊 [left▾]  │
│            │                                            │ 顏色 [▤]      │
│            │                                            │ ─────────────│
│            │                                            │ ☑ 綁定變數     │
│            │                                            │   變數名[title]│
└────────────┴────────────────────────────────────────────┴───────────────┘
   左:圖層列表                  中:畫布                      右:屬性+綁定

功能清單(都已實作):
  工具列   ＋文字 / ＋圖片(上傳落地 assets/images) / ＋形狀 / 複製 / 刪除 / 存檔
  圖層     點選 ↔ 畫布雙向同步;拖曳改 z-order(上=前)
  畫布     選取、拖拉、8 控制柄縮放、旋轉;雙擊文字行內編輯(中文 IME 可用)
  屬性     即時雙向編輯:座標/尺寸/旋轉/字級/字體/對齊/顏色/裁切/形狀/描邊
  綁定     開關把 text.content 或 image.src 綁成具名變數;畫布顯示 {變數名} 角標
  快捷鍵   Cmd/Ctrl+S 存檔、Cmd/Ctrl+D 複製、Delete 刪除
  存檔     寫 templates/<名>.template.json + .tedit/history/<名>.<時間戳>.json 副本
```

---

## 3. 專案架構（程式碼怎麼分層）

```
依賴鐵律(D01):箭頭只准指向 core;cli 與 web 互不依賴。

              ┌───────────────────────────────────────┐
              │  core/(共用核心,純邏輯為主)             │
              │  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
              │  │ scene/   │ │ resolver/ │ │ engine/   │  │
              │  │ 型別+驗證 │ │ 變數注入   │ │ 映射層    │  │
              │  │(types,   │ │(純函式)   │ │ +守門     │  │
              │  │ validate)│ │           │ │(fabric)  │  │
              │  └─────────┘ └──────────┘ └──────────┘  │
              │  project.ts(project.json + 字體註冊表)   │
              └────────▲───────────────────────▲────────┘
                       │                        │
            ┌──────────┴─────────┐   ┌──────────┴─────────────┐
            │ cli/               │   │ web/                   │
            │ index(指令入口)     │   │ server.ts(薄後端+REST) │
            │ render/vars/ui     │   │ ui/editor.ts(前端)     │
            │ headless(Playwright)│   │ ui/index.html(深色殼)  │
            └────────────────────┘   └────────────────────────┘
                  ✗ cli  ───────────────────────  web ✗(互不依賴)

兩個瀏覽器 bundle(由 esbuild 產出 dist/web/):
  engine.bundle.js  = core/engine(fabric 映射+守門)   ← 編輯器頁 與 headless 頁「共用同一份」
  editor.bundle.js  = web/ui/editor.ts(面板/工具列)   ← 只透過 window.teditEngine 跟引擎講話

   ┌── 編輯器頁(index.html)──┐        ┌── headless 頁(headless.html)──┐
   │ engine.bundle + editor   │        │ engine.bundle 單獨               │
   │ .bundle,人在編輯          │        │ Playwright 灌場景→截圖           │
   └──────────┬───────────────┘        └──────────────┬─────────────────┘
              └───────── 同一份 engine.bundle ─────────┘  ← 同像素的結構保證(D11)
```

---

## 4. 核心資料結構（模板 = 一棵 JSON 樹）

```
Template ─────────────────────────────────────────────────────────
│ teditVersion : "0.1"          schema 版本(供遷移)
│ canvas       : CanvasSpec     畫布
│ elements     : Element[]      陣列順序 = z-order(索引 0 在最底)
│ bindings     : Binding[]      變數定義(獨立區塊,S03/D15)
└──────────────────────────────────────────────────────────────────

CanvasSpec
  width, height : number(px)
  background    : "#ffffff"  或  { image: "assets/.../bg.png" }

Element(三型共用 ElementBase:id, type, x, y, rotation)
┌ TextElement  type:"text"   width, content, fontFamily, fontSize,
│                            color, align, lineHeight
│                            ⚠ 無 height — 由內容推導,不入庫(D17)
├ ImageElement type:"image"  width, height, src, fit:cover|contain|stretch
└ ShapeElement type:"shape"  width, height, shape:rect|ellipse|line,
                             fill, stroke, strokeWidth

Binding(把某元素的某屬性綁到具名變數)
  var     : "title"          變數名(= 資料檔的 key)
  element : "txt1"           目標元素 id
  prop    : "content"|"src"  v1 可綁:文字內容 / 圖片來源
  type    : "text"|"image"   與 prop 一致(驗證器強制)
  ※ 同一變數可綁多處(一處資料、多處反映);元素永遠存「設計時預設值」
```

### 具體範例(精簡版 card.template.json)

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
      "content": "春江潮水連海平…",          // ← 設計時預設值
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

## 5. 引擎映射層：schema ↔ 畫布物件（全系統最危單點）

```
              load(scene)                         save(物件樹)
   schema ───────────────▶  fabric 物件樹  ───────────────▶  schema
  (能描述)   逐元素轉成        (能畫/能編)      逐物件轉回      (存得回)
            fabric 物件                       schema 欄位

  範例(座標系轉換):
    schema:  x,y = 未旋轉左上角            fabric:  left,top = 中心點
    load →   left = x + width/2           save →   x = centerX - width/2
             top  = y + height/2                   y = centerY - height/2

  為什麼危險?save 漏一個欄位 = 使用者編了、看見了,存檔後「靜默消失」。
  看守機制(D12):往返測試  load→save 必須逐欄位等於原 JSON。
  ▶ 上線當天就抓到兩條真 bug:
      ① 圖片 contain 把「設計框」存成「縮排後內容框」
      ② line 形狀把 fabric 預設黑回寫進 fill
    (已修;這就是 ARCHITECTURE 把 save 列為最危單點的實證)
```

---

## 6. 一個變數的旅程（render 時 `title` 怎麼變成 PNG 上的字）

```
資料檔 data.yaml          模板 card.template.json
  title: "新標題"   ──┐      bindings:[{var:title, element:txt1, prop:content}]
  photo: ./a.png    │              │
                    ▼              ▼
            ┌─────────────────────────────────┐
            │ resolver(純函式,零 I/O)          │
            │ 把 title 值寫進 txt1.content       │  缺值→沿用設計時值+warning
            │ 圖片變數路徑重映射為專案相對        │  --strict 缺值→exit 4
            └────────────────┬────────────────┘
                             ▼ ResolvedScene
            ┌─────────────────────────────────┐
            │ headless(Playwright + Chromium)  │
            │ 載入 engine.bundle → 灌場景       │  字體 fonts.ready + 圖片 decode
            │ → 等渲染完成信號 → 截圖           │  鎖 deviceScaleFactor(--scale)
            └────────────────┬────────────────┘
                             ▼
                          out.png   ← stdout 只印這個絕對路徑(D04)

退出碼:0 成功 / 1 其他 / 2 參數 / 3 模板 / 4 缺變數(strict) / 5 資產載入
```

---

## 7. 現在能做 / 還沒做

```
✅ 已完成
   M0 選型擂台(fabric 勝)   M1 渲染核心+測試     M2 render CLI
   M3 變數綁定(resolver)    M4 編輯器(設計→綁變數→存檔,完整)

❌ 還沒做
   M5 整合打磨:① 編輯器存的模板 → CLI 出圖 端到端同像素
                ② 內建字體 woff2 打包(D19)
                ③ examples 完整化 + README quick start
                ④ IME 正式驗證收尾
   M6 背包:undo/redo、群組、對齊輔助線吸附、URL 圖片變數、中英混排斷行…
```
