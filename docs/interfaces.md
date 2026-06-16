# tedit 模塊接口資料結構 + 範例(interfaces.md)

> 用途:把「模塊之間交互的資料結構」配上**實際範例**,方便溝通,並把幾件
> **不確定/複雜的事**用具體例子釘下來給你拍板。
> 對照:OVERVIEW-VISUAL.md(全貌與圖)、mapping-table.md(映射層轉換);範例在 interface-examples/。
>
> 圖例:✅ 已實作可用    ❓ 待你確認(提案,尚未實作)

---

## 這份文件涵蓋哪些契約(先看這個)

模塊之間靠下面這些「契約」溝通。**一共 6 個,不是 4 個**——你先看到的 1～4 是最主要的,
另外還有 §5(core 函式回傳型別),以及兩個底層契約。

| # | 契約 | 一句話:它是什麼 |
|---|------|------------------|
| 1 | **Template**(`*.template.json`) | 「模板長怎樣」的唯一真相;編輯器產生、CLI 讀,**流經所有模塊**。最核心。 |
| 2 | **資料檔**(`*.yaml`/`*.json`) | 使用者手寫的變數值;`render` 把它灌進模板。 |
| 3 | **EngineHandle**(`window.teditEngine`) | engine.bundle 對 editor.bundle 暴露的方法;**兩個 bundle 之間唯一的橋**。 |
| 4 | **REST API**(`/api/*`) | 編輯器前端 ⇄ server 後端的 HTTP 接口(純 JSON)。 |
| 5 | **core 函式回傳型別** | validate / resolve / project 三個純函式的回傳結構。 |
| 6 | **(底層)RenderOptions / 退出碼** | cli → headless 的參數、cli 對外的 exit code;細節少,本文件僅帶過。 |

分三層看:**資料契約**(1、2)+ **程式接口**(3、4、5)+ **底層**(6)。

---

## 0. 邊界地圖(誰跨誰)

```
  HTTP/JSON           ┌──── core ────┐         函式回傳型別
editor ⇄ server       │  Template     │      validate → ValidationResult
    │                 │ (通用資料契約) │      resolver → ResolveResult
    │                 └──────────────┘      project  → ProjectConfig
 ┌──┴───┐  ┌─────┐  ┌──────┐
 │server│  │ cli │  │engine│ ◀═ EngineHandle(跨 bundle)═▶ editor.bundle
 └──────┘  └──┬──┘  └──────┘     (window.teditEngine)
           ┌──┴────┐
           │headless│ ◀ RenderOptions
           └────────┘
```

(上圖只畫主要邊界;完整 6 個契約見開頭「這份文件涵蓋哪些契約」表。)

---

## 1. ✅ 通用資料契約:`Template`(模板檔 `*.template.json`)

到處流動的核心結構。完整範例(card):

```json
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
      "content": "春江潮水連海平…",
      "fontFamily": "Noto Sans TC", "fontSize": 28,
      "color": "#f4f1ea", "align": "left", "lineHeight": 1.5 }
  ],
  "bindings": [
    { "var": "title", "element": "txt1", "prop": "content", "type": "text"  },
    { "var": "photo", "element": "img1", "prop": "src",     "type": "image" }
  ]
}
```

注意:文字元素**沒有 height**(由內容推導);`elements` 陣列順序 = z-order(0 在最底)。

---

## 2. ✅ 資料檔(`*.yaml` / `*.json`)+ 路徑解析(複雜,用例子釘死)

最簡單的資料檔(YAML,為手編而設計):

```yaml
title: "這次的標題"
photo: ../assets/images/a.png    # 圖片變數:相對「資料檔所在目錄」
```

等價 JSON(render 兩種都吃):

```json
{ "title": "這次的標題", "photo": "../assets/images/a.png" }
```

**圖片路徑解析(D21,最容易誤解的地方)—— 三個 worked example:**

