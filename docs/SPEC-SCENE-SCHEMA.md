# tedit 場景 Schema v0 草案(SPEC-SCENE-SCHEMA)

> 對應決議:D07(自訂抽象薄 schema + 映射層)、D12(往返測試)、D15(bindings 定稿)、D17(文字高度不入庫)。
> 狀態:**已全部定稿**(2026-06-12,M0 收官);實作見 `src/core/scene/`。
> 設計原則:schema 是單一真相、不綁渲染基底;刻意做薄以控「五步漣漪稅」(ARCHITECTURE §5)。

---

## 1. 頂層結構

```typescript
interface Template {
  teditVersion: string;        // schema 版本,如 "0.1",供未來遷移
  canvas: CanvasSpec;
  elements: Element[];         // 陣列順序 = z-order(索引 0 在最底)
  bindings: Binding[];         // S03 定稿(D15),見 §4
}

interface CanvasSpec {
  width: number;               // px
  height: number;              // px
  background: string           // CSS 色值,如 "#ffffff"
    | { image: string };       // 或背景圖(專案內相對路徑)
}
```

座標系:**原點左上、x 向右、y 向下、單位 px**(與 Canvas/瀏覽器一致)。

## 2. 元素(v1 四類,需求 §8)

```typescript
type Element = TextElement | ImageElement | ShapeElement;
// background 不是元素,屬於 CanvasSpec(需求 §8 表格的「背景」列)

interface ElementBase {
  id: string;                  // 模板內唯一,編輯器產生(如 "el_a1b2")
  type: "text" | "image" | "shape";
  x: number; y: number;        // 左上角座標
  rotation: number;            // 度,順時針,繞元素中心;預設 0
}
// 尺寸欄位(D17 修正):image/shape 存 width+height;
// text 只存 width(換行寬),高度由內容推導不入庫——
// fabric/Konva 皆自動推導文字高度,存死 height 會讓 save 寫回推導值,D12 必炸。

interface TextElement extends ElementBase {
  type: "text";
  width: number;               // 換行寬;高度推導,不入庫(D17)
  content: string;             // 文字內容(可綁變數;此值即「設計時預設值」)
  fontFamily: string;          // 須存在於 project.json fonts[] 或為內建預設字
  fontSize: number;            // px
  fontWeight?: number;         // 100–900,選填(省略=400;PR1);family 缺該字重→瀏覽器合成粗體
  color: string;               // CSS 色值
  align: "left" | "center" | "right";
  lineHeight: number;          // 倍數,如 1.4
  runs?: TextRun[];            // 逐字樣式(選填;PR2)。內容被綁定覆蓋時丟棄
}

// 逐字樣式區間(PR2):start/end = content 的 grapheme 索引(end 不含);至少一個 color / fontWeight
interface TextRun { start: number; end: number; color?: string; fontWeight?: number; }

interface ImageElement extends ElementBase {
  type: "image";
  width: number; height: number;
  src: string;                 // 專案內相對路徑(可綁變數)
  fit: "cover" | "contain" | "stretch";  // ❓Q1 建議預設 "cover"
}

interface ShapeElement extends ElementBase {
  type: "shape";
  width: number; height: number;
  shape: "rect" | "ellipse" | "line";
  fill: string;                // CSS 色值或 "transparent"
  stroke: string;              // 同上
  strokeWidth: number;         // px,0 = 無描邊
  // line:以 (x,y)-(x+width,y+height) 對角線表示,fill 無效
}
```

刻意**不在 v1** 的欄位(未來各繳五步漣漪稅):opacity、shadow、群組、漸層、圓角、字重/斜體、字間距。

## 3. 驗證規則(scene-core 驗證器)

- 結構驗證:欄位齊全、型別正確、enum 合法(建議 zod 或手寫;錯誤訊息**必須能定位到元素 id + 欄位名**,供 exit 3 時 stderr 輸出)。
- 語義驗證:`id` 唯一;`fontFamily` 可解析(註冊表或內建);尺寸為正數。
- 寬容原則:**未知欄位報錯拒絕**(嚴格模式)——schema 薄,寬鬆會讓映射層 save 的遺漏被掩蓋,與 D12 精神衝突。

## 4. bindings 區塊 — ✅ 定稿(S03/D15,2026-06-12)

採**獨立 bindings 區塊**(原方案 A)。決議全文與依據見 `decisions/S03-bindings-format.md`。

```typescript
interface Binding {
  var: string;                 // 變數名,資料檔的 key
  element: string;             // 目標元素 id
  prop: "content" | "src";     // v1 可綁屬性:text.content、image.src(需求 §7)
  type: "text" | "image";      // content→text、src→image,驗證器強制一致
}
```

```jsonc
{
  "elements": [ { "id": "t1", "type": "text", "content": "預設標題", ... } ],
  "bindings": [
    { "var": "title", "element": "t1", "prop": "content", "type": "text" },
    { "var": "photo", "element": "i1", "prop": "src",     "type": "image" }
  ]
}
```

驗證規則:element 必須存在;prop 與元素類型一致;type 與 prop 一致;
同名 var 型別必須一致(綁多處合法,需求 §9);同一 (element, prop) 不得重複綁定。
其餘屬性(顏色、可見性…)列擴充(M6,各繳五步漣漪稅)。

## 5. 往返測試要求(D12,CI 硬指標)

映射層(engine.load / engine.save)就位後,每個元素類型至少一個樣本場景,執行:

```
load(scene) → save(物件樹) → 必須與原 scene 深度相等(逐欄位)
```

任何新欄位進 schema,**同一 PR 必須附**:① load 映射 ② save 映射 ③ 往返樣本 ④ 同像素樣本。漏 ② 之外的都會被 CI 抓;漏 ② 只有往返測試抓得到——這就是它存在的理由。

## 6. 版本與遷移

`teditVersion` 自 "0.1" 起。v1 期間 schema 變更直接升小版號 + 在 scene-core 留簡單遷移函式(舊版 JSON → 新版);不做向後相容承諾,history 副本裡的舊版本檔以「可讀但建議重存」處理。
