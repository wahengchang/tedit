# tedit 專案管理總表(project-manager.md)

> 一頁看完:**主要模組結構（每個標完成狀態）** + **工作進度看板（每項標狀態）**。
> 更新:2026-06-16(全圖層 階段 1–4 完成)· 分支:`feature/layer-compositor`(`main` 為穩定 v1)
> 工程細節見 `STATUS.md`;決議見 `docs/README-HANDOVER.md §4`;圖見 `docs/OVERVIEW-VISUAL.md`。

狀態圖例:✅ 完成　🔨 進行中　⬜ 未開始　🛡️ 暫行守衛(非正式)　⏳ 等人工/外部

---

## 1. 主要模組結構(每個模組/子模組 + 完成狀態)

```
tedit/
├── core/  共用核心(純邏輯)
│   ├── scene/         schema 真相 ........................... ✅
│   │   ├── types.ts        型別(text/image/shape/html+畫布+bindings) ✅(html 新增)
│   │   └── validate.ts     驗證器(定位到 id+欄位;含 html/bindings)  ✅
│   ├── resolver/index.ts   變數注入 resolveScene + scanVars ........ ✅
│   ├── project.ts          project.json + 字體註冊表(含內建字)..... ✅
│   └── engine/        渲染引擎(fabric v7,只跑瀏覽器)
│       ├── fabric-mapping.ts  映射層 load/save(往返測試看守 D12)... ✅
│       ├── gate.ts            渲染守門(fonts.ready + 圖片 decode)... ✅
│       ├── browser-entry.ts   bundle 入口(boot 單canvas + 編輯器API + renderLayers)✅
│       └── compositor.ts      多層合成器(每元素一層 + iframe;CLI 出圖用).......✅
├── cli/  指令層(tedit ui/render/vars;退出碼 0–5)
│   ├── index.ts            argv + 退出碼 ......................... ✅
│   ├── shared.ts           模板載入/專案定位/CliError ............ ✅
│   ├── render.ts           render 全鏈路(resolve+注入+--strict).. ✅
│   ├── vars.ts             變數列表(表格/--json)................ ✅
│   ├── ui.ts               子行程起 server ...................... ✅
│   └── headless/render-png.ts  Playwright 出圖(已切合成器).......✅
├── web/  瀏覽器端
│   ├── server.ts           薄後端(REST 5 端點+上傳+history)..... ✅
│   └── ui/
│       ├── index.html      深色編輯器殼(D20)................... ✅
│       ├── editor.ts       編輯器前端(M4 全功能 + html 佔位框/貼碼).. ✅
│       └── headless.html   headless 出圖頁 ...................... ✅
├── 測試 harness
│   ├── test/run-unit.mjs        core 純函式單元 .................. ✅
│   ├── e2e/run-parity.mjs       同像素 parity(10 樣本)......... ✅
│   ├── e2e/run-editor.mjs       編輯器互動 e2e .................. ✅
│   ├── e2e/run-e2e.mjs          編輯器↔CLI 端到端同像素 ......... ✅
│   ├── e2e/run-compositor-parity.mjs  合成器可重現+html ......... ✅
│   └── e2eCli/run-cli.mjs       CLI 情境(含 html render)....... ✅
├── examples/demo/          範例專案(card/multibind/html-card)... ✅
├── spike/                  M0 擂台 + 合成器 spike(已歸檔)....... ✅
└── docs/ + STATUS.md + 本檔  文件 ........................... ✅

模組完成度:核心 core ✅ · CLI ✅ · web/server ✅ · 編輯器 ✅(含 html 圖層)· 測試 ✅
            全圖層重構 階段 1–4 完成;v1 + HTML 圖層 已可端到端使用
```

---

## 2. 工作進度看板(里程碑 / 階段 + 狀態)