```
專案結構:
  my-project/
  ├── data/sample.yaml        ← 資料檔在這
  └── assets/images/a.png     ← 圖片在這

情境 A(正常):   photo: ../assets/images/a.png
  → 以 data/ 為基準解析 → my-project/assets/images/a.png ✅ 在專案夾內 → 出圖

情境 B(缺檔):   photo: ../assets/images/沒這張.png
  → 解析後檔案不存在 → exit 5,stderr 指名「圖片變數 photo 的檔案不存在」

情境 C(夾外):   photo: /Users/xxx/Desktop/別人的.png
  → 解析後落在專案夾外 → exit 5「必須位於專案資料夾內」(D08 自足性)
```

**缺變數行為(D05)—— 兩個例子:**

```
資料只給 title、沒給 photo:
  預設模式 → photo 沿用「設計時值」(模板裡 img1.src)+ stderr warning,exit 0
  --strict → exit 4,stderr 列出缺的變數
```

---

## 3. ✅ 跨 bundle 契約:`EngineHandle`(engine.bundle ↔ editor.bundle)

兩個 bundle 不互相 import,只透過 `window.teditEngine` 的這個 handle 溝通。
**`saveScene()` 回傳的就是一個 `Template`**(上面 §1 那種 JSON)。

互動序列範例(編輯器一次「改字 → 存檔」):

```
editor.ts                              engine.bundle(EngineHandle)
─────────                              ──────────────────────────
boot('edit', #stage)            ──▶    建立 fabric Canvas,回傳 handle
handle.loadScene(tpl, fonts,'/')──▶    schema → fabric 物件樹(load 映射)+ 守門
(使用者雙擊文字打字)             ◀──    canvas 觸發 onChange 回呼
handle.saveScene()              ──▶    fabric 物件樹 → Template(save 映射)
   ↑ 回傳的 Template ↓
PUT /api/templates/card  ───────▶ server 驗證 + 寫檔 + history
```

`saveScene()` 回傳範例(改完字後,只有 content 變,版面欄位不動):

```json
{
  "teditVersion": "0.1",
  "canvas": { "width": 1200, "height": 630, "background": "#f4f1ea" },
  "elements": [
    { "id": "txt1", "type": "text", "x": 100, "y": 110, "width": 440,
      "rotation": 0, "content": "【改過的新標題】", "fontFamily": "Noto Sans TC",
      "fontSize": 28, "color": "#f4f1ea", "align": "left", "lineHeight": 1.5 }
  ],
  "bindings": []
}
```

---

## 4. ✅ web REST 契約(editor.ts ⇄ server.ts,純 JSON over HTTP)

| 方法 | 路徑 | 請求 body | 成功回應 | 失敗回應 |
|------|------|-----------|----------|----------|
| GET  | `/api/project` | — | `200` ProjectConfig | — |
| GET  | `/api/templates` | — | `200` `["card","multibind"]`(模板名陣列) | — |
| GET  | `/api/templates/:name` | — | `200` Template | `404` |
| PUT  | `/api/templates/:name` | Template | `200` `{ "ok": true }` | `400` `{ error, details[] }` |
| POST | `/api/assets/images?name=檔名` | 圖片 binary | `200` `{ "path": "assets/images/檔名" }` | `400` `{ error }` |

> PUT 會先跑 `validateTemplate` 才寫檔(server 端守 schema),並同步寫一份 history 副本。
> 完整 request/response body 範例見 `interface-examples/4-rest-api.md`。

---

## 5. ✅ core 純函式回傳契約(範例)

