# Contributing to Clean Mermaid

[![English](https://img.shields.io/badge/lang-English-blue)](CONTRIBUTING.md) [![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red)](CONTRIBUTING.zh-CN.md)

Thanks for helping! Please keep the plugin's scope small and predictable.

## Requirements

- Node.js 18 or newer (developed with Node 24 / npm 11) and npm
- Obsidian desktop for manual testing

## Setup

```bash
npm install
npm run dev        # watch build -> main.js
npm run build      # type-check (tsc --noEmit) + production build
```

Deploy the build into a vault for testing — **never hardcode a vault path**:

```bash
VAULT="<path-to-your-vault>" npm run deploy
# or
npm run deploy -- "<path-to-your-vault>"
```

Then reload the plugin in Obsidian (*Settings → Community plugins → reload*); plugins are not
hot-reloaded.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | Plugin entry: registers the `mermaid` code block processor (`sortOrder -100`), the live preview extension, commands, appearance listener |
| `src/block.ts` | One rendered block: directive parsing, card DOM, zoom/pan state machine, `ResizeObserver`, exports |
| `src/livepreview.ts` | Live preview takeover (Obsidian hard-codes mermaid rendering there, so the rendered widget is replaced) |
| `src/mermaid-runtime.ts` | Bundled mermaid runtime: init config, `%%{init}%%` injection, SVG normalisation, LRU cache |
| `src/themes.ts` | Built-in themes, custom theme parsing/validation, theme resolution for light/dark |
| `src/fit.ts` | Pure auto-fit math (easy to unit test — no Obsidian dependency) |
| `src/viewer.ts` | Fullscreen modal viewer (zoom, pan, pinch, fit, export) |
| `src/export.ts` | PNG rasterisation, SVG output, clipboard, mobile "save into vault" fallback |
| `src/i18n.ts` | Language detection (`auto` follows Obsidian) and the bilingual picker behind every label the plugin draws |
| `src/settings.ts` | Settings model + settings tab (custom theme JSON editor, UI language option) |
| `styles.css` | All styles, namespaced with the `cm-` prefix; light/dark via `body.theme-dark` |

## Guidelines

- Keep the plugin namespace on every CSS class (`cm-`) and on every directive (`%% cm:... %%`).
- Every user-facing string goes through `plugin.t(english, chinese)` (`src/i18n.ts`) — no hard-coded
  labels in the card toolbar, menus, error card, viewer or notices.
- Pure logic belongs in `fit.ts` / `themes.ts` style modules so it stays testable.
- The render cache key and the card signature must cover **every** input that changes the SVG —
  theme *content* (`themeIdentity`, not the theme id), layout, ELK options, the diagram source, and
  the appearance in plain mode. A narrower key silently replays a stale diagram.
- Do not patch globals (no `window.mermaid` swapping, no global `mermaid.initialize` side effects);
  per-diagram configuration is injected as a directive instead.
- No local machine paths, vault names or personal data in any committed file.

## Commits & pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`.
- Keep pull requests focused; describe **why** the change is needed.
- Update `README.md` **and `README.zh-CN.md`**, and `CONTRIBUTING.md` **and
  `CONTRIBUTING.zh-CN.md`**, when behaviour, settings or directives change (keep the language
  versions in sync).
- Bump `manifest.json` + `versions.json` in release PRs only.

## Manual acceptance checklist

Run this in a vault with `main.js`, `manifest.json` and `styles.css` deployed, then verify:

1. Reading view: ` ```mermaid ` blocks render as Clean Mermaid cards (white/dark canvas, centred,
   corner controls) — not with Obsidian's built-in renderer.
2. Live preview: editing a block re-renders it correctly.
3. ELK is active: a complex flowchart differs from `%% cm:layout=dagre %%`; the ELK settings
   (`mergeEdges`, `nodePlacementStrategy`) change the output.
4. Switching the Obsidian appearance re-renders diagrams with the matching theme — including
   `%% cm:plain %%` diagrams and ones under a fixed (non-following) theme.
5. Resizing the pane re-fits the diagram and keeps it centred; a very narrow pane does not overflow.
6. `Ctrl/Cmd + scroll` zooms around the pointer; plain scroll still scrolls the note; drag pans;
   double-click resets.
7. `⤢` opens the fullscreen viewer; zoom/pan/fit/100 %/Esc all behave; closing it leaves the inline
   diagram untouched.
8. `⋯`: PNG (with background), SVG, copy image and copy source all work.
9. `%% cm:theme=neutral %%`, `%% cm:layout=dagre %%` and `%% cm:plain %%` behave as documented and
   never show up in the rendered diagram.
10. Custom themes: invalid JSON is rejected and keeps the previous value; valid JSON applies
    immediately.
11. A syntax error shows the error card (with the Dagre hint) and does not break the rest of the note.
12. Disabling the plugin restores Obsidian's own Mermaid rendering with no leftover DOM or
    console errors.
13. Language setting: switching it re-labels the card toolbar, the `⋯` menu, the error card, the
    fullscreen viewer and every notice right away, and the command palette entry follows too —
    no plugin reload needed.
14. `git status` and a text search confirm no vault paths, tokens or personal data are staged.

## Reporting issues

Please include: Obsidian version, plugin version, OS, the Mermaid source that misbehaved (or a
minimal reproduction), and any console errors.

---

中文版见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。