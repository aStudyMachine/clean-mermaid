# Obsidian / mermaid 逆向结论（动渲染、主题、接管前必读）

结论来源：直接检查本机 Obsidian 1.14.4 的 `app.asar`（`%APPDATA%\obsidian\obsidian-<version>.asar`），
按关键词在 asar 内检索并打印命中位置上下文。Obsidian 升级后若接管失效，先重新检索确认下面这些
结论是否仍然成立，再改代码。

## 代码块渲染的三条路径

1. **阅读视图**：官方 mermaid 是一个普通 markdown 后处理器 —— 扫描 `code.language-mermaid`，逐个渲染，
   把 `<pre>` 替换为 `.mermaid` 容器；注册时未指定 sortOrder（视为 0）。
2. **我们的接管**：`registerMarkdownCodeBlockProcessor("mermaid", handler, -100)`，-100 排在官方之前，
   先把 `<pre>` 换成 `.block-language-mermaid` 并渲染自己的卡片；官方后处理器随后扫描时已找不到
   `code.language-mermaid`，因此不会出现两套图。
   注意：同一语言重复注册会抛 `Code block postprocessor for language … is already registered`。
3. **实时预览**：官方硬编码 —— 代码块部件创建
   `div.cm-preview-code-block.cm-embed-block.markdown-rendered.cm-lang-mermaid`，先建 `<pre><code>`，
   随后对 mermaid `detach` 掉 `<pre>` 并直接调官方渲染器；`canRenderLang()` 对 `mermaid` 恒为 true，
   注册表对 mermaid 永远不会被查询。所以编辑视图只能像 `src/livepreview.ts` 那样事后替换部件内容。

## 由上面推出的实现约束

- **保留官方渲染的 DOM**：官方用 recycler 把已渲染的 `.mermaid` 容器与源块对应起来（重渲染时复用）；
  我们只给官方输出加 `.cm-core-hidden` 隐藏，不删除它。
- **隐藏类必须在放手时归还**：复用的是同一份 DOM，`.cm-core-hidden` 会跟着部件回到下一次接管 —— 那时
  部件进场高度是 0（官方撑起来的高度被我们抹掉了），卡片再撑回 1300 就是跨帧跳变。`dispose()` 里
  逐个 `removeClass` 交还，别让路过的代码只记得删 host。
- **接管要发生在 CodeMirror 的重绘阶段**：`docViewUpdate` 是 `@codemirror/view` 的内部钩子，
  `measure()` 里 `(g = this.docView.update(v)) && this.docViewUpdate()` —— 插件值上有这个方法就被调用
  （Obsidian 1.14.4 的 bundle 已核实）。滚动时 `onScrollChanged` 会**同步**跑 `measure()`，它先量部件、
  再重绘；等我们的 rAF 排上去已经慢了一帧：错尺寸被记进高度表，下一帧靠滚动锚点补偿，表现就是抖一下。
  `src/livepreview.ts` 同时实现 `docViewUpdate`（同帧摆好卡片）和 rAF（拿不到钩子时的兜底）。升级
  Obsidian 后若抖动复发或控制台重现 `Measure loop restarted` / `Viewport failed to stabilize`，
  第一件事是确认这个钩子还在、名字没变。
- **官方输出在实时预览里的直接子节点是 `.mermaid`，不是 `.mermaid-wrapper`**（后者只在未信任守卫那条
  分支出现）。部件的另一个直接子节点是 `.embed-actions`（Obsidian 的悬浮操作条），我们一并隐藏：
  卡片自带 `⋯ / ⤢` 工具条，两套并排会打架。`styles.css` 里那条按 `.cm-live-guard` 匹配的规则
  （这个类由 `hideCoreOutput()` 在卡片撑起内容后打在部件上，刻意不用 `:has()` 之类的结构选择器）
  点名的是 `.mermaid-wrapper, .mermaid`。没有写成「除了 host 全隐藏」那种通配，是为了不把这个
  决定变成隐式的：`.embed-actions` 目前由 `hideCoreOutput()` 显式隐藏，改动前先看这条。
