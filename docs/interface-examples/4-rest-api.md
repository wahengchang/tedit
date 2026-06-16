# web REST 契約(editor.ts ⇄ server.ts,純 JSON over HTTP)

| 方法 | 路徑 | 請求 body | 成功回應 | 失敗回應 |
|------|------|-----------|----------|----------|
| GET  | `/api/project` | — | `200` ProjectConfig | — |
| GET  | `/api/templates` | — | `200` `["card","multibind"]`(模板名陣列) | — |
| GET  | `/api/templates/:name` | — | `200` Template | `404` |
| PUT  | `/api/templates/:name` | Template | `200` `{ "ok": true }` | `400` `{ error, details[] }` |
| POST | `/api/assets/images?name=檔名` | 圖片 binary | `200` `{ "path": "assets/images/檔名" }` | `400` `{ error }` |

> PUT 會先跑 `validateTemplate` 才寫檔(server 端守 schema),並同步寫一份 history 副本。

## 範例 body

```jsonc
// GET /api/project →
{ "name": "demo",
  "canvasDefaults": { "width": 1200, "height": 630, "background": "#ffffff" },
  "fonts": [ { "family": "Noto Sans TC", "file": "assets/fonts/NotoSansTC-Regular.otf" } ] }

// PUT /api/templates/card  (body = Template;見 1-card.template.json)
// → 200
{ "ok": true }
// → 400(schema 不過)
{ "error": "schema 驗證失敗",
  "details": [ { "path": "elements[0].width", "message": "必須是正數" } ] }

// POST /api/assets/images?name=photo.png  (body = 圖片 binary)
// → 200
{ "path": "assets/images/photo.png" }
```
