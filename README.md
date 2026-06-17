# tedit

[![CI](https://github.com/wahengchang/tedit/actions/workflows/ci.yml/badge.svg)](https://github.com/wahengchang/tedit/actions/workflows/ci.yml)

**本地視覺模板編輯器**:在瀏覽器自由設計版面、把任意元件綁成具名變數存成「模板」;
之後用 CLI 餵一份資料、headless 產出 PNG。同一模板換不同資料可重複產生。

> 最硬的鐵律:**編輯器所見 與 CLI headless 產出,逐像素相同**。
> 怎麼保證?編輯器頁與 headless 頁載入「同一份 engine bundle」、跑「同一顆 Chromium」。

```
   一個專案 = 一個資料夾 = 一個模板(template.json)
   設計(瀏覽器編輯器)──▶ projectName/template.json ──▶ tedit render + 資料 ──▶ PNG
                                                          (換資料重複呼叫 → 換內容、同版面)
```

---

## 安裝

```bash
git clone https://github.com/wahengchang/tedit.git teditor && cd teditor
npm install
npx playwright install chromium   # headless 出圖需要
npm run build
```

(可選)裝成全域指令:`npm link` 之後即可直接用 `tedit …`;
否則把下文的 `tedit` 換成 `node dist/cli/index.js`。

## 快速開始(npm 入口,最省事)

```bash
npm run ui:demo                    # 建置 + 開編輯器(範例專案 examples/demo/card)+ 開瀏覽器
npm run ui -- ./my-project         # 開自己的專案資料夾(內含 template.json;可加 --port 5174 / --no-open)
npm run render:demo                # 一鍵:card × 兩份資料 → 兩張圖(examples/demo/out/)
npm run tedit -- vars examples/demo/card   # 任意 CLI 子指令(吃資料夾)
```

| npm 入口 | 作用 |
|----------|------|
| `npm run ui [-- <project>] [--port n] [--no-open]` | 建置 + 起編輯器 server + 開瀏覽器(`<project>` = 資料夾) |
| `npm run ui:demo` | 同上,專案 = `examples/demo/card` |
| `npm run tedit -- <args>` | 建置 + 跑 CLI(`render` / `vars` / `ui`,等同 `tedit …`) |
| `npm run render:demo` | 跑範例的一鍵出圖腳本 |

## 或直接用 CLI(三個指令)

```bash
npm run build                      # 先建置一次
# 1) 開編輯器設計(深色介面;設計→拖拉/分層→把元件綁成變數→存檔)
node dist/cli/index.js ui examples/demo/card
# 2) 看模板裡有哪些變數
node dist/cli/index.js vars examples/demo/card
# 3) 餵一份資料 → 出一張 PNG(資料可省略 → 全走設計時值)
node dist/cli/index.js render examples/demo/card examples/demo/card/a.yaml -o out.png
```

(`npm link` 後即可把上面的 `node dist/cli/index.js` 直接換成 `tedit`。)

## CLI 一覽

`<project>` = 專案資料夾(或其 `template.json`)。

| 指令 | 作用 |
|------|------|
| `tedit ui [<project>] [--port n] [--no-open]` | 起本地 server + 開編輯器 |
| `tedit render <project> [<資料>] [-o out.png] [--scale n] [--strict]` | 模板(+可選資料)→ PNG |
| `tedit vars <project> [--json]` | 列出模板的具名變數 |

- `render` 的 **stdout 只印產物絕對路徑**(可 `OUT=$(tedit render …)`),其餘走 stderr。
- 退出碼:`0` 成功 / `1` 其他 / `2` 參數 / `3` 模板 / `4` 缺變數(--strict) / `5` 資產載入失敗。
- 缺變數:預設沿用設計時值並警告;`--strict` 才報錯(exit 4)。

## 專案資料夾(D23:一資料夾一專案一模板)

```
my-project/
├── template.json         # 唯一模板(固定保留檔名,資料夾根)
├── *.yaml / *.json       # 變數資料(可多份做批量;template.json/project.json 為保留名)
├── images/               # 圖片素材(模板內寫 "images/foo.png")
├── fonts/                # 自訂字體(可選)
├── project.json          # 可選:畫布預設 + 字體註冊表
└── .tedit/history/        # 每次存檔的時間戳副本
```

字體只認專案 `fonts/`(經 `project.json` 註冊)+ 內建 Noto Sans TC;缺字體 exit 5,不靜默 fallback。
`npm run ui ./my-project` 直接開該夾的 `template.json`;沒有就以空白模板開新,首次存檔即建檔。

## 開發

```bash
npm run build       # tsc + esbuild(產 dist/,含兩個瀏覽器 bundle)
npm test            # 單元 + 同像素 parity + CLI 情境 + 編輯器 e2e + 端到端 parity
npm run lint
```

## 文件

- `project-manager.md` — 進度真相(模組樹+里程碑+下一步看板+技術債)
- `docs/OVERVIEW-VISUAL.md` — 全貌視覺化(流程/編輯器功能/架構/核心資料結構)
- `docs/README-HANDOVER.md` — 交接總覽 + 決議總帳(D01–D21)
- `docs/ARCHITECTURE.md`、`docs/SPEC-*.md` — 架構與規格合約
