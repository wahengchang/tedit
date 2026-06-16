# explain/ — 溝通用文件夾

我們對話用來「講清楚、釘需求」的文件都放這裡(scratch 用途,未提交)。

| 檔案 | 內容 |
|------|------|
| `overview.md` | 專案全貌:這是什麼、模塊怎麼分、核心資料結構、進度、決議、平行化計畫 |
| `interfaces.md` | 模塊之間交互的 6 個契約 + 實際範例;末段有 ❓ 待拍板項目 |
| `mapping-table.md` | 映射層轉換邏輯:schema ⇄ fabric(load/save)逐欄位表 |
| `layer-compositor-impact.md` | 全圖層重構的影響分析 + §7 spike 任務書(已執行) |
| `spike-result.md` | 🆕 全圖層 spike 結論:**通過 ✅**(diff=0、三層交錯、跨 document 守門) |
| `examples/` | 各契約範例檔 + `spike-compositor-evidence.png`(spike 證據圖) |

> 正式文件在別處:`../STATUS.md`(進度)、`../docs/OVERVIEW-VISUAL.md`(圖)、
> `../docs/README-HANDOVER.md`(決議總帳)、`../README.md`(quick start)。

**進度:**
- 全圖層重構:方向已定(先 spike→保留 fabric→iframe 隔離),**spike 已通過**(spike-result.md)。
  下一步 = 進正式重構(等你說開工)。
- 待拍板:schema v0.2 擴充、批次量產 CSV(見 `interfaces.md` 末段 A/B)
