# AGENTS.md — clean-mermaid 开发约定

Obsidian 插件：接管 vault 内所有 ` ```mermaid ` 代码块，渲染为 Codex 风格卡片（自带 mermaid 12、
ELK 默认布局、自适应居中、缩放平移、图片化预览、PNG/SVG 导出、主题与单图指令）。

文档地图（改动前先读对应那份，避免重复劳动）：
[README.md](README.md) / [README.zh-CN.md](README.zh-CN.md) 特性与用法 ·
[CONTRIBUTING.md](CONTRIBUTING.md) 环境、目录结构、实现约定、手动验收清单 ·
[docs/obsidian-internals.md](docs/obsidian-internals.md) 动渲染 / 主题 / 接管前必读的逆向结论 ·
[CHANGELOG.md](CHANGELOG.md) 版本变更记录（发版时补条目） ·
[TODO.md](TODO.md) 当前待办（完成即删）

## 动手前必知的事实

- **实时预览里 mermaid 由官方便编码渲染**：代码块部件在任何注册表查询之前就按 `lang === "mermaid"`
  直接调官方渲染器 —— 用处理器 API 在编辑视图**不可能**接管，只能像 `src/livepreview.ts` 那样
  事后替换已渲染部件（隐藏官方输出而非删除，以兼容官方 recycler）。
- **阅读视图**：官方 mermaid 是普通后处理器；我们在 `main.ts` 用
  `registerMarkdownCodeBlockProcessor("mermaid", …, -100)` 排在它之前接管。
- **重复注册会抛异常**："同一语言已有代码块处理器"时会抛 `already registered`，`main.ts` 里那段
  try/catch 是必要的兜底，保留它。
- **自带运行时**：插件用自己打包的 mermaid，全局 `mermaid.initialize` 只在首次渲染前调用一次；
  按图配置全部通过注入 `%%{init: …}%%` 指令实现。多条 init 指令深合并、**后出现者覆盖先出现者**。
- 更细的逆向结论与 mermaid 12 配置语义：见 [docs/obsidian-internals.md](docs/obsidian-internals.md)。

## 护栏

- 仓库保持无本机路径、无 vault 名、无个人信息；部署脚本只从 `VAULT` 环境变量或命令行参数取路径。
- 本机路径与版本记在 `.local/env.md`（`.local` 整目录被 gitignore 的 `*.local` 覆盖，模板见 `local-env.example.md`）；需要 vault 路径、Obsidian 版本或 gh 落点时读它，不要问也不要猜。
- 双语文档保持同步：`README.md` ↔ `README.zh-CN.md`、`CONTRIBUTING.md` ↔ `CONTRIBUTING.zh-CN.md`。
- 提交信息遵循 Conventional Commits；提交与推送等维护者明确要求后再做。
- CSS 类名与指令保持 `cm-` 命名空间；按图配置走注入指令，全局 mermaid 状态不被改写。
- 用户可见文案统一走 `plugin.t(英文, 中文)`（`src/i18n.ts`），不留硬编码标签；已渲染卡片靠 signature 里的语言字段触发重建来换文案，命令面板条目在语言变更时重新注册。
- 会被单测导入的模块不要在运行时 `import "obsidian"`（该包只有类型声明 `"main": ""`，离开 Obsidian 无法解析）；纯逻辑留在 `directives.ts` / `fit.ts` / `themes.ts` / `i18n.ts`。
- mermaid 版本已固定，升级版本需先在本地验证渲染行为再提交（四套主题着色、ELK/Dagre 差异、指令合并优先级）。

## 常用命令

- `npm run build`：类型检查（src + tests）+ 生产构建
- `npm test`：vitest 单测，只覆盖无 Obsidian 依赖的纯模块（`directives` / `fit` / `themes` / `i18n`）
- `npm run test:browser`：构建并托管 `tests/browser/` 的两个真实渲染验证页（主题 × 布局、主题与缓存
  不变量），升级 mermaid 前必跑
- `VAULT=<vault 路径> npm run deploy`：把构建产物部署进 vault 测试，之后需在 Obsidian 里重载插件
  （不会热更新）；本机的 vault 路径见 `.local/env.md`
