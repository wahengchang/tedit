# 決議 S01(D13):渲染基底 = fabric(v7)

> 日期:2026-06-12。依 SPIKE-BRIEF 擂台規則定案。
> 證據:`evidence/spike-report.json`、`evidence/*-t1-editor.png`、`evidence/*-t4-editing-state.png`。
> 注:交接文件寫 fabric v6,實際開打時最新版為 **fabric 7.4 / Konva 10.3**,以此為準。

## 結果速覽

兩原型四任務(T1 載入渲染 / T2 拖移矩形 / T3 控制柄縮放圖片 / T4 雙擊改字)**全數完成**,
所有任務「編輯器截圖 vs 同 bundle view 模式截圖」pixelmatch(threshold=0)**diff = 0**,
往返測試(load→save 與原 JSON 逐欄位比對)**零失誤**。勝負分在 b/c/d 三維。

## 評分表

| 維度 | 權重 | fabric | Konva | 說明 |
|------|------|--------|-------|------|
| a. 同像素 | 40% | 1.00 | 1.00 | 四任務 diff 全 0,平手 |
| b. 實作成本 | 30% | 0.90 | 0.65 | 映射層 201 vs 259 行;**編輯接線 57 vs 129 行**——fabric 的選取/控制柄/文字編輯內建,Konva 須自接 Transformer、scale 烘焙、overlay textarea |
| c. 文字體感 | 20% | 0.75 | 0.70 | 詳下節 |
| d. 風險盤點 | 10% | 0.65 | 0.75 | 詳下節 |
| **加權** | | **88.5** | **81.0** | **fabric 勝** |

## c 項證據(文字體感)

- CJK 換行:兩邊都正確(fabric `splitByGrapheme: true`、Konva `wrap: 'char'`)。
- **共同弱點**:逐字換行使英文單字被攔腰折斷(「t|hat」「pix|el-perfect」)。混排要漂亮須自寫
  斷行(CJK 逐字 + 拉丁按詞),兩邊都一樣;列 M6 背包,不影響本決議。
- 編輯態 vs 渲染態:
  - fabric:IText **畫布內原生編輯**,編輯態與渲染態同一光柵化路徑(同字形)。但 spike 發現
    center-origin + Textbox 編輯態出現**渲染位移毛刺**(`evidence/fabric-t4-editing-state.png`,
    提交後恢復、不影響存檔與 diff)。判定**可修**:M4 編輯期改用 top-left origin 或編輯前後換算。
  - Konva:無內建編輯態,須 DOM textarea 覆蓋(`evidence/konva-t4-editing-state.png`)。位置正確,
    但 DOM 按詞換行 vs canvas 逐字換行,**編輯態斷行與渲染態不一致**——結構性缺陷,修不掉只能緩解。
- IME:headless 環境無法真實測注音/拼音組字。fabric 走隱藏 textarea、Konva overlay 是原生 DOM,
  理論上兩者 IME 都可用。**2026-06-12 已請使用者以 demo 模式人工試用兩原型,回報「完全沒有感覺
  (差異)」——初步判定無明顯掉字/跑位問題**;M4 編輯器成形後再正式驗一次收尾。

## d 項(各自最醜 workaround)

fabric:
1. lineHeight 含內部 `_fontSizeMult = 1.13` 係數,映射層須 ÷1.13 / ×1.13 吸收——**依賴未文檔化
   內部常數,升版要驗**(往返測試會抓到,風險可控)。
2. center-origin 編輯態毛刺(上節)。
3. `splitByGrapheme` 英文斷詞(與 Konva 同病,不計分差)。

Konva:
1. 文字編輯整套自製(overlay textarea ~50 行 + 換行不一致)。
2. Transformer 縮放走 scaleX/scaleY,須 `transformend` 烘焙回 width/height 維持 save 不變量。
3. `wrap: 'char'` 英文斷詞。

Konva 的風險「結構醜但透明」,fabric 的風險「隱藏常數但可測」,Konva 微勝此項,不足以翻盤。

## 裁決

加權 fabric 88.5 > Konva 81.0;平手裁決順位 a(平)> c(fabric 微勝)同向。
**S01 = fabric v7**。勝方原型碼已遷入 `src/core/engine/`(粗糙版,M1 整理);
敗方 Konva 原型目錄已刪除(沉沒成本 ~390 行)。

## 附帶 schema 修正(D17,SPIKE-BRIEF §7 授權)

文字元素**不存 `height`**:fabric/Konva 皆由內容+寬度推導文字高度,若 schema 存死 height,
save 會寫回引擎推導值(且兩引擎值不同),D12 往返測試必失敗。
已改 `src/core/scene/types.ts` / `validate.ts` 並回填 SPEC-SCENE-SCHEMA §2:
**TextElement 只存 width(換行寬),高度為渲染時推導值,不入庫。**
