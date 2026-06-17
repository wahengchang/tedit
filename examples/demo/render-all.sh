#!/usr/bin/env bash
# 一鍵示範(D23:一資料夾一專案一模板):同一個 card 專案,換兩份資料產出兩張圖。
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

# card 專案 × 兩份資料(render <專案夾> <資料檔>)
for data in a b; do
  png="$OUT/card-$data.png"
  node "$CLI" render "$DEMO/card" "$DEMO/card/$data.yaml" -o "$png"
  echo "→ $png"
done

# html 圖層範例(無資料,純設計)
node "$CLI" render "$DEMO/html-card" -o "$OUT/html-card.png"
echo "→ $OUT/html-card.png"

echo "完成,見 $OUT/"
