# 映射層轉換邏輯:schema ⇄ fabric(load / save)

> `1-card.template.json`(硬碟上的 schema) 和 `3-saveScene-output`(編輯後 save 回來的 schema)
> 中間隔著這層轉換。load = schema→畫布物件;save = 畫布物件→schema。**一進一出必須無損**
> (D12 往返測試看守)。來源:src/core/engine/fabric-mapping.ts。

座標系差異是換算的主因:
- **schema**:`x, y` = 元素「未旋轉的左上角」;尺寸用 `width/height`。
- **fabric**:`left, top` = 元素「中心點」(originX/Y = center);角度用 `angle`。

---

## 通用(所有元素共用)

| schema 欄位 | load(schema → fabric) | save(fabric → schema) |
|-------------|----------------------|----------------------|
| `x` `y`(左上角) | `left = x + w/2`、`top = y + h/2` | `x = left − w/2`、`y = top − h/2` |
| `rotation`(度) | `angle = rotation` | `rotation = angle` |
| 尺寸 | 各型不同(見下) | `dispW = fabric.width × scaleX`(縮放烘回尺寸) |

---

## shape(形狀)

| 形狀 | schema | load → fabric | save → schema |
|------|--------|---------------|---------------|
| rect | width/height | `Rect{ width, height }` | `width = w×scaleX`、`height = h×scaleY` |
| ellipse | width/height | `Ellipse{ rx=w/2, ry=h/2 }` | `width = rx×2`、`height = ry×2` |
| line | x,y,width,height | `Line[ x, y, x+w, y+h ]` | 由兩端點回推 x,y,w,h |

| 樣式欄位 | load | save |
|----------|------|------|
| `fill` | `"transparent"` → `''`(空字串),其餘原值 | `''` → `"transparent"`;**line 永遠回寫 transparent**(規定 line 無 fill) |
| `stroke` | 同 fill 規則 | `''` → `"transparent"` |
| `strokeWidth` | `strokeWidth`(+ `strokeUniform=true`,縮放不變粗) | 原值 |

---

## image(圖片)★ 最繞的一個

| schema 欄位 | load → fabric | save → schema |
|-------------|---------------|---------------|
| `width`/`height`(=設計框) | `applyFit()` 算出 crop + scale | **= 設計框 × 使用者縮放倍率**,不是當下物件尺寸 |
| `src` | 載入圖片;路徑記進 meta `teditSrc` | 取自 meta `teditSrc` |
| `fit` | 決定 `applyFit` 用哪種算法 | 取自 meta `teditFit` |

`fit` 三種算法(load 時):

| fit | scale | crop |
|-----|-------|------|
| cover | `max(boxW/natW, boxH/natH)`(填滿、裁切) | 置中裁掉多餘 |
| contain | `min(boxW/natW, boxH/natH)`(完整放入) | 不裁,物件尺寸 = 縮後內容框 |
| stretch | x、y 各自縮放(變形填滿) | 不裁 |

> ⚠ contain 的坑:物件當下尺寸 = 縮後「內容框」≠ 原「設計框」。所以 save 不能直接讀物件尺寸,
> 必須用 meta 記住的 `teditBoxW/H × 使用者縮放` 回推設計框——否則設計意圖會被靜默改掉。
> (這就是往返測試 D12 當天抓到的真 bug)

---

## text(文字)

| schema 欄位 | load → fabric | save → schema |
|-------------|---------------|---------------|
| `width`(換行寬) | `Textbox.width` | `width = fabric.width × scaleX` |
| (無 `height`) | 不傳,fabric 自己依內容推導 | **不存**(D17:存了往返必爆) |
| `content` | `Textbox.text` | `text` |
| `fontFamily` | `fontFamily` | `fontFamily` |
| `fontSize` | `fontSize` | `fontSize × scaleX`(縮放烘回字級) |
| `color` | `fill` | `fill` |
| `align` | `textAlign` | `textAlign` |
| `lineHeight` | `÷ 1.13`(吸收 fabric 內部 _fontSizeMult) | `× 1.13`(還原成純倍數) |

---

## canvas(畫布)

| schema | load | save |
|--------|------|------|
| `background` 是色字串 | `canvas.backgroundColor` | 讀回 `backgroundColor` |
| `background` 是 `{image}` | `backgroundImage` | 原樣保留 scene 的 `{image}` |
| `width`/`height` | `setDimensions` | 讀回 `canvas.width/height` |

---

## 隱形側通道:meta(為了 save 無損而存在)

fabric 物件上掛了一組 `tedit*` 自訂屬性,**只為了 save 時能還原 schema**,不影響畫面:

| meta 欄位 | 為什麼需要 |
|-----------|-----------|
| `teditId` / `teditType` | fabric 物件不知道自己原本的 schema id 與型別 |
| `teditSrc` / `teditFit` / `teditShape` | 圖片來源、裁切模式、形狀子類,畫布上看不出來 |
| `teditBoxW/H` + `teditLoadScaleX/Y` | image contain 還原設計框用(見上方坑) |
| `teditNaturalW/H` | 圖片原始尺寸 |

---

## 一句話總結

這層轉換是**雙向、可逆、一對一**:同一份 schema load 進去、save 出來,逐欄位必須相等
(D12 看守)。最容易出錯的三個點:**座標系(中心 ↔ 左上角)、image contain 的設計框、
text 的 lineHeight 1.13 與不存 height**。其餘多半是同名直通。