- **源码从编辑器状态取**：编辑视图里官方的 `<code>` 元素已被 detach，拿不到文本；`livepreview.ts` 用
  `view.posAtDOM(widget)` 定位，向上找 ```` ```mermaid ```` 围栏、向下找闭合围栏，再从文档里切片取源码，
  并对偏移做边界校验；取不到就放弃接管（保持官方渲染，安全降级）。
- **镜像信任门**：官方在编辑视图渲染 mermaid 前会检查 vault 级 localStorage 键 `mermaid-vault-trust`，
  未信任时展示 `div.mermaid-wrapper.is-guarded` + 「允许」按钮。我们两个条件都查，未信任就不接管；
  维护者点「允许」后官方触发重渲染，我们随即接管。

## mermaid 12 的配置语义

- **版本差是理解渲染差异的前提**：Obsidian 1.14.4 自带 mermaid **11.13.0**（asar 里
  `/lib/mermaid.min.js` 的头一行就写着它的来源 URL），插件自带的是 12.1.0。mermaid 12 起 flowchart
  的默认布局已是 ELK（实测：不写 `layout` 键的产出与显式 `layout:"elk"` 完全一致，显式 `dagre` 不同），
  11 仍是 dagre —— 官方 `mermaid.initialize` 不写 `layout` 键，所以 Obsidian 里的图走 dagre。
  `npm run shots` 的「原生」一侧因此必须用从 asar 取出的那份 11.13.0
  （`scripts/extract-obsidian-mermaid.mjs`），拿插件自带的 12.1.0 复现会得到两张一模一样的布局。
- ELK 已内置且是本插件的默认布局；`@mermaid-js/layout-elk` 只服务于 tiny 构建 —— 正常依赖 `mermaid`
  即可（重复注册该包反而会多载一份布局代码）。
- `%%{init: …}%%` 指令仍有效（自 10.5 起文档标为 deprecated，推荐 frontmatter `config:`，但功能保留）。
- 指令内容按 **JSON** 解析（解析前会把单引号统一替换成双引号），所以注入的必须是合法 JSON。
- 多条 init 指令会**深合并，后出现者覆盖先出现者**；指令配置整体覆盖 frontmatter 的 `config:`。
  → 插件把配置注在源码最前（源码自带 frontmatter 时插在其后），用户自己写的指令因此天然拥有更高优先级。
- 指令会被白名单清洗：不在默认配置键集合里的键会被丢弃；`theme`、`themeVariables`、`layout`、
  `elk.*` 都在集合内。
- `elk.mergeEdges` 官方默认 `false`，`elk.nodePlacementStrategy` 官方未设默认值 —— 设置面板因此用
  「Mermaid 默认 / 开 / 关」这类三态，避免在用户没要求时覆盖官方默认。
- 流程图节点填充色取的是 `themeVariables.mainBkg`（**不是** `primaryColor`）；调主题色时不能只改
  `primaryColor`，否则节点不会变色。
- **`look` 属于「外观三键」，而它的默认值藏在图种段里**：顶层 `look` 默认 `"classic"`，但 `defaultConfig`
  的每个图种段（`flowchart` / `state` / `class` …）各自带 `look: "neo"`。`resolveAppearance` 按
  「指令 → `initialize` 增量 → defaultConfig」的层序取值，同一层内**段级优先于顶层**，命中后再回写进段里
  （`chunk-VPRB5NB3.mjs:5112-5160`）。neo 与非 neo 的实际差别是节点投影（`[data-look="neo"].node rect
  { filter: … }`，同文件 5641-5681）和被硬编码抬高的内边距（`chunk-XC4XBNZT.mjs:676,1370,1452`），
  以及箭头 marker（`barbNeo` / `barb`）。→ 注入**顶层** `look` 一条就能统一全部图种，只写 `state.look`
  则只有状态图变。
- **节点等宽与长标签折行是两条互不相干的默认值**：`state.minNodeWidth` / `flowchart.minNodeWidth`（均 120）
  经 `labelHelper` 的 `withMinWidth` 把所有节点夹成等宽；`*.wrappingWidth`（均 120）决定折行点。
  `wrappingWidth` 落到 DOM 上是 `max-width` 而非固定宽（`chunk-E2ZNV5FY.mjs:679-682`），所以调大它只会让
  长标签晚一点折、不会把短节点撑宽 —— 想「贴着文字量尺寸」两个键都得动。
- `themeVariables.fontSize` 对状态图标签确实生效（实测 computed 为 14px），于是节点宽度是
  `字数 × 字号 + 2 × padding` 的线性函数。改字号会连带改布局密度，不只是改外观。
- **核对 `look` 别数 SVG 字符串**：`[data-look="neo"]` 作为 CSS 选择器**永远**出现在内嵌 `<style>` 里，
  数它等于零信息量。要看元素的 `data-look` 属性值，或节点 `rect` 的 computed `filter` 是不是 `none`。

## 我们的运行时决策（原因，不写在代码里）

- 自带 mermaid 实例（而非沿用 Obsidian 的 `window.mermaid`）：ELK 100% 可用、版本自控，代价是
  `main.js` 数 MB。
- `securityLevel: "loose"`：与官方渲染行为对齐，保留标签里的 HTML 与链接。
- `suppressErrorRendering: true`：渲染失败时由我们自己的错误卡片接管，避免官方把错误图塞进 DOM。

## vault 注册表（`scripts/deploy.mjs` 依赖）

Obsidian 在 `<APPDATA>/obsidian/obsidian.json`（Windows；macOS 是 `~/Library/Application Support/…`，
Linux 是 `~/.config/obsidian/…`）里记着 `{vaults: {<id>: {path, ts, open?}}}`，部署脚本就靠它把「库名」
换算成本机路径，仓库里因此不需要出现任何路径。这文件不是公开契约：升级 Obsidian 后若部署报「不认识库名」
而库里明明有，先用 `node scripts/scan-asar.mjs` 之外的最直接办法 —— 打开它看 `vaults` 字段还在不在、
`path` 是否仍是绝对路径。解析失败时脚本会自动降级成「只接受完整路径 / `VAULT=`」，不会把人堵死。