# tedit 進度總覽(STATUS)

> 標記:✅ 完成 ❌ 未完成
> 更新時間:2026-06-12(M0 收官 + 可並行三成完成)
> 詳細規格見 docs/,決議見 docs/decisions/

---

## 1. 檔案/模組樹

```
tedit/
├── package.json                        ✅ 單包、bin=dist/cli/index.js
├── tsconfig.json / eslint.config.mjs   ✅ 含 D01 依賴方向規則
├── scripts/
│   └── build-web.mjs                   ✅ 產 dist/web/engine.bundle.js(編輯器/headless 共用)
├── src/
│   ├── core/
│   │   ├── scene/
│   │   │   ├── types.ts                ✅ schema v0(四元素+畫布+bindings,含 D17 文字高度修正)
│   │   │   └── validate.ts             ✅ 驗證器(錯誤定位到元素 id+欄位;bindings 驗證含)
│   │   ├── project.ts                  ✅ project.json 解析+字體註冊表
│   │   ├── resolver/                   ❌ 變數注入純函式(M3;S03 已解鎖)
│   │   └── engine/
│   │       ├── fabric-mapping.ts       ✅ load/save 映射層(spike 勝方;❌ M1 整理待做)
│   │       ├── gate.ts                 ✅ 渲染守門(FontFace+fonts.ready+圖片 decode)
│   │       └── browser-entry.ts        ✅ bundle 入口(window.teditEngine;❌ 編輯模式接線=M4)
│   ├── cli/
│   │   ├── index.ts                    ✅ 指令骨架+argv+退出碼(2/3/5 已驗;❌ 4 等 M3)
│   │   ├── shared.ts                   ✅ 模板載入/專案定位/CliError
│   │   ├── render.ts                   ✅ M2 鏈路通(❌ 變數注入等 M3 resolver)
│   │   ├── vars.ts                     ✅ 表格 + --json
│   │   ├── ui.ts                       ✅ 子行程起 server(D01:不 import web)
│   │   └── headless/render-png.ts      ✅ Playwright 包裝(deviceScaleFactor=scale 已驗)
│   └── web/
│       ├── server.ts                   ✅ 靜態+模板 REST+上傳+D10 history 快照
│       └── ui/
│           ├── index.html              ❌ 編輯器 UI(M4;現為佔位頁)
│           └── headless.html           ✅ headless 出圖頁
├── e2e/                                ❌ 編輯器互動+同像素 diff 測試(M1)
├── e2eCli/                             ❌ CLI 情境測試(M1/M2)
├── examples/
│   └── demo/                           ✅ 範例專案(模板+字體+圖+資料;煙霧測試用)
├── spike/                              ✅ M0 擂台(已收官;serve.mjs 可重開體驗模式)
└── docs/
    ├── 六份交接文件                      ✅ 總帳已更新 D13–D17
    └── decisions/ S01–S04 + evidence/   ✅ 四決議+證據截圖
```

## 2. 工作清單(依里程碑)

### M0 — Spike 擂台 ✅ 收官(2026-06-12)
- ✅ 固定測試場景(CJK 文字+圖+矩形+背景)
- ✅ fabric / Konva 雙原型 T1–T4(全過,pixelmatch diff 全 0,往返零失誤)
- ✅ S01=fabric v7、S02=vanilla TS、S03=獨立 bindings、S04=面板開關+角標
- ✅ 決議文件 + 證據 + 總帳 D13–D17
- ✅ IME 人工試用(使用者回報無明顯異常;M4 正式收尾)

### M1 — 渲染核心 ❌
- ❌ 映射層整理(spike 粗糙版 → 正式版,逐欄位核 save)
- ❌ test-harness 進 CI:四元素類型樣本 ×(pixelmatch=0 + 往返逐欄位相等)
- ❌ e2e/ 與 e2eCli/ 目錄建置(spike 腳本升級)
- ✅ esbuild 產 engine.bundle.js,編輯器頁與 headless 頁共用

### M2 — render CLI(大部分已提前完成)
- ✅ `tedit render` 全鏈路:讀檔→驗證→headless→PNG→stdout 印路徑
- ✅ 退出碼 0/1/2/3/5 行為(已實測 2/3/5)
- ✅ `--scale` 經 deviceScaleFactor 生效(@2x 已驗 2400×1260)
- ❌ e2eCli 情境測試逐碼驗證(等 M1 harness)

### M3 — 變數綁定 ❌
- ✅ schema bindings 型別+驗證(S03 定稿時順手完成)
- ✅ `tedit vars`(表格 + --json)
- ❌ resolver:注入純函式 / fallback+warning / --strict(exit 4)
- ❌ render 接上 resolver(現在是「警告後以設計時值出圖」)
- ❌ 同名變數綁多處的測試樣本

### M4 — 編輯器 v1 ❌
- ❌ 畫布:選取/拖拉/控制柄/旋轉/刪除/複製(spike 已證明 fabric 內建大半)
- ❌ 元素:文字行內編輯/圖片上傳/形狀/畫布設定
- ❌ 面板:屬性面板、圖層列表(z-order 拖排)
- ❌ 綁定 UI:面板開關+角標(S04)
- ❌ 存檔流接 server(API 已就緒)+ 修 fabric center-origin 編輯態毛刺
- ❌ IME 正式驗證收尾

### M5 — ui ↔ render 整合打磨 ❌
- ❌ 編輯器存檔 → render 直接吃,端到端 pixelmatch = 0
- ❌ 字體全流程打磨;缺字體 exit 5 訊息可讀性
- ❌ README quick start 三條指令在乾淨機器可重現
- ✅ examples/ 範例專案雛形(demo)

### M6 — 擴充背包 ❌(不承諾順序)
- ❌ undo/redo、群組、輔助線吸附、--keep-alive、URL 圖片變數、
  history 治理、混排斷行(CJK 逐字+拉丁按詞)、更多可綁屬性

## 3. 已知技術債/風險備忘

- fabric lineHeight 內部常數 1.13(映射層吸收;**升版要重驗**)
- fabric center-origin + IText 編輯態位移毛刺(M4 修)
- 英文單字攔腰折斷(兩引擎同病;M6 自寫混排斷行)
- 內建預設字體(❓Q7)未打包,現在全靠專案註冊表
