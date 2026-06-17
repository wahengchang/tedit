#!/usr/bin/env bash
# tedit showcase(D23:一資料夾一專案一模板):每個範本一個資料夾,各自套資料出圖到 out/。
# 用法(在 repo 根):  bash examples/showcase/render-all.sh
# 前置:npm run build(產 dist/cli)。
set -euo pipefail
cd "$(dirname "$0")"            # examples/showcase
ROOT="$(cd ../.. && pwd)"
CLI="$ROOT/dist/cli/index.js"
mkdir -p out

# render <專案夾> <資料檔名(夾內,不含副檔名)> <輸出名>
render() { node "$CLI" render "$1" "$1/$2.yaml" -o "out/$3.png" --scale 2; }

# 單張:金句卡、活動圖
render quote quote quote
render event event event

# 量產示範:同一個 crypto 範本 × 多檔資料 → 多張卡
for coin in btc eth sol; do
  render crypto "crypto-$coin" "crypto-$coin"
done

echo "完成,輸出在 examples/showcase/out/:"
ls -1 out/
