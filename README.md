# tedit

[![CI](https://github.com/wahengchang/tedit/actions/workflows/ci.yml/badge.svg)](https://github.com/wahengchang/tedit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@wahengchang2023/tedit.svg)](https://www.npmjs.com/package/@wahengchang2023/tedit)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)

**tedit is a local, template-driven image generator.** Design a layout once in a browser editor, bind the parts that change to named variables, then render the same design into PNGs over and over by swapping a small YAML/JSON data file.

It runs entirely on your machine — the editor is a local server, the renderer is a headless browser, and your projects are just folders. No accounts, no cloud, no upload.

> Think of one template as a reusable "frame," and each data file as the content poured into it: market snapshots, quote cards, event banners, product shots — same layout, different content, every time.

---

## The big picture

```
   ┌──────────────────────────────────────────────────────────────┐
   │  Browser editor  (tedit ui)  —  dark, Figma-style canvas      │
   │  Design freely → bind layers to named variables → save        │
   └──────────────────────────────┬───────────────────────────────┘
                                  │  save
                                  ▼
                   ┌──────────────────────────────┐
                   │        template.json          │   ← single source of truth
                   │  canvas + layers + variable    │
                   │  bindings (one JSON tree)      │
                   └──────────────┬───────────────┘
                                  │
              tedit render  +  data.yaml  (fills the variables)
                                  ▼
                   ┌──────────────────────────────┐
                   │            out.png            │   ← swap data = new content,
                   └──────────────────────────────┘      identical layout
```

**The core guarantee:** what you see in the editor is exactly what the CLI renders — pixel for pixel. Both load the *same* engine bundle and run the *same* Chromium, so the editor preview and the headless render can't drift apart.

---

## See it

The editor: layers on the left, canvas in the middle, properties + variable binding on the right. Selected layers show their `{variable}` tag on canvas.

![tedit editor](https://raw.githubusercontent.com/wahengchang/tedit/main/docs/images/template_ui.png)

Layers can also be raw **HTML/CSS/SVG**, edited live with a code panel — useful for gradients, charts, badges, and anything easier to express in markup than to drag by hand.

![tedit HTML layer editor](https://raw.githubusercontent.com/wahengchang/tedit/main/docs/images/html_editor.png)

Then the last step is one command — turn that design into a PNG from the terminal:

```bash
tedit render ./my-card data.yaml -o out.png
```

The output is the same canvas you see above, rendered pixel for pixel.

---

## Why tedit?

- **Visual first** — compose templates in a local editor instead of hand-writing coordinates.
- **Data driven** — bind layers like `title`, `photo`, or `price` and replace them at render time.
- **Repeatable output** — render a batch of PNGs from one template by looping over data files.
- **Rich layers** — text, images, shapes, and full HTML/CSS/SVG layers in the same canvas.
- **Local by default** — projects are plain folders; assets live next to the template.
- **Editor/CLI parity** — the editor and the headless renderer share one engine and one Chromium, so what you design is what you render.

---

## Installation

```bash
npm install -g @wahengchang2023/tedit
npx playwright install chromium   # Chromium used for headless rendering
```

The package installs a `tedit` command on your `PATH`.

> Requires Node.js 20 or newer. Prefer not to install globally? Use `npx @wahengchang2023/tedit ...` in any command below.

---

## Quick start

Create a project folder and open the editor:

```bash
mkdir my-card
cd my-card
tedit ui .
```

In the editor:

1. Add text, image, shape, or HTML layers.
2. Select a layer and bind an editable property to a variable name such as `title` or `photo`.
3. Save. tedit writes `template.json` into the project folder.

Create a data file:

```yaml
# data.yaml
title: Hello from tedit
photo: images/photo.png
```

Render a PNG:

```bash
tedit render . data.yaml -o out.png
```

Your generated image is written to `out.png`.

---

## Try the bundled showcase

From a cloned checkout you can run complete example projects (crypto snapshot, quote card, event banner):

```bash
npm install
npm run build
npx playwright install chromium
npm run ui:demo                      # open the demo card in the editor
```

Render a showcase template with sample data:

```bash
npm run tedit -- render examples/showcase/crypto examples/showcase/crypto/crypto-btc.yaml -o examples/showcase/out/btc.png
```

---

## CLI reference

`<project>` can be a project folder or a direct path to its `template.json`.

| Command | Description |
| --- | --- |
| `tedit ui [<project>] [--port <n>] [--no-open]` | Start the local editor server and open the browser. |
| `tedit vars <project> [--json]` | List the variables a template defines. |
| `tedit render <project> [<data>] [-o <out.png>] [--scale <n>] [--strict]` | Render a template to PNG with optional JSON/YAML data. |

```bash
tedit ui ./my-card                                       # open a project
tedit vars ./my-card                                     # list variables
tedit vars ./my-card --json                              # variables as JSON
tedit render ./my-card ./my-card/data.yaml -o out.png    # render with data
tedit render ./my-card ./my-card/data.yaml -o out@2x.png --scale 2   # 2x scale
tedit render ./my-card ./my-card/data.yaml -o out.png --strict       # fail on missing vars
```

**Render behavior**

- No data file → renders with the design-time values stored in the template.
- A missing variable → falls back to its design-time value and prints a warning.
- `--strict` → a missing variable fails the render (exit code `4`).
- On success, `render` prints only the absolute output path to stdout, so scripts can capture it.

**Exit codes**

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | Invalid template |
| `4` | Missing variable under `--strict` |
| `5` | Asset loading failure |

---

## How a variable becomes pixels

```
  data.yaml                 template.json
   title: "New title"   ─┐    bindings: [{ var: title, element: txt1, prop: content }]
   photo: ./a.png        │              │
                         ▼              ▼
            ┌───────────────────────────────────────┐
            │ resolver  (pure function, no I/O)      │
            │ writes variable values into the scene  │   missing → design value + warning
            │ remaps image paths to project-relative │   --strict missing → exit 4
            └────────────────────┬──────────────────┘
                                 ▼  resolved scene
            ┌───────────────────────────────────────┐
            │ headless  (Playwright + Chromium)      │
            │ load engine bundle → inject scene      │   waits for fonts + image decode
            │ → wait for render-ready → screenshot   │   locks deviceScaleFactor (--scale)
            └────────────────────┬──────────────────┘
                                 ▼
                              out.png
```

---

## Project structure

A tedit project is one folder with one template:

```text
my-card/
├── template.json          # required template, created by the editor
├── data.yaml              # optional render data
├── data.json              # optional render data
├── images/                # image assets referenced by the template or data
├── fonts/                 # optional custom fonts
├── project.json           # optional canvas defaults and font registry
└── .tedit/history/        # timestamped template backups created on save
```

Images resolve relative to the project folder — `photo: images/photo.png` loads `my-card/images/photo.png`. `template.json` and `project.json` are reserved names.

---

## Data files

tedit accepts YAML or JSON. Keys match the variables you created in the editor.

```yaml
title: Summer Launch
subtitle: New templates in seconds
photo: images/launch.png
```

```json
{
  "title": "Summer Launch",
  "subtitle": "New templates in seconds",
  "photo": "images/launch.png"
}
```

Run `tedit vars <project>` when you're unsure which keys a template expects.

---

## Fonts

Projects can use built-in Noto Sans TC plus optional custom fonts registered from the project `fonts/` directory. If a required font can't be loaded, rendering exits with code `5` instead of silently falling back to a different font.

---

## Recommended workflow

1. **Design** — `tedit ui ./project`, then save the template.
2. **Inspect** — `tedit vars ./project` to confirm the public variable names.
3. **Render once** — `tedit render ./project data.yaml -o out.png`.
4. **Automate** — loop over many data files to generate a batch.

```bash
for data in ./project/data/*.yaml; do
  name="$(basename "$data" .yaml)"
  tedit render ./project "$data" -o "./project/out/$name.png"
done
```

---

## Learn more

- [`docs/OVERVIEW-VISUAL.md`](docs/OVERVIEW-VISUAL.md) — visual walkthrough of the workflow and how it fits together.
- [`docs/SPEC-CLI-AND-FILES.md`](docs/SPEC-CLI-AND-FILES.md) — full CLI and project-file reference.
- [`docs/SPEC-SCENE-SCHEMA.md`](docs/SPEC-SCENE-SCHEMA.md) — the `template.json` schema in detail.
- [`docs/USE-CASES.md`](docs/USE-CASES.md) — example use cases and ideas.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how tedit is built, for contributors.
