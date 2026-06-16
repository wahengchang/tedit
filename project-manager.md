# tedit 專案管理總表(project-manager.md)

> **單一進度真相**:模組現況 + 已完成里程碑 + 下一步看板 + 技術債。
> (研究/決議記錄不在此重複 → 見 `docs/decisions/`、總帳 `docs/README-HANDOVER.md §4`;
>  全貌圖見 `docs/OVERVIEW-VISUAL.md`。)
> 更新:2026-06-16 · 在 `main`(v1 + HTML 圖層 + U1 重製 + U2 首頁 + U3 copy-paste/英文/icon + U4 快捷鍵 + U5 網頁下載 PNG + U6 畫布尺寸可改,六關全綠)

狀態圖例:✅ 完成　🔨 進行中　⬜ 未開始　🔜 建議下一個　⏳ 等人工/外部　🟢 乾淨車道(可平行)　🔴 動序列化熱區(要小心)

> 🟢 **目前無鎖定車道**:U1 UI 重製已合併 main(merge `fd1b0a7`),`editor.ts` 熱區釋出,B1/B2 解鎖可開。

---

## 1. 模組結構樹(每檔狀態 + 下一步會動哪)

```
tedit/
├── package.json / tsconfig / eslint.config   ✅ 單包、bin、D01 依賴方向規則
├── scripts/build-web.mjs                      ✅ 產 dist/web(engine + editor bundle + 內建字)
├── src/core/
│   ├── scene/types.ts                         ✅ schema(text/image/shape/html+畫布+bindings)   🔴 schema v0.2/群組會動
│   ├── scene/validate.ts                      ✅ 驗證器(定位 id+欄位;含 html/bindings)        🔴 同上
│   ├── resolver/index.ts                      ✅ 變數注入 resolveScene + scanVars             🟢 URL 圖片會動
│   ├── project.ts                             ✅ project.json + 字體註冊(含內建字)
│   └── engine/
│       ├── fabric-mapping.ts                  ✅ 映射層 load/save(往返測試看守 D12)          🔴 群組/樣式/混排斷行會動
│       ├── gate.ts                            ✅ 渲染守門(fonts.ready + 圖片 decode)
│       ├── browser-entry.ts                   ✅ bundle 入口 + 編輯器 API + renderLayers
│       └── compositor.ts                      ✅ 多層合成器(每元素一層 + html iframe)
├── src/cli/  index/shared/render/vars/ui      ✅ 指令 + 退出碼 0–5                            🟢 批次CSV/keep-alive 會動
│   └── headless/render-png.ts                 ✅ Playwright 出圖(走 compositor)
├── src/web/
│   ├── server.ts                             ✅ 薄後端 REST5 + 上傳 + history                🟢 history 治理會動
│   └── ui/index.html · editor.ts · headless.html  ✅ U1 重製(zoom/狀態列/modal/變數chip)      🔴 undo/群組/對齊輔助線擠 editor.ts
├── 測試  test/run-unit · e2e/{parity,editor,e2e,compositor-parity} · e2eCli/run-cli  ✅ 六關全綠
├── examples/demo/                             ✅ card / multibind / html-card + 資料 + 一鍵腳本
├── examples/showcase/                          ✅ 應用場景範本:quote/event/crypto + 量產腳本(見 docs/USE-CASES.md)
├── spike/                                     ✅ M0 擂台 + 合成器 spike(歸檔)
└── docs/ + project-manager.md                 ✅ 決議總帳/規格/圖/介面;本檔=進度真相
```

---

## 2. 已完成里程碑(濃縮;逐項 DoD 細節見 git log 與 docs/decisions/)

