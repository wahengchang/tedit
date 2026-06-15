# tedit

**本地視覺模板編輯器**:在瀏覽器自由設計版面、把任意元件綁成具名變數存成「模板」;
之後用 CLI 餵一份資料、headless 產出 PNG。同一模板換不同資料可重複產生。

> 最硬的鐵律:**編輯器所見 與 CLI headless 產出,逐像素相同**。
> 怎麼保證?編輯器頁與 headless 頁載入「同一份 engine bundle」、跑「同一顆 Chromium」。

```
   設計(瀏覽器編輯器)──▶ 模板(.template.json)──▶ tedit render + 資料.yaml ──▶ PNG
                                                          (換資料重複呼叫 → 換內容、同版面)
```

---

## 安裝

```bash
git clone <repo> teditor && cd teditor
npm install
npx playwright install chromium   # headless 出圖需要
npm run build
```

(可選)裝成全域指令:`npm link` 之後即可直接用 `tedit …`;
否則把下文的 `tedit` 換成 `node dist/cli/index.js`。

## 快速開始(三個指令)

```bash
# 1) 開編輯器設計(深色介面;設計→拖拉/分層→把元件綁成變數→存檔)
tedit ui --dir examples/demo

# 2) 看模板裡有哪些變數(方便備資料)
tedit vars examples/demo/templates/card.template.json

# 3) 餵一份資料 → 出一張 PNG
tedit render examples/demo/templates/card.template.json examples/demo/data/a.yaml -o out.png
```

一鍵看「同模板換資料」效果:`bash examples/demo/render-all.sh`(card × 兩份資料 → 兩張圖)。

## CLI 一覽

| 指令 | 作用 |
|------|------|
| `tedit ui [--port n] [--dir path] [--no-open]` | 起本地 server + 開編輯器 |
| `tedit render <模板> <資料> [-o out.png] [--scale n] [--strict]` | 模板+資料 → PNG |
| `tedit vars <模板> [--json]` | 列出模板的具名變數 |

- `render` 的 **stdout 只印產物絕對路徑**(可 `OUT=$(tedit render …)`),其餘走 stderr。
- 退出碼:`0` 成功 / `1` 其他 / `2` 參數 / `3` 模板 / `4` 缺變數(--strict) / `5` 資產載入失敗。
- 缺變數:預設沿用設計時值並警告;`--strict` 才報錯(exit 4)。

## 專案資料夾(資料夾即專案)

```
my-project/
├── project.json          # 畫布預設 + 字體註冊表
├── templates/*.template.json
├── assets/{images,fonts}/
├── data/*.yaml
└── .tedit/history/        # 每次存檔的時間戳副本
```

字體只認專案 `assets/fonts/` 內的檔 + 內建 Noto Sans TC;缺字體 exit 5,不靜默 fallback。

## 開發

```bash
npm run build       # tsc + esbuild(產 dist/,含兩個瀏覽器 bundle)
npm test            # 單元 + 同像素 parity + CLI 情境 + 編輯器 e2e + 端到端 parity
npm run lint
```

## 文件

- `STATUS.md` — 進度總覽(✅/❌ 檔案樹 + 里程碑)
- `docs/OVERVIEW-VISUAL.md` — 全貌視覺化(流程/編輯器功能/架構/核心資料結構)
- `docs/README-HANDOVER.md` — 交接總覽 + 決議總帳(D01–D21)
- `docs/ARCHITECTURE.md`、`docs/SPEC-*.md` — 架構與規格合約
