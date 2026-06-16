#!/usr/bin/env bash
# tedit showcase:把三個範本各自套資料出圖到 out/。
# 用法(在 repo 根):  bash examples/showcase/render-all.sh
# 前置:npm run build(產 dist/cli)。
set -euo pipefail
cd "$(dirname "$0")"            # examples/showcase
ROOT="$(cd ../.. && pwd)"
CLI="$ROOT/dist/cli/index.js"
mkdir -p out

render() { node "$CLI" render "templates/$1.template.json" "data/$2.yaml" -o "out/$3.png" --scale 2; }

# 單張:金句卡、活動圖
render quote   quote        quote
render event   event        event

# 量產示範:同一個 crypto 範本 × 多檔資料 → 多張卡
for coin in btc eth sol; do
  render crypto "crypto-$coin" "crypto-$coin"
done

echo "完成,輸出在 examples/showcase/out/:"
ls -1 out/
