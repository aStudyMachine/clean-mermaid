# Third-party licenses

The plugin's `main.js` is a single bundled file: it contains **mermaid 12.1.0** and the 62 runtime
packages mermaid pulls in, all compiled in. Their licenses are listed here. This plugin's own source
is [MIT](LICENSE); nothing below is re-licensed by it.

## mermaid — MIT

```
The MIT License (MIT)

Copyright (c) 2014 - 2022 Knut Sveidqvist

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Source: <https://github.com/mermaid-js/mermaid>

## ELK — EPL-2.0

`elkjs@0.9.3` (the ELK layout engine this plugin uses by default) is distributed under the
**Eclipse Public License 2.0**, a weak-copyleft licence that is not the same as MIT:

- The EPL-covered code stays under EPL-2.0 in every copy; its licence text is
  <https://www.eclipse.org/legal/EPL-2.0/> and ships as `LICENSE.md` inside the `elkjs` package.
- Its corresponding source is available from the upstream project:
  <https://github.com/kieler/elkjs> (and from the npm registry for the published `elkjs@0.9.3`).
- Only that library is EPL-licensed. It is used here as an unmodified dependency inside a larger
  work, so the plugin's own code remains MIT and the EPL obligations attach to the EPL-covered
  code itself.

## DOMPurify — MPL-2.0 **or** Apache-2.0

`dompurify@3.4.16` is dual-licensed; this project uses it under **Apache-2.0**
(<https://github.com/cure53/DOMPurify>).

## robust-predicates — Unlicense

`robust-predicates@3.0.3` is released to the public domain via The Unlicense
(<https://github.com/mourner/robust-predicates>).

## Everything else bundled

Every package below is compiled into `main.js`. The full licence text for each one ships inside its
own npm tarball (`node_modules/<name>/LICENSE` after `npm install`).

| Package | Version | Licence | Source |
| --- | --- | --- | --- |
| `@braintree/sanitize-url` | 7.1.2 | MIT | <https://github.com/braintree/sanitize-url> |
| `@chevrotain/cst-dts-gen` | 13.2.0 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> |
| `@chevrotain/gast` | 13.2.0 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> |
| `@chevrotain/regexp-to-ast` | 13.2.0 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> |
| `@chevrotain/utils` | 13.2.0 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> |
| `@iconify/utils` | 3.1.7 | MIT | <https://github.com/iconify/iconify> |
| `@mermaid-js/parser` | 2.0.1 | MIT | <https://github.com/mermaid-js/mermaid> |
| `@upsetjs/venn.js` | 2.0.0 | MIT | <https://github.com/upsetjs/venn.js> |
| `chevrotain` | 13.2.0 | Apache-2.0 | <https://github.com/Chevrotain/chevrotain> |
| `cose-base` | 1.0.3 | MIT | <https://github.com/iVis-at-Bilkent/cose-base> |
| `cytoscape` | 3.34.3 | MIT | <https://github.com/cytoscape/cytoscape.js> |
| `cytoscape-cose-bilkent` | 4.1.0 | MIT | <https://github.com/cytoscape/cytoscape.js-cose-bilkent> |
| `cytoscape-fcose` | 2.2.0 | MIT | <https://github.com/iVis-at-Bilkent/cytoscape.js-fcose> |
| `d3` | 7.9.0 | ISC | <https://github.com/d3/d3> |
| `d3-array` | 3.2.4 | ISC | <https://github.com/d3/d3-array> |
| `d3-axis` | 3.0.0 | ISC | <https://github.com/d3/d3-axis> |
| `d3-brush` | 3.0.0 | ISC | <https://github.com/d3/d3-brush> |
| `d3-chord` | 3.0.1 | ISC | <https://github.com/d3/d3-chord> |
| `d3-color` | 3.1.0 | ISC | <https://github.com/d3/d3-color> |
| `d3-contour` | 4.0.2 | ISC | <https://github.com/d3/d3-contour> |
| `d3-delaunay` | 6.0.4 | ISC | <https://github.com/d3/d3-delaunay> |
| `d3-dispatch` | 3.0.1 | ISC | <https://github.com/d3/d3-dispatch> |
| `d3-drag` | 3.0.0 | ISC | <https://github.com/d3/d3-drag> |
| `d3-dsv` | 3.0.1 | ISC | <https://github.com/d3/d3-dsv> |
| `d3-ease` | 3.0.1 | BSD-3-Clause | <https://github.com/d3/d3-ease> |
| `d3-fetch` | 3.0.1 | ISC | <https://github.com/d3/d3-fetch> |
| `d3-force` | 3.0.0 | ISC | <https://github.com/d3/d3-force> |
| `d3-format` | 3.1.2 | ISC | <https://github.com/d3/d3-format> |
| `d3-geo` | 3.1.1 | ISC | <https://github.com/d3/d3-geo> |
| `d3-hierarchy` | 3.1.2 | ISC | <https://github.com/d3/d3-hierarchy> |
| `d3-interpolate` | 3.0.1 | ISC | <https://github.com/d3/d3-interpolate> |
| `d3-path` | 3.1.0 | ISC | <https://github.com/d3/d3-path> |
| `d3-polygon` | 3.0.1 | ISC | <https://github.com/d3/d3-polygon> |
| `d3-quadtree` | 3.0.1 | ISC | <https://github.com/d3/d3-quadtree> |
| `d3-random` | 3.0.1 | ISC | <https://github.com/d3/d3-random> |
| `d3-sankey` | 0.12.3 | BSD-3-Clause | <https://github.com/d3/d3-sankey> |
| `d3-scale` | 4.0.2 | ISC | <https://github.com/d3/d3-scale> |
| `d3-scale-chromatic` | 3.1.0 | ISC | <https://github.com/d3/d3-scale-chromatic> |
| `d3-selection` | 3.0.0 | ISC | <https://github.com/d3/d3-selection> |
| `d3-shape` | 3.2.0 | ISC | <https://github.com/d3/d3-shape> |
| `d3-time` | 3.1.0 | ISC | <https://github.com/d3/d3-time> |
| `d3-time-format` | 4.1.0 | ISC | <https://github.com/d3/d3-time-format> |
| `d3-timer` | 3.0.1 | ISC | <https://github.com/d3/d3-timer> |
| `d3-transition` | 3.0.1 | ISC | <https://github.com/d3/d3-transition> |
| `d3-zoom` | 3.0.0 | ISC | <https://github.com/d3/d3-zoom> |
| `dagre-d3-es` | 7.0.14 | MIT | <https://github.com/tbo47/dagre-es> |
| `dayjs` | 1.11.23 | MIT | <https://github.com/iamkun/dayjs> |
| `delaunator` | 5.1.0 | ISC | <https://github.com/mapbox/delaunator> |
| `elkjs` | 0.9.3 | **EPL-2.0** | <https://github.com/kieler/elkjs> |
| `es-toolkit` | 1.52.0 | MIT | <https://github.com/toss/es-toolkit> |
| `internmap` | 2.0.3 | ISC | <https://github.com/mbostock/internmap> |
| `katex` | 0.16.47 | MIT | <https://github.com/KaTeX/KaTeX> |
| `khroma` | 2.1.0 | MIT | <https://github.com/fabiospampinato/khroma> |
| `layout-base` | 1.0.2 | MIT | <https://github.com/iVis-at-Bilkent/layout-base> |
| `lodash-es` | 4.18.1 | MIT | <https://github.com/lodash/lodash> |
| `marked` | 16.4.2 | MIT | <https://github.com/markedjs/marked> |
| `mermaid` | 12.1.0 | MIT | <https://github.com/mermaid-js/mermaid> |
| `roughjs` | 4.6.6 | MIT | <https://github.com/pshihn/rough> |
| `stylis` | 4.4.0 | MIT | <https://github.com/thysultan/stylis.js> |
| `ts-dedent` | 2.3.0 | MIT | <https://github.com/tamino-martinius/node-ts-dedent> |
| `uuid` | 14.0.2 | MIT | <https://github.com/uuidjs/uuid> |

## Not distributed with the plugin

`tests/browser/obsidian-mermaid.min.js` is mermaid 11.13.0 extracted from a locally installed
Obsidian by `scripts/extract-obsidian-mermaid.mjs`, purely so the README comparison shows what
Obsidian really renders. It is git-ignored, never shipped, and stays on your machine.
