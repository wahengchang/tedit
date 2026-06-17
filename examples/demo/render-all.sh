#!/usr/bin/env bash
# 一鍵示範:① card 模板 × 兩份資料(版面不變、內容不同);② 5 個 HTML 圖層範例。
# 用法:從 repo 根目錄執行  bash examples/demo/render-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/dist/cli/index.js"
DEMO="$ROOT/examples/demo"
OUT="$DEMO/out"
mkdir -p "$OUT"

if [ ! -f "$CLI" ]; then
  echo "找不到 $CLI — 請先在 repo 根目錄執行: npm run build" >&2
  exit 1
fi

for data in a b; do
  png="$OUT/card-$data.png"
  node "$CLI" render "$DEMO/templates/card.template.json" "$DEMO/data/$data.yaml" -o "$png"
  echo "→ $png"
done

# HTML 圖層範例(無變數 → 用 empty.yaml;示範 CSS 漸層 / flex 排版 / 圖片遮罩等)
for tpl in html-badge html-stats html-pricing html-quote html-photo; do
  png="$OUT/$tpl.png"
  node "$CLI" render "$DEMO/templates/$tpl.template.json" "$DEMO/data/empty.yaml" -o "$png"
  echo "→ $png"
done

echo "完成:card × 兩份資料 + 5 個 HTML 圖層範例,見 $OUT/"
