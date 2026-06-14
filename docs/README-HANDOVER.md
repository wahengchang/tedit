# tedit 交接總覽(README-HANDOVER)

> 給接手團隊的第一份讀物。讀完本文約 30 分鐘可掌握全貌。
> 需求源頭:`visual-template-studio-REQUIREMENTS.md`(第 0 份文件,原樣保留,本包所有文件回鏈其章節號)。

---

## 1. 專案一句話

**tedit**:本地 Node.js 視覺模板編輯器。瀏覽器裡自由設計版面、把任意元件綁成具名變數存成模板;之後用 CLI 餵一份資料 headless 產出 PNG。**編輯器所見與 CLI 產出必須同像素**(需求 §4,全案最硬約束)。

```
   設計(瀏覽器編輯器)──▶ 模板(場景+變數定義).template.json
                                  │
              CLI: tedit render 模板 + 資料.yaml
                                  ▼
                              一張 PNG(換資料重複呼叫)
```

## 2. 文件包閱讀順序

| 順序 | 文件 | 性質 | 何時讀 |
|------|------|------|--------|
| 0 | visual-template-studio-REQUIREMENTS.md | 需求源頭 | 最先 |
| 1 | 本文 README-HANDOVER.md | 入口/索引/決議總帳 | 第二 |
| 2 | ARCHITECTURE.md | 架構合約(不變的) | 動工前必讀 |
| 3 | SPEC-CLI-AND-FILES.md | CLI 與檔案規格(不變的) | 寫 cli/server 前 |
| 4 | SPEC-SCENE-SCHEMA.md | 場景 Schema v0 草案 | 寫 core 前 |
| 5 | SPIKE-BRIEF.md | M0 擂台任務書(已歸檔) | 回顧選型 |
| 6 | MILESTONES-AND-TODO.md | 里程碑與工作清單(隨進度打勾) | 排程用 |

> 動工後新增的活文件(在 repo 根 / docs):
> - **../STATUS.md** — 進度總覽(✅/❌ 檔案樹+里程碑),每完成一項即更新。
> - **OVERVIEW-VISUAL.md** — 全貌視覺化(流程/編輯器功能地圖/架構/核心資料結構)。

「不變的合約」(2/3/4)如需修改,請以決議形式更新本文第 4 節總帳;「會被消耗的」(5/6)隨進度打勾歸檔。

## 3. 技術棧與成案脈絡(已定方向)

- Node + TypeScript,**單一 package**(結構仿 `wahengchang/chainq`:`src/{core,cli,web}` 資料夾分層、單一建置、npm bin)。
- headless 出圖:**Playwright** 載入與編輯器**同一份 engine bundle**(同像素的結構保證)。
- 渲染基底:**fabric v7 已定案**(D13,M0 擂台勝出;交接時文件寫 v6,實作版最新為 v7)。
- 前端框架:**vanilla TS 已定案**(D14)。編輯器/headless 共用 `engine.bundle.js`;編輯器另有 `editor.bundle.js`。
- 已調研並排除直接採用的現成方案:Polotno(閉源商業 SDK,但其「單一 JSON schema 貫穿編輯/出圖」架構是重要參考)、vue-fabric-editor(MIT、6.5k★,**最佳借鏡活體**,輔助線/歷史/字體載入可參照)、layerhub react-design-editor(已棄坑)、Penpot/tldraw/Excalidraw(量級或授權或定位不合)。結論:**選基底自建、選活體借鏡**。

## 4. 決議總帳(Decision Ledger)

> 改任何一條 = 開新決議、更新此表、同步受影響文件。

