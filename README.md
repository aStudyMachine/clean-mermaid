# Clean Mermaid

[![English](https://img.shields.io/badge/lang-English-blue)](README.md) [![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red)](README.zh-CN.md)

Clean, **Codex-style** Mermaid diagrams for Obsidian: white card, soft violet nodes, generous
whitespace, and a floating toolbar — with **ELK layout**, auto-fit, zoom & pan, fullscreen
view, PNG/SVG export and themable colours.

> Status: `0.1.0` — feature complete, looking for early testers.

## Features

- **Every ` ```mermaid ` block is rendered by this plugin** (reading view and live preview) with a
  clean card: centred diagram, auto-fit to the editor width, subtle border, floating controls.
- **ELK layout engine by default** — bundled `mermaid` 12 already ships ELK, so complex flowcharts
  get the nicer layered layout. Switch to Dagre globally or per diagram when you prefer it.
- **Auto-fit & centre** — diagrams scale with the pane width and are capped to a share of the
  viewport height, so a huge diagram never takes over the note.
- **Zoom & pan** — `Ctrl/Cmd + scroll` zooms around the pointer (10 %–800 %), drag to pan a
  zoomed-in diagram, double-click to reset. Plain scrolling still scrolls the note.
- **Image preview** — diagrams are displayed as `<img>` (SVG data URL), so Obsidian themes and
  CSS snippets cannot restyle them; what you see is what you export.
- **Export** — download a 2× PNG, an SVG, or copy the image / the Mermaid source from the `⋯`
  menu. On mobile the file is saved into your vault next to the active note.
- **Fullscreen viewer** (`⤢`) — pan, wheel/pinch zoom, fit, 100 %, export.
- **4 built-in themes** — Clean Light, Clean Dark, Neutral, GitHub Light — plus **custom themes**
  as plain Mermaid `themeVariables` JSON, with validation.
- **Light/dark aware** — follows the Obsidian appearance automatically and re-renders on switch.
- **UI language** — the card toolbar, the `⋯` menu, the error card, the fullscreen viewer and every
  notice follow 中文 / English, or Obsidian's own interface language when set to "Auto".
- **Per-diagram directives** — `%% cm:theme=... %%`, `%% cm:layout=dagre %%`, `%% cm:plain %%`.

## Installation

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them into `<your-vault>/.obsidian/plugins/clean-mermaid/`.
3. Enable **Clean Mermaid** in *Settings → Community plugins*.

### From source

```bash
npm install
npm run build
VAULT="<path-to-your-vault>" npm run deploy
```

## Usage

Write Mermaid as usual:

````markdown
```mermaid
flowchart TD
  A[Start] --> B{Check}
  B -->|yes| C[Ship it]
  B -->|no| D[Fix it]
```
````

### Interactions

| Action | Gesture |
| --- | --- |
| Zoom | `Ctrl`/`Cmd` + scroll (inline), wheel or pinch (fullscreen) |
| Pan | Drag with the left mouse button (when zoomed in) |
| Reset to auto-fit | Double-click, or `Reset zoom` in the `⋯` menu |
| Menu | `⋯` in the card corner — PNG, SVG, copy image, copy source, reset |
| Fullscreen | `⤢` in the card corner |

### Directives

Directives must be the first lines of the block and are stripped before rendering:

````markdown
```mermaid
%% cm:theme=neutral %%
%% cm:layout=dagre %%
flowchart LR
  A --> B
```
````

| Directive | Effect |
| --- | --- |
| `%% cm:theme=<id> %%` | Use a built-in or custom theme for this diagram only |
| `%% cm:layout=elk\|dagre %%` | Override the layout engine for this diagram only |
| `%% cm:plain %%` | Render this diagram with mermaid's stock look (no card, no toolbar) |

Your own `%%{init: ...}%%` directive always wins over what the plugin injects — the plugin
prepends its configuration, so the values you write later take precedence.

## Settings

| Group | Options |
| --- | --- |
| General | Plugin interface language (card toolbar, `⋯` menu, error card, viewer, notices): follow Obsidian automatically, 中文 or English |
| Appearance | Light/dark theme, follow Obsidian appearance, fixed theme |
| Layout | Layout engine (ELK/Dagre), ELK `mergeEdges`, ELK `nodePlacementStrategy`, auto-fit mode, max upscale, max height |
| Interaction | Ctrl/Cmd + scroll zoom, drag to pan, toolbar visibility, double-click reset |
| Rendering | Enable Clean Mermaid rendering, render as image, `%% cm: %%` directives |
| Export | PNG resolution (1×/2×/3×), PNG background (theme/transparent) |
| Custom themes | Add, edit (JSON), delete; invalid JSON is rejected and the last valid version stays |

## Notes & compatibility

- **Bundled runtime.** The plugin ships its own `mermaid` 12 build (including ELK), so it does not
  depend on the Mermaid version bundled with Obsidian. This makes `main.js` larger than a typical
  plugin (a few MB) — that is the price for a predictable, standalone renderer.
- **How the takeover works.** Reading view uses the standard `mermaid` code block processor
  (registered ahead of Obsidian's own). Live preview is a special case: Obsidian renders mermaid
  there with a hard-coded core renderer that ignores that registry, so the plugin watches the
  rendered widget, reads the diagram source from the editor state and swaps the output for its own
  card. Obsidian's per-vault “trust mermaid” prompt is respected in both views.
- **Layout engine.** ELK affects diagrams with pluggable layouts (flowchart, state, class, ER, …).
  Sequence, pie, gantt and similar diagrams use their own layout and are unaffected.
- **Other mermaid plugins.** Only enable **one** plugin that takes over ` ```mermaid ` blocks.
  If another renderer is detected, Clean Mermaid shows a one-time notice.
- **Mobile.** Rendering and touch gestures work; exports are saved into the vault instead of being
  downloaded.
- **Disabling** the plugin restores Obsidian's own Mermaid rendering; nothing is patched globally.

## Development

```
src/
  main.ts             plugin entry: processor registration, live preview extension, commands
  block.ts            one rendered diagram: card DOM, interactions, exports
  livepreview.ts      live preview takeover of Obsidian's rendered mermaid widgets
  mermaid-runtime.ts  bundled mermaid + config injection + LRU cache
  themes.ts           built-in themes, custom theme parsing/resolution
  fit.ts              pure auto-fit math
  viewer.ts           fullscreen pan/zoom modal
  export.ts           PNG/SVG/clipboard/mobile-save helpers
  i18n.ts             language detection + the bilingual picker used by every label
  settings.ts         settings model + settings tab
```

```bash
npm install          # install dependencies
npm run dev          # esbuild watch build
npm run build        # type-check + production build (main.js)
VAULT="<path>" npm run deploy   # copy the build into a vault for testing
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and the manual acceptance checklist.
No local vault paths are ever committed — the deploy script takes the vault as an environment
variable or CLI argument.

## License

[MIT](LICENSE) © Clean Mermaid contributors

---

中文文档：[README.zh-CN.md](README.zh-CN.md) · 贡献指南：[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)