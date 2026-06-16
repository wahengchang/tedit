# tedit 進度總覽(STATUS)

> 標記:✅ 完成 ❌ 未完成 🔨 進行中
> 更新時間:2026-06-15(M0–M4 收官;M5 進行中:端到端 parity ✅ + woff2 內建字 ✅)
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
│   │   ├── resolver/index.ts           ✅ 變數注入純函式 resolveScene + scanVars(M3)
│   │   └── engine/
│   │       ├── fabric-mapping.ts       ✅ load/save 映射層(M1 修正 contain 設計框/line fill 兩 bug)
│   │       ├── gate.ts                 ✅ 渲染守門(FontFace+fonts.ready+圖片 decode)
│   │       └── browser-entry.ts        ✅ bundle 入口 + 編輯器 API(listLayers/selectById/selectedId/onChange)
│   ├── cli/
│   │   ├── index.ts                    ✅ 指令骨架+argv+退出碼(2/3/4/5 全驗)
│   │   ├── shared.ts                   ✅ 模板載入/專案定位/CliError
│   │   ├── render.ts                   ✅ 全鏈路:resolve 注入+--strict(exit4)+圖片變數路徑重映射
│   │   ├── vars.ts                     ✅ 表格 + --json(掃描邏輯共用 core/resolver)
│   │   ├── ui.ts                       ✅ 子行程起 server(D01:不 import web)
│   │   └── headless/render-png.ts      ✅ Playwright 包裝(deviceScaleFactor=scale 已驗)
│   └── web/
│       ├── server.ts                   ✅ 靜態+模板 REST+上傳+D10 history 快照
│       └── ui/
│           ├── index.html              ✅ 深色編輯器殼(D20;工具列/圖層/畫布/屬性/綁定/角標)
│           ├── editor.ts               ✅ 前端:載入/圖層拖排/選取/屬性編輯/增刪複製/行內編輯/綁定/存檔
│           └── headless.html           ✅ headless 出圖頁
├── test/run-unit.mjs                   ✅ core 純函式單元測試(resolver/scanVars/validate,20 斷言)
├── e2e/                                ✅ parity(10 樣本)+ editor e2e(載入→拖拉→存檔)harness
├── e2eCli/                             ✅ CLI 情境測試(33 斷言全綠;含 M3 注入/strict/圖片變數)
├── examples/
│   └── demo/                           ✅ 範例專案(card + multibind 模板、多份資料 a/b/partial/empty)
├── spike/                              ✅ M0 擂台(已收官;serve.mjs 可重開體驗模式)
└── docs/
    ├── 六份交接文件                      ✅ 總帳已更新 D13–D21
    └── decisions/ S01–S04+D18/D19/D20/evidence ✅ 決議+證據截圖