| 里程碑 | 交付 | 狀態 |
|--------|------|------|
| M0 選型擂台 | fabric v7 勝(vs Konva);決議 D13–D17 | ✅ |
| M1 渲染核心 | 映射層 + 六關 test-harness;往返測試抓到 2 條 save bug 已修 | ✅ |
| M2 render CLI | `tedit render` 全鏈路、--scale、退出碼 0–5 | ✅ |
| M3 變數綁定 | resolver 注入/fallback/--strict;vars;同名綁多處 | ✅ |
| M4 編輯器 | 深色 Figma 風:選取/拖拉/屬性/圖層/增刪複製/IText 行內編輯/綁定+角標 | ✅ |
| M5 整合打磨 | 端到端同像素、woff2 內建字、examples、README | 🔨 剩 IME 人工 |
| D22 HTML 圖層 | schema html / 多層合成器 / CLI 出圖 / 編輯器佔位框+貼碼;**已合併 main** | ✅ |
| U1 UI 重製 | zoom+dot-grid 工作區 / 狀態列 / Save·history modal / Export·Render modal(YAML+CLI+--strict) / 變數 chip;像素一致守住,**已合併 main**(merge `fd1b0a7`) | ✅ |

**目前可用度**:v1 + HTML 圖層**端到端可用** —— 編輯器加層+貼代碼+定位 → `tedit render` 出像素精準 PNG;「編輯器所見 == CLI 出圖」逐像素一致。

---

## 3. 下一步工作看板

### A. 收尾

| # | 工作 | 狀態 | 備註 |
|---|------|------|------|
| A1 | 中文 IME 人工驗證 | ⏳ | 機器測不了,需你雙擊文字打注音確認不掉字/跳位 → M5 收尾 |
| A2 | 合併 feature 分支 → main | ✅ | 已合併(merge c5b82d0),分支已刪,main 六關全綠 |

### U. UI 重製(✅ 已合併)

