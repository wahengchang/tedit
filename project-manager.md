# tedit 專案管理總表(project-manager.md)— 下一步工作

> 本檔聚焦**接下來要做的事**。已完成的 v1 + HTML 圖層細節見 `STATUS.md` / `docs/OVERVIEW-VISUAL.md`。
> 更新:2026-06-16 · 分支:`feature/layer-compositor`(全綠,待合回 `main`)

狀態圖例:✅ 完成　⬜ 未開始　🔜 建議下一個　⏳ 等人工/外部　🟢 乾淨車道(可平行)　🔴 動序列化熱區(要小心)

---

## 1. 模組結構(地基現況 + 下一步會動哪)

```
tedit/                                                         地基狀態   下一步會動?
├── core/scene/        schema(types/validate)................ ✅        🔴 schema v0.2 / 群組會動
├── core/resolver/     變數注入 + scanVars .................. ✅        🟢 URL 圖片變數會動
├── core/project.ts    project.json + 字體註冊 .............. ✅        —
├── core/engine/
│   ├── fabric-mapping.ts  映射層 load/save ................. ✅        🔴 群組/樣式/混排斷行會動
│   ├── gate.ts            渲染守門 ........................ ✅        —
│   ├── browser-entry.ts   bundle 入口 + 編輯器 API ......... ✅        —
│   └── compositor.ts      多層合成器(html 圖層)........... ✅        —
├── cli/               指令 + headless 出圖 ................. ✅        🟢 批次 CSV / --keep-alive 會動
├── web/server.ts      薄後端 REST .......................... ✅        🟢 history 治理會動
├── web/ui/editor.ts   編輯器前端(423+ 行,熱區)........... ✅        🔴 undo/群組/對齊輔助線都擠這
├── 測試 harness        unit/parity/cli/editor/e2e/compositor ✅(六關)  每個新功能補對應測試
└── docs/ + project-manager + STATUS                          ✅        每完成同步更新

地基 = v1 + HTML 圖層 全部 ✅、六關測試全綠。下一步的工作都疊在這之上。
```

---

## 2. 下一步工作看板

### A. 收尾:把已完成的 v1 + HTML 出貨

| # | 工作 | 狀態 | 備註 |
|---|------|------|------|
| A1 | 中文 IME 人工驗證 | ⏳ | 機器測不了,需你雙擊文字打注音確認不掉字/跳位 → M5 收尾 |
| A2 | 合併 `feature/layer-compositor` → `main` | 🔜⬜ | 全綠、main 受保護,隨時可合(建議先做這個) |

### B. M6 擴充背包(擇序;標出熱區與可否平行)

| # | 功能 | 狀態 | 觸碰熱區 | 可平行? | 備註 |
|---|------|------|----------|---------|------|
| B1 | undo / redo | ⬜ | editor.ts | 與其他 editor 功能互斥 | 場景快照堆疊,editor 內部 |
| B2 | 對齊輔助線 + 吸附 | ⬜ | editor.ts | 與 B1 互斥 | 純編輯器,無 schema |
| B3 | 批次資料表量產(CSV) | ⬜ | 🟢 cli | 可平行 | 提案見 docs/interface-examples/A-proposal-batch.csv |
| B4 | URL 圖片變數 | ⬜ | 🟢 resolver+cli | 可平行 | 下載/快取/逾時要研究 |
| B5 | `--keep-alive` 常駐瀏覽器加速 | ⬜ | 🟢 headless+cli | 可平行 | Q4;重複出圖提速 |
| B6 | history 治理(保留上限/diff) | ⬜ | 🟢 server | 可平行 | D10 後續優化 |
| B7 | schema v0.2:可綁屬性(顏色/可見性)+ opacity/visible | ⬜ | 🔴 schema 三角+editor+resolver | 序列化點,先做先合 | 提案見 docs/interface-examples/B-proposal-* |
| B8 | 群組(group) | ⬜ | 🔴 schema 三角+editor | 序列化點 | 重;繳五步漣漪稅 |
| B9 | 中英混排斷行(CJK 逐字+拉丁按詞) | ⬜ | 🔴 fabric-mapping | — | 兩引擎共同弱點,自寫斷行 |

> **平行化提醒**(逐檔比對寫入集的結論):🔴 三角(schema/映射層)與 editor.ts 是兩個序列化熱區,
> 一次只能進一個;🟢 乾淨車道(cli/resolver/server/headless)可同時開 worktree。

---

## 3. 建議的下一步 + 待你拍板

**我的建議順序:**
1. **先 A2 合併**(把已做完、全綠的 v1+HTML 收進 main,別讓它一直掛在分支)——A1 的 IME 可在合併後任何時候補做。
2. M6 先挑**乾淨車道**熱身(B3 批次 / B5 keep-alive / B6 history),風險低、可平行;
   或直接做最有產品價值的 **B7 schema v0.2(讓任意屬性都能綁變數)**——但它動序列化熱區,要單獨先行。

**待你拍板:**
- 先合併分支嗎?(A2)
- M6 第一個做哪一項?(B1–B9)
- B7/B8 的 schema 擴充要不要先定資料結構(提案已在 docs/interface-examples/)?