```

## 2. 工作清單(依里程碑)

### M0 — Spike 擂台 ✅ 收官(2026-06-12)
- ✅ 固定測試場景(CJK 文字+圖+矩形+背景)
- ✅ fabric / Konva 雙原型 T1–T4(全過,pixelmatch diff 全 0,往返零失誤)
- ✅ S01=fabric v7、S02=vanilla TS、S03=獨立 bindings、S04=面板開關+角標
- ✅ 決議文件 + 證據 + 總帳 D13–D17
- ✅ IME 人工試用(使用者回報無明顯異常;M4 正式收尾)

### M1 — 渲染核心 ✅(2026-06-12;「CI 紅燈擋合併」待有遠端 repo 後補 CI 設定)
- ✅ 映射層整理+修 bug:contain 設計框靜默遺失、line fill 回寫預設黑(皆由往返測試抓出)
- ✅ test-harness:10 樣本(四元素類型+旋轉+三種 fit+對齊)×(pixelmatch=0+往返相等)
- ✅ e2e/run-parity.mjs 與 e2eCli/run-cli.mjs;`npm test` 一鍵全跑
- ✅ esbuild 產 engine.bundle.js,編輯器頁與 headless 頁共用
- ❌ CI pipeline 設定檔(無遠端 repo,gate 暫為本地 npm test)

### M2 — render CLI ✅(2026-06-13)
- ✅ `tedit render` 全鏈路:讀檔→驗證→resolve→headless→PNG→stdout 印路徑
- ✅ 退出碼 0/1/2/3/4/5 行為全測
- ✅ `--scale` 經 deviceScaleFactor 生效(@2x 已驗 2400×1260)
- ✅ e2eCli 情境測試逐碼驗證(退出碼/stdout 紀律/尺寸/vars)

### M3 — 變數綁定 ✅(2026-06-13)
- ✅ schema bindings 型別+驗證(S03 定稿時順手完成)
- ✅ `tedit vars`(表格 + --json)
- ✅ resolver:注入純函式 resolveScene / fallback+warning / missing 清單(--strict→exit 4)
- ✅ render 接上 resolver + 圖片變數路徑重映射(資料檔相對→專案相對;越界/缺檔→exit 5)
- ✅ scanVars 共用(vars 與 resolver 同一掃描函式,移入 core)
- ✅ 同名變數綁多處:multibind.template.json + 單元測試(注入兩處、缺值去重)
- ✅ DoD:換三份資料三張圖、版面不變(尺寸全等+像素隨內容變)、缺變數兩模式符合 §1.2

### M4 — 編輯器 v1 ✅(2026-06-15;風格=D20 深色 Figma 風)
**stage 1 ✅(2026-06-14):骨架 + 載入/選取/拖拉/存檔閉環**
- ✅ 深色三欄殼(工具列/圖層左/畫布中/屬性右,D20)
- ✅ 畫布:選取/拖拉/控制柄縮放/旋轉(fabric 內建)
- ✅ 圖層列表(z-order 由高到低)↔ 選取雙向同步
- ✅ 屬性面板(唯讀即時顯示;隨拖拉更新)
- ✅ 存檔流:saveScene → PUT /api/templates + D10 history(e2e 驗:拖拉後座標確實寫回)
- ✅ engine 加編輯器 API(listLayers/selectById/selectedId/onChange);editor.bundle 與 engine.bundle 分離

**stage 2 ✅(2026-06-15):屬性可編輯 + 元素增刪複製 + 圖層拖排 + 行內編輯**
- ✅ 屬性面板雙向編輯(x/y/寬高/旋轉/字級/字體/對齊/顏色/裁切/形狀/描邊)
      做法:改 schema 欄位 → 走 load 映射層 reload,origin/裁切換算交給映射層(零手刻數學)
- ✅ 工具列 ＋文字/＋圖片(上傳→POST /api/assets/images 落地)/＋形狀
- ✅ 刪除/複製(按鈕 + Delete / Cmd+D;刪除連帶清掉指向該元素的 bindings)
- ✅ 圖層列表拖排改 z-order
- ✅ 文字雙擊 fabric IText 行內編輯(免 workaround D18;e2e 驗證內容寫回)

**stage 3 ✅(2026-06-15):變數綁定 UI(S04)**
- ✅ 屬性面板綁定開關(text.content / image.src)+ 變數名輸入 → 寫 scene.bindings
- ✅ 畫布角標 {var}(僅 UI 覆蓋層,不進場景,同像素不受影響)
- ✅ 刪除元素連帶清綁定;存檔失敗(如型別衝突)alert 提示不靜默
- ✅ e2e 驗證:開綁定→改名→角標出現→bindings 寫入→取消→移除
- ⏳ IME 正式驗證收尾(留 M5;~~毛刺~~ 已撤銷 D18)

**M4 DoD:** 設計→綁變數→存檔全流程可用;存出檔案經 server schema 驗證(PUT 擋非法)。

### M5 — ui ↔ render 整合打磨 🔨(剩 IME 人工項)
- ✅ 端到端同像素:編輯器頁 vs 真正的 `tedit render` = diff 0(e2e/run-e2e.mjs,card+multibind)
- ✅ 內建字體 woff2 打包(D19):vendor/fonts→dist/web/fonts,經 /__tedit/fonts 共用;
      buildFontRegistry 併入內建 Noto Sans TC(專案同名覆蓋);無註冊也能用內建出圖(e2eCli 驗)
- ✅ examples/demo 完整化:card+multibind 模板、a/b/partial/empty 資料、render-all.sh 一鍵腳本、README
- ✅ README quick start(根 README.md:安裝 + 三指令 + CLI 一覽 + 資料夾說明)
- ⏳ IME 正式驗證收尾(需真人/真 IME,自動化難;留作上線前人工項)

### 全圖層重構(D22,M6 大項)🔨 進行中(branch: feature/layer-compositor)
- ✅ spike 通過:三層交錯(矩形<iframe<文字)+ 跨 document 守門,兩次渲染 diff=0(spike/run-compositor.mjs)
- 🔨 正式重構(strangler 漸進;docs/decisions/D22-layer-compositor.md §1 影響地圖):
  - 階段 1:schema 加 iframe 元素類型(types/validate + 測試)← 進行中
  - 階段 2:合成器骨架(browser-entry 改多層)
  - 階段 3:映射層改逐層(每元素一 canvas + iframe 層)
  - 階段 4:editor 互動(最大塊)
  - 階段 5:headless 守門 + 測試 harness(parity 含 iframe 樣本)

### M6 — 擴充背包 ❌(不承諾順序)
- ❌ undo/redo、群組、輔助線吸附、--keep-alive、URL 圖片變數、
  history 治理、混排斷行(CJK 逐字+拉丁按詞)、更多可綁屬性

## 3. 已知技術債/風險備忘

- fabric lineHeight 內部常數 1.13(映射層吸收;**升版要重驗**,往返測試會抓)
- ~~fabric 編輯態位移毛刺~~ 撤銷(D18:同色疊同色的視覺誤判,編輯態實測穩定)
- 英文單字攔腰折斷(fabric splitByGrapheme;M6 自寫混排斷行)
- 內建預設字體已定案 D19(Noto Sans TC 不子集、woff2),接線排 M5
- 無遠端 repo → CI 硬指標暫以本地 `npm test` 代行,建遠端後補 pipeline

---

## 4. 研究成果與決策記錄(M0 Spike,2026-06-12)

> 研究方法:fabric v7 與 Konva 10 各做一個原型(映射層+編輯接線),餵同一份固定測試場景
> (CJK 混排文字+圖片+矩形+背景),各跑四項任務,用 Playwright 自動化操作並以
> pixelmatch 逐像素比對「編輯器畫面 vs 同 bundle headless 畫面」。
> 完整決議文與證據截圖:`docs/decisions/`

### 擂台結果(四任務:載入渲染/拖移/控制柄縮放/雙擊改字)

| 維度 | 權重 | fabric 7 | Konva 10 | 結果 |
|------|------|----------|----------|------|
| a. 同像素 | 40% | diff 全 0 | diff 全 0 | 平手 |
| b. 實作成本 | 30% | 映射層 201 行+接線 57 行 | 259 行+接線 129 行 | **fabric 勝** |
| c. 文字體感 | 20% | 畫布內原生編輯(有可修毛刺) | DOM 覆蓋框,換行與渲染不一致(結構性) | fabric 微勝 |
| d. 風險盤點 | 10% | 隱藏常數 1.13(可測可控) | workaround 醜但透明 | Konva 微勝 |
| **加權總分** | | **88.5** | 81.0 | **fabric 勝出** |

### 決策(已入總帳 docs/README-HANDOVER §4)

| # | 決策 | 內容 | 一句話理由 |
|---|------|------|-----------|
| D13(S01) | 渲染基底 | **fabric v7** | 同樣功能少寫一半接線碼,文字編輯內建且編輯態=渲染態同字形 |
| D14(S02) | 前端框架 | **vanilla TS** | 畫布交互 fabric 全包,面板層無深層狀態;附 React 退場條款 |
| D15(S03) | bindings 表示法 | **獨立 bindings 區塊** | 渲染與變數系統徹底解耦,vars 一個 filter 列完,fallback 免費 |
| D16(S04) | 綁定操作 UX | **面板開關+角標** | 與 D15 配套,1:1 對應一筆綁定記錄,不需解析魔法字串 |
| D17 | schema 修正 | **文字元素不存 height** | 兩引擎都自動推導文字高度,存死必炸往返測試 |

### 研究中的關鍵發現(影響後續工作)

1. **同像素結構保證成立**:同一 engine bundle + 同一 Chromium,編輯器與 CLI 出圖
   pixelmatch diff = 0 已端到端實證(這是全案最硬需求,M0 就確認可行)。
2. **save 方向果然是最危單點**:文字 height 問題正是在往返測試中暴露的,
   驗證了 D12(往返測試進 CI)的必要性。
3. **CJK 混排斷行是兩引擎共同弱點**:逐字換行會折斷英文單字,要漂亮須自寫斷行(列 M6)。
4. **IME 初步無虞**:使用者人工試用兩原型注音輸入,回報無明顯差異/異常(M4 正式收尾)。

### 第二輪研究(R1/R2,2026-06-12,M1 動工前)

| 決策 | 內容 | 關鍵發現 |
|------|------|---------|
| D18 | 映射層 origin = center(維持) | fabric v7 預設 origin 已改為 center;S01 所記「編輯態毛刺」經座標 dump 重跑證實**不存在**——是米色文字疊米色背景的視覺誤判(矩形被 T2 拖走後文字「隱形」)。M4 免 workaround |
| D19 | 內建字 = Noto Sans TC Regular | **不子集化**(子集化會讓罕字默默出豆腐,違反 D09 精神);M5 以 woff2(wasm 工具)打包,約 -60% 體積 |

### M1 test-harness 戰果(進入產品開發第一仗)

往返測試上線當天就抓到兩條映射層真 bug(像素全對、save 偷偷寫錯):
- image contain:save 把設計框寫成縮排後內容框(y 40→125、height 320→150)
- shape line:fabric 預設黑 fill 被回寫(schema 規定 line 的 fill 無效)

修正後 10 樣本全綠——**ARCHITECTURE 把 save 列為「全系統最危單點」、D12 設往返測試看守,
第一天就雙雙應驗**。
