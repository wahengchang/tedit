# 決議 S03(D15):bindings 表示法 = 獨立 bindings 區塊(方案 A)

> 日期:2026-06-12。依交接方傾向 + spike 實證定案。已回填 SPEC-SCENE-SCHEMA §4。

## 裁決

採**方案 A:獨立 bindings 區塊**,元素永遠存設計時預設值,綁定關係獨立成表。

## 定稿型別(已進 `src/core/scene/types.ts`)

```typescript
/** v1 可綁屬性:text.content、image.src(需求 §7) */
export interface Binding {
  /** 變數名,資料檔的 key */
  var: string;
  /** 目標元素 id */
  element: string;
  /** 目標屬性 */
  prop: 'content' | 'src';
  /** 變數型別;content→text、src→image,驗證器強制一致 */
  type: 'text' | 'image';
}

interface Template {
  // ...
  bindings: Binding[];
}
```

驗證規則(已進 `src/core/scene/validate.ts`):
- `element` 必須存在於 elements;
- `prop` 與元素類型一致(content 只能綁 text 元素、src 只能綁 image 元素);
- `type` 與 prop 一致(content→text、src→image);
- 同名 `var` 型別必須一致(同一變數綁多處合法,需求 §9,型別不得衝突);
- 同一 (element, prop) 不得被綁兩次。

## 依據(spike 實證)

1. spike 兩原型的映射層 load/save **完全不需要知道 bindings 存在**(bindings 原樣穿透)——
   獨立區塊讓「渲染三角」與「變數系統」徹底解耦,resolver 維持純函式。
2. `tedit vars` = 對 bindings 一個 filter,免掃全元素樹。
3. 元素存設計時預設值 → D05 fallback 行為免費實現。
4. 使用者打出字面 `{{` 不會誤觸發(方案 B 需跳脫規則)。

## 連帶解凍

resolver、`tedit vars`、schema bindings 驗證自此可動工(原 ⏳ 等 S03)。
