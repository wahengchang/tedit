# tedit 應用場景與範例

tedit 的核心是「**一份模板 + 變數注入 + headless 批次出圖**」:在瀏覽器裡把版面設計好,把會變動的欄位綁成具名變數,之後用 `tedit render <模板> <資料.yaml>` 就能套不同資料量產像素精準的 PNG。凡是「**同一個版面、換內容、要很多張**」的需求都適用。

「編輯器所見 == CLI 出圖」逐像素一致,所以設計階段看到的就是最終產物。

---

## 五個應用場景

| # | 場景 | 綁成變數的欄位 | 為什麼適合 tedit |
|---|------|----------------|------------------|
| 1 | **社群金句 / 引言卡** | 金句、作者 | 內容行事曆要每天一張;版型固定、只換字 → 一個 YAML 一張圖 |
| 2 | **活動 / 線上講座宣傳圖(OG)** | 主題、講者、時間 | 每場活動一張 OG/社群圖;品牌版型一致,改三個欄位就好 |
| 3 | **加密行情快照卡** | 幣別、價格、漲跌、市值 | 行情天天變;可接資料源批次產出整批幣卡(本範例附 BTC/ETH/SOL) |
| 4 | **部落格 / 文章封面圖(OG)** | 標題、分類、作者 | 每篇文章自動產 Open Graph 圖,免設計師逐張畫 |
| 5 | **個人化證書 / 門票 / 名牌** | 姓名、課程、日期、編號 | 一份名單(CSV/YAML)批次產上百張,each 一個人名 |

> 1–3 已做成可直接跑的範例(見下);4、5 同理 —— 把對應欄位在屬性面板開「Bind variable」綁成變數即可。

---

## 可直接跑的範例(`examples/showcase/`)

```
examples/showcase/
├── project.json                  # 專案設定(用內建 Noto Sans TC,免外部字體檔)
├── templates/
│   ├── quote.template.json       # 場景①金句卡   1080×1080(IG 方形)
│   ├── event.template.json       # 場景②活動圖   1200×630(OG)
│   └── crypto.template.json      # 場景③行情卡   1080×1350(IG 直式,含 HTML 漸層 banner)
├── data/
│   ├── quote.yaml  event.yaml
│   └── crypto-btc.yaml  crypto-eth.yaml  crypto-sol.yaml   # 同一模板 × 多檔 = 量產
└── render-all.sh                 # 一鍵全部出圖到 out/
```

### 一鍵出圖
```bash
npm run build                      # 先產 dist/cli
bash examples/showcase/render-all.sh
# → examples/showcase/out/ 裡會有 quote.png / event.png / crypto-{btc,eth,sol}.png
```

### 單張出圖(看指令長相)
```bash
node dist/cli/index.js render \
  examples/showcase/templates/quote.template.json \
  examples/showcase/data/quote.yaml \
  -o quote.png --scale 2
```
- `--scale 2`:輸出 2 倍解析度(deviceScaleFactor),社群高清用。
- 缺變數預設沿用設計時值並警告(exit 0);加 `--strict` 則缺值即中止(exit 4)。

### 在編輯器裡開
```bash
npm run ui -- examples/showcase        # 進首頁 → 點 quote / event / crypto 編輯
```

---

## 量產(場景③/⑤ 的關鍵)

CLI 一次出一張,批次就是外層迴圈。`render-all.sh` 的 crypto 段就是示範:

```bash
for coin in btc eth sol; do
  node dist/cli/index.js render templates/crypto.template.json \
    "data/crypto-$coin.yaml" -o "out/crypto-$coin.png" --scale 2
done
```

證書/名牌(場景⑤)同理:一人一個 YAML(或之後接 CSV 批次功能 B3),迴圈跑完就是整批個人化圖。

---

## 設計小提醒(從本範例學到的)

- **中文逐字換行正常;長英文單字目前會被攔腰折**(fabric `splitByGrapheme` 限制,見 `project-manager.md` 技術債 B9)。要滿版排版時,純中文或短英文詞較保險。
- **HTML 圖層**(crypto banner)在編輯器只顯示佔位框,**出圖時才真渲染**;滿版背景記得在 HTML 裡寫 `html,body{margin:0;height:100%}`,否則高度會塌。
- 變數只換**內容**(文字字串 / 圖片來源);顏色、可見性等屬性綁定是 schema v0.2(B7)的範圍。