```jsonc
// validateTemplate(badJson) —— 失敗時(→ cli exit 3)
{ "ok": false,
  "errors": [
    { "path": "elements[0](rect1).width", "message": "必須是正數" },
    { "path": "bindings[1].type",          "message": "prop \"src\" 的型別必須是 \"image\"" }
  ] }

// resolveScene(scene, { title:"新標題" }) —— 缺 photo
{ "scene": { /* 注入後的 Template,title 已換、photo 用設計時值 */ },
  "warnings": [ "變數 \"photo\" 未提供,沿用設計時值" ],
  "missing":  [ "photo" ] }            // ← --strict 時據此 exit 4

// scanVars(scene) —— vars 指令用(同名變數綁多處 → locations 多筆)
[ { "var":"title", "type":"text",
    "locations":[ {"element":"heading","prop":"content","designValue":"設計時標題"},
                  {"element":"watermark","prop":"content","designValue":"設計時標題"} ] } ]
```

---

# ❓ 待你拍板的不確定/複雜項(用範例溝通)

下面三項**尚未實作**,我用具體資料結構畫出來,讓你確認方向再動工。

## A. ❓ 批次資料表量產(M6)—— 建議用 CSV

需求 §13 把「批次量產」列為 v1 非目標,但 M6 要做。現在是「外部重複呼叫」;
若要內建批次,最自然的輸入是 **CSV(每列一張圖,欄名 = 變數名)**:

```csv
__out,title,photo
card-01.png,第一張的標題,./images/a.png
card-02.png,第二張的標題,./images/b.png
card-03.png,第三張的標題,./images/c.png
```

對應的指令提案:
```
tedit render-batch card.template.json data.csv --out-dir ./out/
  # 每列 → 一張圖;__out 欄指定檔名;其餘欄當變數注入(沿用單筆的 resolver)
```

**要你確認的點:**
1. 欄名約定:用 `__out` 當輸出檔名欄?還是另開 `--name-col`?
2. 缺欄(某列沒給某變數)→ 沿用設計時值(同 D05)還是整批 strict?
3. 新指令 `render-batch` vs 既有 `render` 加 `--csv`?(D03 說「僅三個指令」,加第四個要破例)

## B. ❓ schema v0.2 擴充(更多可綁屬性 + 樣式)

讓「任意屬性都能綁變數」(需求 §9 完整版)。擴充後的範例:

```jsonc
// 元素多兩個欄位
{ "id":"txt1", "type":"text", "x":100, "y":110, "width":440, "rotation":0,
  "content":"標題", "fontFamily":"Noto Sans TC", "fontSize":28,
  "color":"#f4f1ea", "align":"left", "lineHeight":1.5,
  "opacity": 1,        // ← 新:0..1
  "visible": true      // ← 新:可被變數控制顯隱
}

// bindings 可綁的 prop/type 變多
"bindings": [
  { "var":"title",   "element":"txt1", "prop":"content", "type":"text"    },
  { "var":"主色",     "element":"rect1","prop":"fill",    "type":"color"   },  // ← 新
  { "var":"顯示標章", "element":"txt1", "prop":"visible", "type":"boolean" }   // ← 新
]
```

對應資料檔:
```yaml
title: "標題"
主色: "#d62828"        # color 型變數吃 CSS 色值
顯示標章: false        # boolean 型變數吃 true/false
```

**要你確認的點:**
1. 可綁範圍就停在 color/fill/visible,還是也要 fontSize/opacity?(每多一個繳「五步漣漪稅」)
2. `teditVersion` 升 `0.2`,舊 `0.1` 檔自動補 `opacity:1/visible:true`(遷移函式)——OK 嗎?
3. boolean 變數的字面:`true/false` 之外要不要也接受 `1/0`、`yes/no`?

## C. ❓ 圖片變數放寬(目前 D21 = 只認專案夾內)

你上次選「維持夾內」。若之後想放寬成「夾外自動複製進 assets/」,資料結構不變,
只是 render 多一步複製。**先記著,暫不動**。

---

## 怎麼用這份文件
- 看 ✅ 的部分 = 確認你對現有接口的理解。
- 看 ❓ 的部分 = 直接針對 A/B/C 的「要你確認的點」回我答案,我就照定案實作 + 更新 schema 文件。
