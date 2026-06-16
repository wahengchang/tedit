# 全圖層重構 SPIKE 結論(2026-06-16)

> 對應 `D22-layer-compositor.md` §7 任務書。**結果:通過 ✅**
> 程式在 `spike/compositor/`(不碰正式 src/);證據圖 `evidence/spike-compositor-evidence.png`。
> 重跑:`node spike/run-compositor.mjs`

## 驗了什麼

一個三層場景,逐層 z-order 交錯:
```
z2  文字(fabric StaticCanvas)   ← 最頂,故意蓋過 iframe
z1  iframe(本地 bg.html)         ← CSS 漸層 + 中文字(本地字體)+ 本地圖
z0  矩形(fabric StaticCanvas)   ← 最底
```

## 結果

| 檢查 | 結果 |
|------|------|
| 兩次獨立渲染 #stage 截圖 pixelmatch | **diff = 0**(可重現 = 同像素守得住) |
| z-order 交錯(矩形 < iframe < 文字) | ✅ 人眼確認三層疊對 |
| iframe 的 CSS 漸層 | ✅ 正確截進畫面 |
| iframe 的中文字(本地 Noto Sans TC) | ✅ 正確(跨 document 字體守門有效) |
| iframe 的本地圖片 | ✅ 正確(跨 document 圖片 decode 守門有效) |
| page error | ✅ 無 |

## 三個未知數,全部解掉

1. **same-origin 本地 iframe 會被 Playwright `#stage` 截圖捕捉** —— 這是整條路最大的賭注,成立。
2. **跨 document 守門可行**:等 `iframe.contentDocument.fonts.ready` + `[...doc.images].decode()`,
   得到穩定、完整、可重現(diff=0)的畫面。
3. **逐層交錯 z-order 成立**:每元素一個 canvas + iframe 層,用 DOM 疊放排序即可。

## 留給正式重構的注意點(spike 未涵蓋)

- 本 spike 用 **StaticCanvas(view/headless 模式)**。**編輯器互動**(每元素一 canvas 的選取/拖拉/
  控制柄、跨 N 個 canvas 的選取)還沒驗——那是正式重構 editor.ts 的主要工作量。
- 只測 `deviceScaleFactor=1`。`--scale 2`(@2x)下 iframe 的高 DPR 要再驗一次。
- iframe 數量多時的效能(每個 iframe 一個 document)未測;v1 量小應無虞。

## 結論 / 下一步

**全圖層重構這條路技術成立,可以進正式重構**(照 §5:strangler 漸進、fabric 保留、先重新確認 D13 維持)。
建議重構順序:① schema 加 iframe 元素類型 → ② 合成器骨架(browser-entry 改多層)→
③ 映射層改逐層 → ④ editor 互動(最大塊)→ ⑤ headless 守門 + 測試 harness。
