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

## 由上面推出的三个实现约束

- **保留官方渲染的 DOM**：官方用 recycler 把已渲染的 `.mermaid` 容器与源块对应起来（重渲染时复用）；
  我们只给官方输出加 `.cm-core-hidden` 隐藏，不删除它。
- **源码从编辑器状态取**：编辑视图里官方的 `<code>` 元素已被 detach，拿不到文本；`livepreview.ts` 用
  `view.posAtDOM(widget)` 定位，向上找 ```` ```mermaid ```` 围栏、向下找闭合围栏，再从文档里切片取源码，
  并对偏移做边界校验；取不到就放弃接管（保持官方渲染，安全降级）。
- **镜像信任门**：官方在编辑视图渲染 mermaid 前会检查 vault 级 localStorage 键 `mermaid-vault-trust`，
  未信任时展示 `div.mermaid-wrapper.is-guarded` + 「允许」按钮。我们两个条件都查，未信任就不接管；
  维护者点「允许」后官方触发重渲染，我们随即接管。

## mermaid 12 的配置语义

- ELK 已内置且是**默认布局**；`@mermaid-js/layout-elk` 只服务于 tiny 构建 —— 正常依赖 `mermaid` 即可
  （重复注册该包反而会多载一份布局代码）。
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

## 我们的运行时决策（原因，不写在代码里）

- 自带 mermaid 实例（而非沿用 Obsidian 的 `window.mermaid`）：ELK 100% 可用、版本自控，代价是
  `main.js` 数 MB。
- `securityLevel: "loose"`：与官方渲染行为对齐，保留标签里的 HTML 与链接。
- `suppressErrorRendering: true`：渲染失败时由我们自己的错误卡片接管，避免官方把错误图塞进 DOM。