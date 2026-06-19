# tedit

[![CI](https://github.com/wahengchang/tedit/actions/workflows/ci.yml/badge.svg)](https://github.com/wahengchang/tedit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/tedit.svg)](https://www.npmjs.com/package/tedit)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)

**tedit is a local visual template editor for generating PNG images from reusable templates.**

Design once in the browser, bind text or image layers to named variables, save the project as `template.json`, and render the same layout again and again from JSON or YAML data with the CLI.

## Why tedit?

- **Visual first**: compose templates in a local browser editor instead of hand-writing coordinates.
- **Data driven**: bind layers such as `title`, `photo`, or `price` and replace them at render time.
- **Repeatable PNG output**: render many images from one template by swapping YAML or JSON data files.
- **Local by default**: projects are plain folders on your machine; assets stay with your template.
- **Editor/CLI parity**: the editor and the headless renderer use the same engine bundle and Chromium path so what you design is what you render.

## Installation

Install from npm:

```bash
npm install -g tedit
```

Install the Chromium browser used for headless rendering:

```bash
npx playwright install chromium
```

> tedit requires Node.js 20 or newer.

If you prefer not to install globally, use `npx tedit ...` in the commands below.

## Quick start

Create a project folder and open the editor:

```bash
mkdir my-card
cd my-card
tedit ui .
```

In the editor:

1. Add text, image, or shape layers.
2. Select a layer and bind an editable property to a variable name such as `title` or `photo`.
3. Save the project. tedit writes `template.json` in the project folder.

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

## Try the bundled demo from this repository

When working from a cloned checkout, you can run a complete demo project:

```bash
npm install
npm run build
npx playwright install chromium
npm run ui:demo
```

Render the demo template with sample data:

```bash
npm run tedit -- render examples/demo/card examples/demo/card/a.yaml -o examples/demo/out/card-a.png
```

## CLI reference

`<project>` can be either a project folder or a direct path to its `template.json`.

| Command | Description |
| --- | --- |
| `tedit ui [<project>] [--port <n>] [--no-open]` | Start the local editor server and open the browser. |
| `tedit vars <project> [--json]` | List variables defined in a template. |
| `tedit render <project> [<data>] [-o <out.png>] [--scale <n>] [--strict]` | Render a template to PNG with optional JSON/YAML data. |

Examples:

```bash
# Open a project in the editor
tedit ui ./my-card

# Inspect the variables available in a template
tedit vars ./my-card

# Print variables as JSON
tedit vars ./my-card --json

# Render with YAML data
tedit render ./my-card ./my-card/data.yaml -o ./my-card/out.png

# Render at 2x scale
tedit render ./my-card ./my-card/data.yaml -o ./my-card/out@2x.png --scale 2

# Fail if the data file does not provide every bound variable
tedit render ./my-card ./my-card/data.yaml -o ./my-card/out.png --strict
```

Render behavior:

- If no data file is provided, tedit renders with the design-time values stored in the template.
- If a variable is missing, tedit uses the design-time value and prints a warning.
- With `--strict`, missing variables fail the render.
- On success, `render` prints only the absolute output path to stdout so scripts can capture it.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | Invalid template |
| `4` | Missing variable when using `--strict` |
| `5` | Asset loading failure |

## Project structure

A tedit project is just one folder with one template:

```text
my-card/
├── template.json          # Required template file, created by the editor
├── data.yaml              # Optional render data
├── data.json              # Optional render data
├── images/                # Image assets referenced by the template or data
├── fonts/                 # Optional custom fonts
├── project.json           # Optional canvas defaults and font registry
└── .tedit/history/        # Timestamped template backups created on save
```

Reserved names:

- `template.json` is the project template.
- `project.json` is optional project configuration.

Images are resolved relative to the project folder. For example, `photo: images/photo.png` loads `my-card/images/photo.png`.

## Data files

tedit accepts YAML or JSON data. Keys match the variables you created in the editor.

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

Use `tedit vars <project>` when you are unsure which keys a template expects.

## Fonts

Projects can use built-in Noto Sans TC and optional custom fonts registered from the project `fonts/` directory. If a required font cannot be loaded, rendering exits with code `5` instead of silently falling back to another font.

## Recommended workflow

1. **Design**: run `tedit ui ./project` and save the template.
2. **Inspect**: run `tedit vars ./project` to confirm the public variable names.
3. **Render once**: run `tedit render ./project data.yaml -o out.png`.
4. **Automate**: loop over many YAML/JSON files to generate a batch of images.

Example batch script:

```bash
for data in ./project/data/*.yaml; do
  name="$(basename "$data" .yaml)"
  tedit render ./project "$data" -o "./project/out/$name.png"
done
```

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Useful scripts:

| Script | Description |
| --- | --- |
| `npm run ui` | Build and open the editor for a project. |
| `npm run ui:demo` | Build and open `examples/demo/card`. |
| `npm run tedit -- <args>` | Build and run the local CLI. |
| `npm run render:demo` | Render the bundled demo outputs. |
| `npm test` | Run unit, parity, CLI, editor, e2e, and compositor tests. |

## Documentation

- [`docs/OVERVIEW-VISUAL.md`](docs/OVERVIEW-VISUAL.md) - visual overview of the workflow and architecture.
- [`docs/SPEC-CLI-AND-FILES.md`](docs/SPEC-CLI-AND-FILES.md) - CLI and project file contract.
- [`docs/SPEC-SCENE-SCHEMA.md`](docs/SPEC-SCENE-SCHEMA.md) - template schema details.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - architecture notes.
