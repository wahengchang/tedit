// scene-core schema v0 — SPEC-SCENE-SCHEMA §1–§2、§4(S03/D15 定稿)

export interface Template {
  teditVersion: string;
  canvas: CanvasSpec;
  /** 陣列順序 = z-order(索引 0 在最底) */
  elements: SceneElement[];
  bindings: Binding[];
}

/** 變數綁定(S03/D15:獨立 bindings 區塊);v1 可綁 text.content、image.src */
export interface Binding {
  /** 變數名,資料檔的 key */
  var: string;
  /** 目標元素 id */
  element: string;
  prop: 'content' | 'src';
  /** content→text、src→image,驗證器強制一致 */
  type: 'text' | 'image';
}

export interface CanvasSpec {
  width: number;
  height: number;
  background: string | { image: string };
}

export type SceneElement = TextElement | ImageElement | ShapeElement | HtmlElement;

export interface ElementBase {
  /** 模板內唯一,編輯器產生(如 "el_a1b2") */
  id: string;
  type: 'text' | 'image' | 'shape' | 'html';
  /** 左上角座標,px,原點左上、y 向下 */
  x: number;
  y: number;
  /** 度,順時針,繞元素中心(文字元素的中心以推導高度計) */
  rotation: number;
}

/**
 * Schema 修正(M0 spike 發現,SPIKE-BRIEF §7 授權):
 * 文字元素不存 height——fabric/Konva 皆由內容+寬度自動推導文字高度,
 * 存死 height 會讓 save 寫回推導值,D12 往返測試必失敗且兩引擎值不同。
 * 文字只存 width(換行寬),高度為渲染時推導。
 */
export interface TextElement extends ElementBase {
  type: 'text';
  /** 文字框寬(自動換行邊界),px;高度由內容推導,不入庫 */
  width: number;
  /** 設計時預設值,可綁變數 */
  content: string;
  /** 須存在於 project.json fonts[] 或為內建預設字 */
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** 倍數,如 1.4 */
  lineHeight: number;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  width: number;
  height: number;
  /** 專案內相對路徑,可綁變數 */
  src: string;
  fit: 'cover' | 'contain' | 'stretch';
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  width: number;
  height: number;
  shape: 'rect' | 'ellipse' | 'line';
  /** CSS 色值或 "transparent";line 時 fill 無效 */
  fill: string;
  stroke: string;
  /** px,0 = 無描邊 */
  strokeWidth: number;
}

/**
 * HTML 圖層(D22 全圖層重構):一層由本地 HTML 檔渲染的內容(經 iframe 隔離)。
 * 渲染走多層合成器(階段 2/3 實作);此元素只負責「描述」,渲染前資產須自足(不可外連)。
 */
/**
 * HTML 圖層(D22):一層由 HTML 渲染的內容(經 iframe 隔離,sandbox 禁 script)。
 * 內容兩種來源,**擇一**:
 *  - html:直接貼上的整段 HTML 代碼(inline;經 iframe srcdoc 渲染)← 編輯器貼上框用
 *  - src :專案內本地 HTML 檔路徑(如 "assets/html/bg.html";不可外連)
 * 編輯器以「佔位框」表示位置(可拖拉/縮放);真實內容在 headless 出圖時才渲染。
 */
export interface HtmlElement extends ElementBase {
  type: 'html';
  width: number;
  height: number;
  src?: string;
  html?: string;
}
