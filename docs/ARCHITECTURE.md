# tedit 架構文件(ARCHITECTURE)

> 不變的合約。修改須走決議並更新 README-HANDOVER §4 總帳。
> 對應決議:D01、D02、D06、D07、D11、D12。

---

## 1. 三分架構與依賴鐵律(D01)

系統分三部分:**core(共用核心)、cli、web**。

```
依賴鐵律:箭頭只准指向 core;cli 與 web 互不依賴。

         ┌──────────────┐
         │  core        │
         │ scene-core   │
         │ resolver     │
         │ engine       │
         └──────────────┘
            ▲        ▲
            │        │
      ┌─────┴──┐  ┌──┴─────┐
      │  cli   │  │  web   │
      └────────┘  └────────┘
      cli ✗──────────✗ web
```

單包之下沒有 workspace 強制隔離,以 ESLint `no-restricted-imports` 一條規則代替(core 不准 import cli/web;cli/web 不准互 import)。

## 2. 倉庫結構(D02,chainq 式單包)

```
tedit/
├── package.json              ← 單一 package,bin: dist/cli/index.js
├── src/
│   ├── core/
│   │   ├── scene/            ← schema、型別、驗證(SPEC-SCENE-SCHEMA)
│   │   ├── resolver/         ← 變數注入(純函式,零 I/O)
│   │   └── engine/           ← 渲染器:映射層 + 基底(S01)+ 守門
│   ├── cli/
│   │   ├── index.ts          ← 指令入口
│   │   ├── render.ts / vars.ts / ui.ts
│   │   └── headless/         ← Playwright 包裝
│   └── web/
│       ├── server.ts         ← ui 模式薄後端
│       └── ui/               ← editor 前端(框架待 S02)
├── e2e/                      ← Playwright:編輯器互動 + 同像素 diff
├── e2eCli/                   ← CLI 情境測試(沿 chainq harness 風格)
├── examples/                 ← 範例專案資料夾(模板+資料)
└── docs/                     ← 本文件包
```

與 chainq 的唯一結構性差異:web/ui 不能 tsc+copy 了事——`core/engine` 帶渲染基底跑瀏覽器,且 **editor 與 headless 必須載入同一份 bundle**,故需一個 esbuild 步驟產出 `dist/web/engine.bundle.js`,兩個入口頁共用。

## 3. 模組依賴圖與 IN/OUT 契約

```
                    ┌─────────────────────────────┐
                    │ scene-core                  │
                    │ IN : JSON 文字(模板檔)       │
                    │ OUT: 驗證過的 Scene 物件      │
                    │      或 結構化錯誤(→exit 3)  │
                    └─────────────────────────────┘
                       ▲           ▲           ▲
            ┌──────────┘           │           └──────────┐
┌───────────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│ resolver              │ │ engine.load      │ │ engine.save         │
│ IN : Scene + 資料Map   │ │ IN : Scene       │ │ IN : 畫布物件樹      │
│      + strict 旗標     │ │ OUT: 畫布物件樹   │ │ OUT: Scene          │
│ OUT: ResolvedScene    │ │   (基底原生物件)  │ │ ⚠ 全系統最危單點     │
│      + warnings[]     │ └──────────────────┘ └─────────────────────┘
│      或缺變數錯(→exit4)│        ▲                      ▲
└───────────────────────┘        │                      │
        ▲                ┌───────┴──────┐               │
        │                │              │               │
        │      ┌─────────────────┐ ┌──────────────────────┐
        │      │ headless        │ │ editor               │
        │      │ IN : engine     │ │ IN : 使用者事件        │
        │      │  bundle +       │ │     + 模板檔(經server)│
        │      │  ResolvedScene  │ │ OUT: 存檔 = Scene JSON│
        │      │  + scale        │ │     (走 engine.save) │
        │      │ OUT: PNG buffer │ │     + history 副本    │
        │      └─────────────────┘ └──────────────────────┘
        │               ▲                    ▲
┌──────────────────────────┐      ┌──────────────────────┐
│ cli                      │      │ server               │
│ IN : argv+模板+資料路徑    │      │ IN : HTTP(模板讀寫/  │
│ OUT: stdout=產物路徑       │      │     資產上傳)        │
│      stderr=訊息          │      │ OUT: 檔案落地專案夾    │
│      exit code 0–5       │      └──────────────────────┘
└──────────────────────────┘
```

