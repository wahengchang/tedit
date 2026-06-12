# 決議 D19(❓Q7):內建預設字體 = Noto Sans TC Regular,完整不子集、woff2 打包

> 日期:2026-06-12。M0 後補充研究(R2)。實作接線排 M5(字體全流程打磨)。

## 裁決

| 項 | 結論 |
|----|------|
| 選款 | **Noto Sans TC Regular**(單一字重) |
| 授權 | SIL OFL 1.1,允許隨軟體再散布(含商用),需附授權文 |
| 子集化 | **不子集化**(理由見下) |
| 壓縮 | M5 打包時以 woff2 格式內建(無損格式轉換,16.4MB OTF → 約 6–8MB;
        用 npm 的 wasm 工具如 `wawoff2`,build 時轉換,不引入系統依賴) |
| 落點 | 來源檔進 `vendor/fonts/`;build 複製到 `dist/web/fonts/`;
        engine 的字體註冊表自動併入內建項(專案註冊同名時以專案為準) |

## 理由

1. **選款**:spike/範例已全程使用 Noto Sans TC 驗證(FontFace 載入、CJK 渲染、同像素
   diff=0),交接方建議亦同款;Regular 單字重夠 v1 用(字重欄位本來就刻意不在 schema v1)。
2. **不子集化是 D09 的延伸**:內建字是「使用者沒註冊任何字體」時的兜底。若子集化,
   使用者打出子集外的罕用字 → 默默出豆腐字 → 正是 D09 明文禁止的
   「看似成功但字不對,比失敗更糟」。體積換正確性,在這個工具的定位(本地 CLI 工具,
   一次安裝)不划算。
3. **woff2 是免費的中間值**:無損格式轉換、不缺字形,體積約砍六成,Chromium 的
   FontFace 原生支援;wasm 工具鏈(`wawoff2`)零系統依賴,可進 build script。
4. 子集化若未來真有需求(如 npm 包瘦身訴求),列 M6 背包,屆時須配套
   「字元覆蓋檢查 → 超出子集即 exit 5」才不違反 D09。

## 本機驗證備忘

本機無 fontTools/woff2_compress(已確認);採 npm wasm 方案即不需要它們。
M5 實作時驗收:headless 出圖以 woff2 內建字渲染 vs OTF 渲染,pixelmatch diff 必須 = 0
(woff2 無損,理論成立,仍須實測收尾)。
