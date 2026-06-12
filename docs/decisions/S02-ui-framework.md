# 決議 S02(D14):編輯器前端框架 = vanilla TS

> 日期:2026-06-12。依交接方傾向 + spike 實感定案。

## 裁決

**vanilla TS(chainq 同款,零前端框架依賴)。**

## 依據

1. spike 中 fabric 的編輯接線(選取、拖拉、控制柄、文字編輯)合計 **57 行 vanilla TS** 完成——
   畫布交互完全由 fabric 自身承擔,前端框架在這層幫不上忙。
2. 編輯器剩餘 UI = 屬性面板、圖層列表、工具列、綁定面板,皆為「選取狀態 → 表單」的單向更新,
   一個 `renderPanel(selectedObject)` 重繪函式即可,無深層狀態樹。
3. 依賴方向(D01)與單 bundle(D02/D06)約束下,vanilla 的 esbuild 管線最薄;
   React 會把 engine bundle 拖進 JSX/runtime 的建置複雜度。

## 退場條款(交接文件原話「若面板手感差再 React」)

觸發條件:M4 期間若屬性面板出現「同一狀態要同步到 3 處以上 UI」且手寫同步碼超過 ~300 行
或出現難追的狀態不同步 bug,再立新決議引入 React(僅面板層,畫布層不受影響)。
