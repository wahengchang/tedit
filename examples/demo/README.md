# demo 範例專案

完整可跑的範例,給 `tedit` 三個指令練手。

## 內容

```
project.json                  畫布預設 + 字體註冊(Noto Sans TC)
templates/
  card.template.json          矩形 + 圖片 + 文字;綁 title(文字)、photo(圖片)
  multibind.template.json     同一個 title 綁到兩處文字(示範同名變數綁多處)
assets/
  fonts/NotoSansTC-Regular.otf
  images/test-photo.png
data/
  a.yaml / b.yaml             兩份完整資料(title + photo)
  partial.yaml                只給 title(示範缺變數 fallback)
  empty.yaml                  空資料(全用設計時值)
render-all.sh                 一鍵:card × a/b → out/card-a.png、out/card-b.png
```

## 跑跑看(在 repo 根目錄,先 `npm run build`)

```bash
# 設計
tedit ui --dir examples/demo

# 變數清單
tedit vars examples/demo/templates/card.template.json

# 出圖(換 a.yaml / b.yaml 看同版面不同內容)
tedit render examples/demo/templates/card.template.json examples/demo/data/a.yaml -o out.png

# 缺變數:預設 fallback(警告但出圖)
tedit render examples/demo/templates/card.template.json examples/demo/data/partial.yaml -o out.png
# 嚴格模式:缺變數報錯(exit 4)
tedit render examples/demo/templates/card.template.json examples/demo/data/partial.yaml --strict

# 一鍵示範
bash examples/demo/render-all.sh
```