| 里程碑 | 內容 | 狀態 | 備註 |
|--------|------|------|------|
| M0 | 選型擂台(fabric vs Konva) | ✅ | fabric v7 勝(D13);決議 D13–D17 |
| M1 | 渲染核心 + test-harness | ✅ | 往返測試抓到 2 條 save bug 已修 |
| M2 | render CLI(出 PNG) | ✅ | --scale、退出碼 0–5 全測 |
| M3 | 變數綁定(resolver) | ✅ | 注入/fallback/--strict;vars |
| M4 | 編輯器 v1(深色 Figma) | ✅ | 選取/拖拉/屬性/圖層/增刪複製/行內編輯/綁定 |
| M5 | 整合打磨 | 🔨 | ✅端到端同像素 ✅woff2 內建字 ✅examples/README;**唯一未完=⏳ IME 人工(需你本人測)** |
| D22 | 全圖層重構(HTML 圖層) | ✅ | 階段 1–4 完成、端到端可用;僅留 1 個「可選」項(見下方) |
| M6 | 擴充背包 | ⬜ | 未來範圍,尚未開始:undo/群組/輔助線/URL圖/批次/混排斷行 |

> **為什麼不是全綠?** 程式碼與測試**全綠**(npm test 六關通過)。非綠只有三種:
> ① M5 的 **IME 人工驗證**(機器測不了,等你打注音)② M6 **未來擴充**(本輪不做)
> ③ 一個 **可選** 的編輯器即時 HTML 預覽(刻意略過)。**沒有任何項目是壞掉或半成品。**

### D22 全圖層重構(分階段)

| 階段 | 內容 | 狀態 |
|------|------|------|
| spike | 三層交錯 + 跨 document 守門 diff=0 | ✅ |
| 1 | schema 加 html 元素類型(types/validate) | ✅ |
| 2 | 合成器核心 compositor.ts(每元素一層 + iframe) | ✅ |
| 3 | CLI 出圖切合成器 → **能 render html 模板** | ✅ |
| 4 | 編輯器可編 html 圖層(**佔位框法**:可拖/縮放/正確 z-order + 貼整段 HTML 代碼;保留 IText) | ✅ |
| (可選) | 編輯器內「即時 html 預覽」(目前顯示佔位框,真內容在出圖) | ⬜ 非必要(使用者貼好代碼出圖即可) |

---

## 3. 現在做到哪了(自包含答案)

### 全部做完了嗎?
**核心 v1 + HTML 圖層 = 做完了、而且全綠。** 唯二收尾不是「沒寫完的程式」,是:
(1) 中文 IME 人工驗證(機器測不了,要真人打注音);(2) 要不要把 `feature/layer-compositor` 合回 `main`。

### 現在能做什麼(可直接 demo)
| 能力 | 怎麼跑 | 結果 |
|------|--------|------|
| 變數注入:同模板換資料 | `tedit render card.template.json a.yaml` / `b.yaml` | 同版面、不同標題(設計一次、換資料量產) |
| HTML 圖層出圖 | `tedit render html-card.template.json empty.yaml` | 矩形→HTML 漸層面板→文字 三層交錯,像素精準 |
| 編輯器加 HTML | 開 `tedit ui` → ＋HTML → 屬性面板貼整段代碼 → 存檔 | 畫布上是可拖/縮放佔位框;出圖時才渲染真內容 |
| 一鍵示範 | `npm run render:demo` / `npm run ui:demo` | — |

### 綠不綠的真相(誠實版)
- **程式碼 + 測試:全綠** — `npm test` 結束碼 0、**六關全過**(unit / parity / cli / editor / e2e / compositor),lint + typecheck 乾淨。
- **看板上的非綠 = 3 類,沒有一個是壞掉或半成品**:
  - `M5 🔨` → 只差 **IME 人工驗證**(等你打注音)
  - `M6 ⬜` → **未來擴充**(undo/群組/輔助線/批次…),本輪不做
  - `(可選)即時 HTML 預覽 ⬜` → **刻意略過**(貼好代碼出圖即可,不需要)

### 階段 4 決議(已定)
走 **C(佔位框法)**:不做 proxy-overlay 大重寫,**保住 M4 單 canvas + IText 行內編輯**;
html 在編輯器顯示佔位框(內容出圖時渲染),貼合「準備好整段代碼貼上」的工作流。
(日後若要「編輯器內即時 HTML 預覽」才需 compositor-editor;目前非必要。)

### 剩下兩件(等你)
1. **中文 IME 人工驗證**:開 `tedit ui`,雙擊文字用注音打中文,確認不掉字/不跳位 → M5 收尾。
2. **合併分支**:`feature/layer-compositor` 全綠、`main` 受保護,隨時可合。

### 風險備忘
fabric lineHeight 1.13 常數(升版要重驗,往返測試會抓);英文混排斷詞(列 M6);
無遠端 repo → CI 硬指標暫以本地 `npm test` 代行。