| # | 分支 | 結論 | 出處文件 |
|---|------|------|----------|
| D01 | 三分架構 | core / cli / web,單向依賴,cli 與 web 互不依賴 | ARCHITECTURE §1 |
| D02 | 倉庫結構 | chainq 式單包,`src/{core,cli,web}`,ESLint 守依賴方向 | ARCHITECTURE §2 |
| D03 | CLI 指令 | `tedit ui` / `tedit render` / `tedit vars`,僅此三個 | SPEC-CLI §1 |
| D04 | CLI 紀律 | stdout 只印產物路徑、其餘走 stderr;退出碼 0–5 | SPEC-CLI §2 |
| D05 | 缺變數行為 | 預設用設計時值 + warning;`--strict` 才報錯(exit 4) | SPEC-CLI §1.2 |
| D06 | 引擎執行邊界 | 引擎只跑瀏覽器;headless = Playwright 載同一 bundle;**不做** node-canvas 雙軌 | ARCHITECTURE §4 |
| D07 | 模板格式 | 自訂抽象薄 schema(scene-core)+ 與基底之間的映射層;不用基底原生 JSON | SPEC-SCENE-SCHEMA |
| D08 | 專案資料夾 | 資料夾即專案:`project.json / templates/ / assets/{images,fonts}/ / data/ / .tedit/` | SPEC-CLI §3 |
| D09 | 字體 | 只認專案夾 self-host 字體 + 內建一款預設字;渲染前等 `document.fonts.ready`;缺字體 exit 5,**不靜默 fallback** | SPEC-CLI §4 |
| D10 | history 快照 | 最簡方式:每次存檔寫 `.tedit/history/<名>.<時間戳>.json` 全量副本,不清理不去重(後續再優化) | SPEC-CLI §5 |
| D11 | 同像素驗收 | 同場景雙路徑(編輯器/headless)渲染 → pixelmatch 逐像素 diff = 0,CI 硬指標 | ARCHITECTURE §6 |
| D12 | 往返測試 | 映射層 load→save→load 必須逐位元相等,CI 硬指標(防 save 方向靜默資料遺失) | ARCHITECTURE §5、SPEC-SCENE-SCHEMA §5 |
| D13 | 渲染基底(S01) | fabric v7(擂台四任務全過、diff 全 0;勝在實作成本與 IText 原生編輯) | decisions/S01-render-base.md |
| D14 | 前端框架(S02) | vanilla TS;附 React 退場條款 | decisions/S02-ui-framework.md |
| D15 | bindings 表示法(S03) | 獨立 bindings 區塊(方案 A),型別已定稿進 scene-core | decisions/S03-bindings-format.md |
| D16 | 綁定 UX(S04) | 屬性面板開關 + 畫布角標(角標僅 UI 層,不進場景) | decisions/S04-binding-ux.md |
| D17 | 文字高度不入庫 | TextElement 只存 width,高度由內容推導(spike 發現,防 D12 必炸) | decisions/S01-render-base.md 附帶 |
| D18 | 映射層 origin | center(fabric v7 原生預設);S01 所記「編輯態毛刺」撤銷(視覺誤判) | decisions/D18-fabric-origin-and-editing.md |
| D19 | 內建字體(Q7) | Noto Sans TC Regular,完整不子集(D09 延伸),M5 以 woff2 打包 | decisions/D19-builtin-font.md |
| D20 | 編輯器視覺風格 | 深色專業風(Figma 風,深灰底 #1e1e1e);佈局=工具列頂/圖層左/畫布中/屬性右 | decisions/D20-editor-visual-style.md |
| D21 | 圖片變數路徑 | 維持「值相對資料檔目錄、必須在專案夾內」,夾外/缺檔→exit 5(D08 自足精神) | M3 實作 src/cli/render.ts |

## 5. 待決清單

### 5.1 Spike 待決 — ✅ 全數定案(2026-06-12,見 decisions/)

| # | 議題 | 結論 |
|---|------|------|
| S01 | 渲染基底 | **fabric v7**(D13) |
| S02 | 編輯器前端框架 | **vanilla TS**(D14) |
| S03 | bindings 表示法 | **獨立 bindings 區塊**(D15) |
| S04 | 變數綁定操作 UX | **面板開關+角標**(D16) |

### 5.2 小決定(❓×8)— 大多已結案

| # | 議題 | 結論/狀態 |
|---|------|-----------|
| Q1 | 圖片適配模式 | ✅ 預設 cover,enum 含 contain/stretch(schema 已實作) |
| Q2 | 圖片變數給 URL | ✅ v1 只支援本地路徑(D21 定:相對資料檔、夾內);URL 列 M6 |
| Q3 | `vars`「必填」欄位 | ✅ 不設(缺變數有 fallback,無必填概念) |
| Q4 | `--keep-alive` 常駐加速 | ⏳ v1 不做,列 M6(尚未動工) |
| Q5 | 畫布內文字行內編輯 | ✅ fabric IText 內建,雙擊即編(M4;免 overlay) |
| Q6 | server API 端點形狀 | ✅ REST 5 端點(project/templates×2/assets 上傳;server.ts) |
| Q7 | 內建預設字體選款 | ✅ Noto Sans TC Regular,不子集、woff2(D19;接線排 M5) |
| Q8 | project.json 欄位 | ✅ name/canvasDefaults/fonts 定稿(core/project.ts) |

## 6. 全系統狀態樹

```
圖例: ✅完成  🔨進行中  ❌未開始
(更新 2026-06-15:M0–M4 全收官;細節見 STATUS.md / OVERVIEW-VISUAL.md)

tedit
├── core/
│   ├── scene-core 元素schema/驗證器        ✅(含 D17 文字高度修正)
│   │   └── bindings 區塊                   ✅ S03 定稿(型別+驗證已實作)
│   ├── resolver(變數注入+scanVars)         ✅ M3
│   └── engine/ 渲染基底 = fabric v7         ✅ M1(映射層整理+修兩 bug)
│       ├── 映射層 load/save                 ✅ 往返測試看守(D12)
│       ├── 守門(fonts.ready+圖decode)      ✅ gate.ts
│       └── 編輯器 API(listLayers/select…) ✅ M4 加(headless 不呼叫)
├── cli/ 骨架/參數/退出碼(0–5 全測)          ✅ M2
│   ├── render(resolve→headless→PNG)        ✅ M2/M3(--scale、--strict exit4)
│   ├── vars(表格+--json)                   ✅
│   └── headless(Playwright)                ✅
├── web/
│   ├── editor(深色 Figma 風)               ✅ M4(屬性/圖層/增刪複製/行內編輯/綁定/角標)
│   └── server(靜態+REST5+上傳+history)      ✅
├── 專案資料夾規格(佈局/字體/history)         ✅
├── test-harness                            ✅ unit + parity(10) + e2eCli + editor e2e
│                                              (`npm test` 一鍵;無遠端 repo 故 CI 暫=本地)
└── M0 spike(S01-S04)                        ✅ 決議見 docs/decisions/

下一步 M5 整合打磨 ❌ → M6 擴充背包 ❌(見 MILESTONES §2)
```

## 7. 體量與風險速覽

工作量佔比粗估:**editor ≈ 50%** ≫ engine ≈ 20% > headless+測試 ≈ 15% > scene-core ≈ 8% > 其餘合計 ≈ 7%。
進度:M0–M4 完成(含 editor 全部),約佔 v1 工作量 ~85%;剩 M5 整合打磨。
已驗證風險:**映射層 save 方向**(ARCHITECTURE §5)——往返測試上線當天即抓到兩條真 bug(已修),看守機制有效。
殘留風險:中文 IME 僅初步人工試過(M5 正式收尾)、字體 woff2 打包未接線(M5)。
