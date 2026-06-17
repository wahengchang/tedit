# D23 — 一資料夾一專案一模板(1:1 重構)

狀態:**進行中**(branch `feat/one-template-per-project`,從 main 開)
取代:M0–M6 的「專案資料夾裝多個模板(`templates/` 子夾 + 按名字定址)」模型。

## 決議

**一個 project = 一個資料夾 = 剛好一個 template。** 砍掉「一夾多模板」。

使用者痛點:手上一個模板,想直接開來編,但編輯器硬性要求模板放在 `某夾/templates/` 並按名字定址,做不到。CLI render 早就能吃單檔(`locateProject`),缺口只在編輯器/UI。決議不是補單檔模式,而是把整個模型改成 1:1,讓「資料夾即模板」。

## 資料夾佈局(定案)

```
./projectName/                 ← 一個 project;資料夾名 = 專案名 = 預設出圖檔名
├── template.json              ← 唯一模板,固定保留檔名(資料夾根)
├── *.json (e.g. data.json)    ← 變數值,給 render 套用/批量(template.json、project.json 為保留名,其餘 *.json 皆視為資料候選)
├── project.json               ← 可選:自訂字體 / canvas 預設(只有需要時才有)
├── images/                    ← 圖片素材(模板內寫 "images/foo.png")
├── fonts/                     ← 可選:自訂字體檔
└── .tedit/history/            ← 存檔快照(單模板,命名 = 時間戳即可)
```

保留檔名:`template.json`(模板本體)、`project.json`(設定)。其餘 `*.json` 一律當資料檔候選。

## 與舊模型的差異

| 面向 | 舊(多模板) | 新(1:1) |
|---|---|---|
| 模板位置 | `<dir>/templates/<name>.template.json` | `<dir>/template.json` |
| 定址 | 按名字 `?template=<name>`、`/api/templates/<name>` | 無名字,就那一個 |
| 模板列表/首頁 | 有(掃 templates/) | **砍掉** |
| 圖片路徑 | `assets/images/x.png` | `images/x.png` |
| project.json | 可選,驅動字體 | 可選,只放字體/預設,不再驅動探索 |
| 出圖檔名 | 模板名 | 資料夾名 |

## 讀寫契約

### 網頁編輯器
- `npm run ui ./projectName` → server `--dir ./projectName` → 編輯器直接載入 `./projectName/template.json`。
- 無 `template.json` → 視為新專案,空白模板,首次存檔即建 `template.json`。
- 存檔 PUT 寫回 `./projectName/template.json` + `.tedit/history/<時間戳>.json`。
- 砍掉 start page / 模板卡片 / `?template=` / 建新模板流程 / `/api/templates` 列表。
- 狀態列路徑顯示 `template.json`;Export 的 CLI 提示改 `tedit render . data.json -o <folder>.png`。

### CLI
- `tedit render ./projectName [dataFile] [-o out.png]` — 給資料夾 → 推 `template.json` + 可選資料(省略 = 空資料,走設計時值)。
- `tedit render ./projectName/template.json dataFile` — 顯式檔案形式仍可用。
- 專案根 = 模板所在資料夾(`locateProject` 簡化:不再往上找 templates/,資料夾就是根)。
- 資產(images/fonts)相對資料夾根解析;越界/缺檔 → exit5(沿用 D09/D21)。

## 範圍與成本

觸及:schema 不動(本branch不摺字體進 template,維持 project.json 可選);`shared.ts`/`render.ts`/`server.ts`/`ui.mjs`/`cli/ui.ts`/`cli/index.ts`/`editor.ts`/`index.html`;examples(demo 3 + showcase 3 + 根 project1)遷移;e2e/test 全改;文件同步。

**本 branch 不做**(另立決策):把 `fonts` 摺進 `template.json` 徹底消滅 `project.json`(= schema v0.2 範疇,memory 記未拍板)。本 branch 保留 `project.json` 可選,先把 1:1 與單模板讀寫打通。

## 風險

- 共用字體/素材:1:1 下每夾自帶一份(系統禁跨夾引用)。常見情形靠內建 Noto Sans TC 兜底,無痛。
- 批量(量產):仍成立 = 一個 template + 多個 `*.json` 資料檔在同夾。
- 遷移破壞既有 examples / e2e:必然成本,本 branch 一併處理直到 `npm test` 全綠。
