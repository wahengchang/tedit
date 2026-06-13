# tedit 里程碑與工作清單(MILESTONES-AND-TODO)

> 會被消耗的文件:隨進度打勾。完成定義(DoD)是驗收口徑,改動須過決議。
> 全案規模:數週級(需求 §12);工作量佔比 editor≈50% > engine≈20% > headless+測試≈15% > 其餘≈15%。

---

## 1. 里程碑總覽與阻塞關係

```
M0 spike擂台 ──┬──▶ M1 渲染核心 ──▶ M2 render CLI ──▶ M3 變數綁定 ──▶ M5 整合打磨 ──▶ M6 擴充
(S01-S04定案)  └──────────────────────────────▶ M4 編輯器v1 ────────▲
                                                (依賴S01/S02/S04)

M0 前可並行動工(約三成):scene-core元素部分、cli骨架、
headless包裝、server、字體載入器、固定測試場景檔
```

## 2. 各里程碑完成定義(DoD)

### M0 — Spike 擂台(2–4 天)
- [x] SPIKE-BRIEF.md 的產出物清單全勾(2026-06-12)
- [x] S01–S04 四項決議文字進 docs/decisions/,總帳更新(D13–D17)
- **DoD:任何工程師讀決議文即可無歧義開工 M1/M4**

### M1 — 渲染核心
- [ ] 勝方基底整理進 `src/core/engine/`(load/save 映射層 + 守門)
- [ ] esbuild 產出 `engine.bundle.js`,editor 測試頁與 headless 頁共用
- [ ] test-harness 上線:四元素類型樣本 × (pixelmatch=0 + 往返逐欄位相等) 進 CI
- **DoD:同一場景 JSON,編輯器頁與 Playwright 截圖 pixelmatch diff = 0;CI 紅燈會擋合併**

### M2 — render CLI ✅(2026-06-13)
- [x] `tedit render <template> <data> -o out.png` 全鏈路通
- [x] 退出碼 0/1/2/3/4/5 行為齊;stdout/stderr 紀律過 e2eCli 測試
- [x] `--scale` 經 deviceScaleFactor 生效(@2x 已驗)
- **DoD ✅:`OUT=$(tedit render ...)` 可靠運作,錯誤情境逐碼驗證**