resolver 是純函式、不知渲染存在;headless 整顆吞 engine bundle、不知編輯存在。兩者刻意被排除在下述三角之外,讓三角最小化。

## 4. 引擎執行邊界(D06)

引擎**只跑瀏覽器**。headless 出圖 = Playwright 啟動 Chromium → 載入與編輯器同一份 `engine.bundle.js` → 灌 ResolvedScene → 等渲染完成信號 → 截圖。

排除方案與理由:

| 方案 | 排除理由 |
|------|----------|
| node-canvas / skia 雙軌 | 字體光柵化引擎不同(Cairo/Pango vs Chromium),pixelmatch 必紅,直接違反需求 §4 |
| 引擎只跑 Node、editor 反向取圖 | 編輯交互延遲不可接受 |

代價:Chromium 體積與冷啟動秒級——v1 可接受;加速(`--keep-alive` 常駐)列 M6,介面不變。

## 5. 契約三角與守恆律(D07 的工程含義)

schema、engine、editor 是「契約上的三位一體」,但**程式碼依賴保持單向**(見 §3),三角指的是變更漣漪的傳播範圍:

```
                ┌────────────────────┐
                │ scene-core(schema) │  「能被描述的」
                └────────────────────┘
               ╱ ▲                ╲ ▲
        load ╱   │ save            ╲ │ 序列化存檔
            ▼    │                   ╲
   ┌──────────────────┐   操作物件  ┌──────────────────┐
   │ engine            │◀──────────│ editor            │
   │ 「能被畫出來的」    │──────────▶│ 「能被編出來的」    │
   └──────────────────┘   畫布呈現  └──────────────────┘

守恆律:schema 的每一個欄位必須同時
① engine 畫得出 ② editor 編得了 ③ save 存得回(無損往返)
缺① = 存了畫不出;缺② = 畫得出改不了;缺③ = 改了存不回(最陰險)
```

**映射層 save 方向是全系統最危險的單點**:load(schema→物件)好寫;save(物件→schema)漏一個欄位就是**靜默資料遺失**(使用者編了、看見了、存檔後消失)。看守機制 = D12 往返測試。

變更漣漪表(範例:未來新增 opacity 屬性):

| 步驟 | 觸碰處 | 改什麼 |
|------|--------|--------|
| 1 | scene-core | schema +欄位 +驗證規則 |
| 2 | engine 映射層 load | scene.opacity → 物件.opacity |
| 3 | engine 映射層 save | 物件.opacity → scene.opacity ◀ 陰險處 |
| 4 | editor 屬性面板 | +滑桿控件 |
| 5 | test-harness | +同像素樣本 +往返樣本 |
| × | resolver / headless / cli | 不動(自動獲益) |

每個新元素類型、新樣式屬性都繳這筆「五步漣漪稅」。schema 刻意做薄(v1 僅四種元素)即是控稅。

## 6. 同像素策略(D11)

1. **結構保證**:單一引擎 + 單一 bundle + 同一 Chromium(編輯器頁與 headless 頁)。
2. **時序保證**:渲染前守門——`document.fonts.ready` resolve 且場景內所有圖片 decode 完成,引擎才發「渲染完成」信號;headless 只在收到信號後截圖。
3. **環境保證**:headless 鎖定 `deviceScaleFactor`(= `--scale` 參數);編輯器畫布以邏輯尺寸渲染、視口縮放不影響存檔內容。
4. **驗收保證**:test-harness 對每個元素類型維護樣本場景,雙路徑渲染 → pixelmatch diff 必須為 0,連同 D12 往返測試一起作為 CI 硬指標,自里程碑 M1 起生效。

## 7. 借鏡來源備忘

- **Polotno**(閉源):「單一 JSON schema 貫穿編輯/自動化/出圖」的架構參考;其文檔可反推 schema 設計品味。
- **vue-fabric-editor**(MIT、活躍):輔助線、歷史記錄、自定義字體載入(作者明言「字體須先載入再渲染」)等實作可直接參照。
- **chainq**(交接方自有):單包結構、e2eCli harness、文檔組織風格的母本。