| # | 工作 | 狀態 | 觸碰熱區 | 備註 |
|---|------|------|----------|------|
| U1 | 依 `draft-ui/` mockup 補齊編輯器 UI:zoom+dot-grid 工作區、狀態列、Save/history modal、Export/Render modal、變數 chip | ✅ | `src/web/ui/` | 增量疊在 M4;像素一致守住、六關全綠、實機驗證。8 控制柄 + 圖層拖排 z-order M4 已是 fabric 真控制(原型只示意);Export modal 為唯讀示意(真出圖走 CLI),與 mockup 一致 |
| U2 | 模板首頁(start page):無 `?template=` → 列出資料夾模板(縮圖卡+尺寸+元素數),點開即編輯;「建立新模板」輸入名稱(支援 CJK)→ 建空白模板進編輯;brand=首頁鈕(有未存變更先確認) | ✅ | `src/web/ui/` | 解決「新模板無法命名」缺口;建立走既有 PUT(無新端點);e2e 全程帶 `?template=` 不觸發首頁,六關全綠;實機驗證列表/建立/往返 |
| U3 | copy / cut / paste(⌘C/⌘X/⌘V,app 內剪貼簿,連續貼上階梯位移);UI 全面英文化;工具列改 inline-SVG icon(insert T/圖/方框/`</>`、duplicate、trash、export download;Save 留文字保 ✓/* 狀態與 e2e) | ✅ | `src/web/ui/` | 文字編輯態走原生剪貼簿(typing guard);六關全綠、實機驗證 copy-paste 階梯與全英文 UI |
| U4 | 單鍵工具快捷鍵(Figma 風):T 文字 / R 矩形 / O 橢圓 / L 線 / I 圖片 / H HTML;方向鍵微調選取(1px,Shift=10px);Esc 取消選取(modal 開→關 modal、文字編輯中→交 fabric);addShape 擴充支援 rect/ellipse/line | ✅ | `src/web/ui/` | typing/modal guard 防誤觸;tooltip 標單鍵;六關全綠、實機驗證 T/R/O/L + 方向鍵微調 |
| U5 | 網頁直接下載 PNG:Export modal 加「Download PNG」+ 倍率(1×/2×/3×);POST `/api/render` 帶目前場景+變數值+strict → **server 子行程跑 CLI render**(D01:不 import cli,出圖管線與 CLI 一致)→ 回 PNG blob 下載;exit 4(--strict 缺值)→ 422 | ✅ | 🟢 `src/web/server.ts` + `src/web/ui/` + `src/cli/render.ts` | **修**:無 `project.json` 的專案 locateProject 會 fallback 到 `.tedit/` 致圖片 404→EncodingError → 給 render 加 `--dir` 明確指定專案根,server 直接傳;curl 驗 repo 根+project1(圖片/形狀/HTML)2400×1260 OK;六關全綠 |

| U6 | 畫布(文件)尺寸可改,兩個入口:① 工具列「Document」鈕(文件 icon)開 modal;② 沒選元素時右側 Properties 顯示 Canvas 面板。皆含 Width/Height/Background + 常用尺寸 preset(IG 方形/直式/Story、OG、HD);改尺寸同步更新 designW/H(zoom 正規化靠它),元素座標保留 | ✅ | `src/web/ui/` | 之前畫布大小只能靠 project.json/建檔決定,編輯器無法改;六關全綠、實機驗證 Document modal 與側欄改 Width 皆即時縮放、雙向同步 |

### B. M6 擴充背包(擇序;標熱區與可否平行)

| # | 功能 | 狀態 | 觸碰熱區 | 可平行? | 備註 |
|---|------|------|----------|---------|------|
| B1 | undo / redo | ⬜ | editor.ts | 與其他 editor 功能互斥 | 場景快照堆疊;U1 已合併,editor.ts 釋出可開 |
| B2 | 對齊輔助線 + 吸附 | ⬜ | editor.ts | 與 B1 互斥 | 純編輯器;U1 已合併,可開 |
| B3 | 批次資料表量產(CSV) | ⬜ | 🟢 cli | 可平行 | 提案見 docs/interface-examples/A-proposal-batch.csv |
| B4 | URL 圖片變數 | ⬜ | 🟢 resolver+cli | 可平行 | 下載/快取/逾時要研究 |
| B5 | `--keep-alive` 常駐加速 | ⬜ | 🟢 headless+cli | 可平行 | 重複出圖提速 |
| B6 | history 治理(保留上限/diff) | ⬜ | 🟢 server | 可平行 | D10 後續優化 |
| B7 | schema v0.2:可綁屬性(顏色/可見性)+ opacity/visible | ⬜ | 🔴 schema三角+editor+resolver | 序列化點,先做先合 | 提案見 docs/interface-examples/B-proposal-* |
| B8 | 群組(group) | ⬜ | 🔴 schema三角+editor | 序列化點 | 重;繳五步漣漪稅 |
| B9 | 中英混排斷行 | ⬜ | 🔴 fabric-mapping | — | 兩引擎共同弱點,自寫斷行 |

> **平行化提醒**:🔴 三角(schema/映射層)與 editor.ts 是兩個序列化熱區,一次進一個;
> 🟢 乾淨車道(cli/resolver/server/headless)可同時開 worktree。
> **現況**:U1 已合併,editor.ts 釋出 → B1/B2 可開(但仍互斥,一次一個);🔴 schema 三角(B7/B8)動它要先定資料結構。

---

## 4. 技術債 / 風險備忘

- fabric lineHeight 內部常數 1.13(映射層吸收;**升版要重驗**,往返測試會抓)
- 英文單字攔腰折斷(fabric splitByGrapheme;待 B9 自寫混排斷行)
- 無遠端 repo → CI 硬指標暫以本地 `npm test` 代行,建遠端後補 pipeline
- (已解)~~編輯態毛刺~~ 撤銷(D18 視覺誤判);~~contain/line save bug~~ M1 修

---

## 5. 建議的下一步 + 待你拍板

**建議**:M6 先挑🟢乾淨車道熱身(B3 批次 / B5 keep-alive / B6 history,低風險可平行),
或直接做最有產品價值的 **B7 schema v0.2**(讓任意屬性都能綁變數,但動熱區要單獨先行)。

**待拍板**:① M6 第一個做哪項(B1–B9)② B7/B8 的 schema 擴充要不要先定資料結構(提案已在 docs/interface-examples/)③ IME 人工驗證何時做。