### M3 — 變數綁定 ✅(2026-06-13)
- [x] schema 補 bindings 型別(S03 定稿)+ 驗證
- [x] resolver:注入 / 掃描(scanVars)/ fallback+warning / strict(exit 4)→ src/core/resolver/index.ts
- [x] `tedit vars`(表格 + --json,共用 scanVars)
- [x] 同名變數綁多處的測試樣本 → examples/demo/templates/multibind.template.json + test/run-unit.mjs
- **DoD ✅:三份資料三張圖版面不變(e2eCli #9)、缺變數兩模式符合 §1.2(#10 fallback / #11 strict exit4)**

### M4 — 編輯器 v1
- [ ] 畫布:engine 實例 + 選取/拖拉/控制柄縮放/旋轉/刪除/複製
- [ ] 元素:文字(行內編輯)/ 圖片(上傳落地 assets/images)/ 形狀 / 畫布設定
- [ ] 面板:屬性面板、圖層列表(z-order 拖排)
- [ ] 變數綁定 UI(S04 定稿)+ 畫布角標
- [ ] 存檔:engine.save → server 寫 templates/ + .tedit/history 時間戳副本
- **DoD:不看文檔的使用者能在 10 分鐘內完成「設計→綁兩個變數→存檔」;存出的檔通過 scene-core 驗證**

### M5 — ui ↔ render 整合打磨
- [ ] 編輯器存出的模板被 `tedit render` 直接吃,出圖與編輯器所見 pixelmatch = 0(端到端,非樣本)
- [ ] 字體全流程:註冊→編輯器選用→headless 出圖;缺字體 exit 5 訊息可讀
- [ ] examples/ 放一個完整範例專案(模板+資料+字體+一鍵腳本)
- **DoD:README 的 quick start 三條指令在乾淨機器上照打可重現**

### M6 — 擴充期(背包,不承諾順序)
undo/redo、群組、對齊輔助線與吸附、`--keep-alive`、URL 圖片變數、history 治理、更多可綁屬性(顏色/可見性)、批次資料表量產、opacity 等樣式欄位(各繳五步漣漪稅,見 ARCHITECTURE §5)。

## 3. 全模組 TODO 清單

### M0 spike(鑰匙,最先做)
- [x] 手寫固定測試場景 JSON(CJK 文字+圖+矩形+背景)→ spike/spike-scene.template.json
- [x] fabric 原型:映射層+T1–T4 → 全過,diff 全 0
- [x] Konva 原型:同上 → 全過;敗北,目錄已刪(報告留存 evidence/)
- [x] 評分定 S01–S04 → docs/decisions/(D13–D16;S02 依 spike 接線實感、S03/S04 依交接方傾向自決)

### scene-core
- [x] schema v0 TypeScript 型別 → src/core/scene/types.ts(含 D17 文字高度修正)
- [x] 驗證器(錯誤訊息定位到元素 id+欄位)→ src/core/scene/validate.ts
- [x] bindings 型別+驗證(S03 已定)→ types.ts/validate.ts
- [x] ❓Q1 圖片 fit 預設 cover → 維持建議,schema enum 含 cover/contain/stretch

### core/engine
- [x] 映射層 load(逐元素類型)→ src/core/engine/fabric-mapping.ts(spike 勝方,M1 整理)
- [x] 映射層 save(D12 看守)→ 同上;spike 往返測試零失誤
- [x] 字體載入器:registry → FontFace → fonts.ready → src/core/engine/gate.ts + core/project.ts
- [x] 圖片守門:img.decode() 全完成才發信號 → gate.ts
- [x] esbuild 打包腳本 → scripts/build-web.mjs(dist/web/engine.bundle.js)

### core/resolver
- [x] 注入純函式 resolveScene(Scene, DataMap)→ {scene, warnings[], missing[]} → src/core/resolver/index.ts
- [x] 變數掃描函式 scanVars(vars 共用)→ 同檔
- [x] ❓Q2 v1 只支援本地路徑(圖片變數路徑重映射在 cli/render.ts;URL 列 M6)

### cli
- [x] 指令骨架+argv 解析+退出碼表 → src/cli/index.ts(2/3/4/5 全驗)
- [x] headless:Playwright/鎖 deviceScaleFactor/等信號/截圖 → src/cli/headless/render-png.ts(--scale 2 已驗)
- [x] render 組裝(含 resolver 注入 + --strict + 圖片變數重映射)→ src/cli/render.ts;CLI 出圖 vs 編輯器截圖 diff=0
- [x] vars 輸出(表格 + --json)→ src/cli/vars.ts

### web/editor
- [ ] [等S01/S02] 畫布容器+選取/控制柄接線
- [ ] [等S02] 屬性面板 / 圖層列表 / 工具列
- [ ] [等S04] 綁定 UI+角標
- [ ] 存檔流(server 寫入 + history 副本)
- [ ] 文字行內編輯接線(❓Q5 隨 S01 連動)

### web/server
- [x] 靜態服務 editor 頁+engine bundle → src/web/server.ts
- [x] 模板讀寫 API+資產上傳+history 副本(D10)→ server.ts(❓Q6 定:REST 5 端點)

### test-harness(橫切)
- [x] pixelmatch 雙路徑 diff(spike 腳本升級)→ e2e/run-parity.mjs(10 樣本)
- [x] 往返測試(每元素類型一樣本)→ 同上;抓出 M1 兩條 save bug
- [x] e2eCli 情境測試(沿 chainq harness 風格)→ e2eCli/run-cli.mjs
- [x] core 純函式單元測試 → test/run-unit.mjs(resolver/scanVars/validate)

### 雜項
- [x] ❓Q7 內建預設字體選款與體積 → D19(Noto Sans TC Regular,不子集,M5 woff2 打包)
- [x] ❓Q8 project.json 欄位定稿 → src/core/project.ts(name/canvasDefaults/fonts)
- [x] ESLint no-restricted-imports 依賴方向規則(D01)→ eslint.config.mjs
