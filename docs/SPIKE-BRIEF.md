# tedit M0 Spike 擂台任務書(SPIKE-BRIEF)

> **✅ 已收官(2026-06-12)**:S01=fabric v7、S02=vanilla TS、S03=獨立 bindings、S04=面板開關+角標。
> 決議與證據見 docs/decisions/;本文件歸檔留存。

> 會被消耗的文件:做完歸檔,產出物是四項決議文字(回寫 README-HANDOVER §4/§5)。
> 預算:**2–4 天**。這是全案的鑰匙——S01–S04 定案前,resolver、vars、editor、映射層全部被擋。

---

## 1. 待決四題

| # | 議題 | 候選 | 交接方傾向 |
|---|------|------|-----------|
| S01 | 渲染基底 | fabric.js v6 vs Konva | 微傾 fabric(IText 內建、開源活體多);Konva 勝在 TS 與 Transformer。**打完才算** |
| S02 | 編輯器前端框架 | vanilla TS vs React | 微傾 vanilla(chainq 同款、零依賴);若面板手感差再 React |
| S03 | bindings 表示法 | 獨立區塊 vs 內嵌 `{{}}` | 傾向獨立區塊(理由見 SPEC-SCENE-SCHEMA §4) |
| S04 | 綁定操作 UX | 面板開關+角標 vs 文字打 `{{}}` | 傾向面板開關 |

S01 用擂台定(§2–§4);S02 用勝方原型加掛兩塊小面板實測;S03/S04 帶著能跑的原型開一次設計討論定案,寫成決議。

## 2. 擂台規則(S01)

```
固定輸入:同一份抽象 scene JSON(§3 的固定測試場景)

         ┌─────────────┐        ┌─────────────┐
         │ fabric 原型  │        │ Konva 原型   │
         │ 映射層+渲染   │        │ 映射層+渲染   │
         └──────┬──────┘        └──────┬──────┘
                ▼                       ▼
   各自完成四項任務(§4)
                ▼                       ▼
   依評分表(§5)打分 → 勝者原型直接留用進 M1
   敗者映射層整目錄刪除(預期 <300 行,沉沒成本可控)
```

每邊預算 1–2 天。原型品質要求:能跑、能比,**不需要乾淨**——但映射層介面須一致(`load(scene)→物件樹`、`save(物件樹)→scene`),否則沒得比。

## 3. 固定測試場景

一份手寫的 `spike-scene.template.json`(依 SPEC-SCENE-SCHEMA §1–§2,bindings 留空陣列):

- 畫布 1200×630、背景純色;
- 1 個 TextElement:**CJK 多行文字**(含中英混排、需自動換行的長度)、指定 self-host 字體;
- 1 個 ImageElement:本地圖片,fit=cover;
- 1 個 ShapeElement:rect,帶填色與描邊。

字體一律走 FontFace + `fonts.ready` 守門(兩邊同規則,排除干擾變因)。

## 4. 雙方必做四項任務

| # | 任務 | 驗證的三角邊(ARCHITECTURE §5) |
|---|------|------------------------------|
| T1 | 載入場景並渲染 | schema→engine(load) |
| T2 | 拖拉移動矩形,存回 JSON | editor→engine→save |
| T3 | 控制柄縮放圖片,存回 JSON | 同上,含變換數學 |
| T4 | 雙擊文字進入編輯、改字、存回 JSON | 文字編輯態(fabric=IText / Konva=overlay textarea) |

T2–T4 完成定義:操作後 `save()` 產出的 JSON 重新 `load()` 能還原所見(往返閉環,D12 的前哨)。

## 5. 評分表

| 維度 | 權重 | 量法 |
|------|------|------|
| a. 同像素 | 40% | 編輯器畫布截圖 vs Playwright 載同 bundle 截圖,pixelmatch diff 像素數(目標 0;非 0 要能解釋並判定可修/不可修) |
| b. 實作成本 | 30% | 四任務合計行數與耗時(映射層行數單列,它是長期稅率) |
| c. 文字體感 | 20% | CJK 換行正確性、IME(注音/拼音)輸入流暢度、編輯態與渲染態字形差異 |
| d. 風險盤點 | 10% | 各自最醜的 workaround 數量與醜度(主觀,但要寫下來) |

平手裁決順位:a > c > b > d。

## 6. 產出物清單

- [x] `docs/decisions/S01-render-base.md`:勝者、四維度得分、敗者證據(截圖/diff 圖)
- [x] `docs/decisions/S02-ui-framework.md`
- [x] `docs/decisions/S03-bindings-format.md`(含定稿的 bindings TypeScript 型別,回填 SPEC-SCENE-SCHEMA §4)
- [x] `docs/decisions/S04-binding-ux.md`(含一張線框草圖即可)
- [x] 勝方原型碼進 `src/core/engine/`(可粗糙,M1 整理)
- [x] README-HANDOVER §4 總帳新增 D13–D16(+D17) 對應四項決議

## 7. 注意事項

- 兩個原型**共用** scene-core 的型別與固定場景檔——這同時是 scene-core v0 的第一次實戰驗證,發現 schema 不合理當場改(此時改最便宜)。
- 評分 a 項就是在預演 M1 的 CI 硬指標,pixelmatch 腳本寫完直接留給 test-harness。
- 不要在 spike 期擴功能範圍(吸附、輔助線、undo 都不准做)——四項任務之外的一切都是噪音。
