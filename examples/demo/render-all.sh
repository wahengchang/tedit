#!/usr/bin/env bash
# 一鍵示範:同一個 card 模板,換三份資料產出三張圖(版面不變、內容不同)。
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

echo "完成:同一模板 × 兩份資料 → 兩張圖(版面相同、標題不同),見 $OUT/"
