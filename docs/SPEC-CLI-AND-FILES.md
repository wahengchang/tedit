# tedit CLI 與檔案規格書(SPEC-CLI-AND-FILES)

> 不變的合約。對應決議:D03、D04、D05、D08、D09、D10。
> 指令名:`tedit`(已查:npm bin 乾淨,無現役衝突)。

---

## 1. CLI 指令(D03,僅此三個)

### 1.1 `tedit ui` — 開編輯器

```
tedit ui [options]
  --port <n>        預設 5173
  --dir <path>      專案資料夾(見 §3),預設 ./
  --no-open         啟動後不自動開瀏覽器
```

行為:起本地 server + 編輯器網頁;所有存檔寫入 `--dir` 指向的專案資料夾。

### 1.2 `tedit render` — 模板 + 資料 → PNG

```
tedit render <template> <data> [options]
  -o, --out <path>  輸出檔,預設 ./out.png
  --scale <n>       輸出倍率(1 = 原尺寸,2 = @2x),預設 1
  --strict          資料缺變數時報錯退出(exit 4)
```

- `<template>`:`*.template.json` 場景檔路徑。
- `<data>`:`.yaml` 或 `.json` 資料檔路徑。
- **缺變數行為(D05)**:預設沿用設計時的值並在 stderr 印 warning;`--strict` 時改為報錯。理由:單人本地工具以順手為先,且「設計時值」天然就是預設值(見 SPEC-SCENE-SCHEMA)。
- `--scale` 實作:headless 的 `deviceScaleFactor = scale`。

### 1.3 `tedit vars` — 列出模板變數

```
tedit vars <template> [options]
  --json            機器可讀輸出(預設:人類可讀表格)
```

輸出欄位:**變數名 / 型別(text|image)/ 綁定位置(元素 id+屬性)/ 設計時預設值**。同一變數綁多處時列多行(或 JSON 中為陣列)。不設「必填」欄位(❓Q3 建議:v1 缺變數有 fallback,無必填概念)。

## 2. CLI 紀律(D04)

### 2.1 stdout / stderr

- `render` 的 **stdout 只印最終輸出檔的絕對路徑**(一行),腳本可直接 `OUT=$(tedit render ...)`。
- 其餘一切訊息(進度、warning、錯誤)走 stderr。
- `vars` 的 stdout 為表格或 JSON(依 `--json`)。

### 2.2 退出碼

| code | 含義 |
|------|------|
| 0 | 成功 |
| 1 | 其他未分類錯誤 |
| 2 | 參數錯誤(指令拼錯、缺必要參數) |
| 3 | 模板檔不存在或 schema 驗證失敗 |
| 4 | `--strict` 下資料缺變數 |
| 5 | 資產載入失敗(圖片路徑無效、字體缺檔) |

## 3. 專案資料夾(D08,folder = project)

### 3.1 佈局

```
my-project/                      ← tedit ui --dir ./my-project
├── project.json                 ← 專案設定(§3.2)
├── templates/
│   └── card.template.json       ← 模板:場景 + 變數定義(SPEC-SCENE-SCHEMA)
├── assets/
│   ├── images/                  ← 編輯器上傳/拖放的圖片落地處
│   └── fonts/                   ← 專案自帶字體檔(§4)
├── data/
│   └── sample.yaml              ← 資料檔範例(慣例位置,非強制)
└── .tedit/
    └── history/                 ← 存檔快照(§5)
```

多專案 = 多資料夾(`./project1`、`./project2`),各自獨立持有設定、模板、圖片、字體與歷史。

### 3.2 project.json 欄位(草案,❓Q8 標 [待確認])

```jsonc
{
  "name": "my-project",                  // [待確認] 顯示用
  "canvasDefaults": {                    // 新建模板的預設畫布
    "width": 1200, "height": 630,
    "background": "#ffffff"
  },
  "fonts": [                             // 字體註冊表(§4)
    { "family": "Noto Sans TC", "file": "assets/fonts/NotoSansTC-Regular.otf" },
    // 同一 family 多字重:各字重一筆,weight 100..900(省略視為 400)
    { "family": "Noto Sans TC", "file": "assets/fonts/NotoSansTC-Bold.otf", "weight": 700 }
  ]
}
```

## 4. 字體規則(D09,同像素關鍵)

1. v1 **只認** `assets/fonts/` 內的字體檔 + tedit 內建一款預設字體(❓Q7 建議 Noto Sans TC)。**不偵測、不使用系統字體**——系統字體是跨機同像素的頭號殺手。
2. 字體以 `project.json` 的 `fonts[]` 註冊;模板內只存 `fontFamily` 名稱。
3. 編輯器與 headless 一律經 FontFace API 載入註冊表字體,並等 `document.fonts.ready` resolve 才允許渲染(引擎守門,見 ARCHITECTURE §6)。
4. 渲染時模板引用的字體名不在註冊表、或檔案不存在 → **stderr 明確列出缺哪個字體 + exit 5,不靜默 fallback**。靜默 fallback 會產出「看似成功但字不對」的圖,比失敗更糟。
5. **字重(fontWeight,PR1)**:模板 `text.fontWeight`(100..900,選填,預設 400)對映該 family 註冊的對應字重檔。**缺該字重不算缺字體**——瀏覽器以合成粗體(faux bold)兜底;編輯器與 headless 同引擎故合成結果同像素。要真粗體就在 `fonts[]` 另註冊一筆帶 `weight` 的字檔(tedit 不打包粗體,由使用者自帶)。

失效情境示例:使用者把模板複製到另一專案但忘了帶字體檔 → render 立即 exit 5 並指名缺檔,而非默默換字出圖。

## 5. history 快照規則(D10,刻意最簡)

- 編輯器**每次存檔**,除寫入 `templates/<名>.template.json` 外,同步寫一份全量副本:
  `.tedit/history/<名>.<YYYYMMDD-HHmmss>.json`
- 不清理、不去重、不壓縮、無 UI。回滾 = 使用者手動把副本複製回 templates/。
- 後續優化(保留上限、會話聚合、diff 檢視)列 M6,屆時再議。

## 6. 檔案格式約定

| 檔 | 格式 | 由誰產生 | 手編? |
|----|------|----------|-------|
| 模板 `*.template.json` | JSON,schema 見 SPEC-SCENE-SCHEMA | 編輯器序列化 | 否(機器產出) |
| 資料 `*.yaml` / `*.json` | 扁平 key→value | 使用者 | 是(為手編而設計) |

資料檔示例:

```yaml
title: "這次的標題"
photo: ./images/a.png      # 圖片變數:相對路徑(相對於資料檔所在目錄)
```

- 圖片變數值 v1 只支援本地路徑(❓Q2:URL 下載列 M6)。
- **路徑解析(D21)**:相對於資料檔所在目錄;render 會重映射成專案相對路徑供 headless 取用。
  檔案不存在或解析後落在專案資料夾外 → exit 5(維持 D08「資料夾即專案」自足性)。
- 同一變數名可被模板內多個元素共用(一處資料、多處反映,需求 §9)。
