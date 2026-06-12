# 決議 D18:映射層 origin 策略 = center(fabric v7 原生);「編輯態毛刺」撤銷

> 日期:2026-06-12。M0 收官後、M1 動工前的補充研究(R1)。
> 實驗:spike/out/origin-exp.ts 三輪 + 原始 T4 流程重跑(座標全程 dump)。

## 結論

1. **fabric v7 預設 origin 已改為 center**(`left/top` 即中心點;v5 時代是 left/top)。
   實證:`new Rect({left:100,top:50})` → `originX==='center'`、`getCenterPoint()===(100,50)`。
   映射層現行的 center 表示(`left = x + w/2`)與框架原生方向一致,**維持不變**;
   schema(x,y = 未旋轉左上角)↔ engine(center)的 ±size/2 轉換已由往返測試看守。

2. **S01 決議記載的「fabric 編輯態位移毛刺」不存在,撤銷該風險項。**
   根因是視覺誤判:T4 截圖中,T2 已把深藍矩形拖走,而測試場景的文字色(#f4f1ea)
   與畫布背景色相同——文字疊在背景上的部分「隱形」,只有疊在矩形上的部分可見,
   看起來像文字位移+被裁切。重跑原始流程並 dump 座標:**編輯前/編輯中/打字後/提交後
   x,y,width 全程不變**,畫面正常(spike/out/t4repro-typed.png)。

3. **編輯中高度變化行為良好**:替換成短文字(4 行→1 行)時,fabric 編輯態保持
   **上緣固定**、只有下緣收縮(正是一般編輯器的預期 UX),提交後 save 座標正確。
   M4 編輯器**不需要**任何 origin workaround;Konva 原型當時得手寫的「上緣錨定」
   邏輯在 fabric 是免費的。

## 對 S01 評分的影響

c 項(文字體感)當時給 fabric 0.75 是含「毛刺可修」的折扣;撤銷後 fabric 實際更強。
**勝負結論不變(fabric),且更穩**。S01 決議文已同步修正。

## 給 M1/M4 的指示

- M1 映射層整理:center 表示維持;不要為 origin 加任何轉換層。
- M1 測試樣本須含:旋轉文字(驗 ±size/2 與 rotation 的組合)、編輯後高度變化的往返樣本。
- M4:文字編輯直接用 IText 內建行為,無需錨定處理。
- 教訓進 test-harness:**測試場景的元素配色必須與所有可能疊到的背景有對比**,
  避免「同色隱形」再次造成誤判。
