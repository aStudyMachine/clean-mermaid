# AGENTS.md — clean-mermaid 开发约定

Obsidian 插件：接管 vault 内所有 ` ```mermaid ` 代码块，渲染为卡片式图表（自带 mermaid 12、
ELK 默认布局、自适应居中、缩放平移、图片化预览、PNG/SVG 导出、主题与单图指令）。

文档地图（改动前先读对应那份，避免重复劳动）：
[README.md](README.md) / [README.zh-CN.md](README.zh-CN.md) 特性与用法 ·
[CONTRIBUTING.md](CONTRIBUTING.md) 环境、目录结构、实现约定、手动验收清单 ·
[docs/obsidian-internals.md](docs/obsidian-internals.md) 动渲染 / 主题 / 接管前必读的逆向结论 ·
[docs/agent-lessons.md](docs/agent-lessons.md) 跨会话踩坑经验与对策（agent 共识，补录规则见文内） ·
[docs/pele-migration.md](docs/pele-migration.md) 用 Pele 替换内置 mermaid 的调研与迁移规划（**未动工**，动渲染层前先读） ·
[CHANGELOG.md](CHANGELOG.md) 版本变更记录（发版时补条目） ·
[TODO.md](TODO.md) 当前待办（完成即删）

## 动手前必知的事实

- **实时预览里 mermaid 由官方便编码渲染**：代码块部件在任何注册表查询之前就按 `lang === "mermaid"`
  直接调官方渲染器 —— 用处理器 API 在编辑视图**不可能**接管，只能像 `src/livepreview.ts` 那样
  事后替换已渲染部件（隐藏官方输出而非删除，以兼容官方 recycler）。替换必须赶在 CodeMirror 量到该
  部件之前那一帧完成，靠的是内部钩子 `docViewUpdate`；改成 rAF 就慢一帧、滚动时会抖（细节与排障
  路径见 [docs/obsidian-internals.md](docs/obsidian-internals.md)）。
- **阅读视图**：官方 mermaid 是普通后处理器；我们在 `main.ts` 用
  `registerMarkdownCodeBlockProcessor("mermaid", …, -100)` 排在它之前接管。
- **重复注册会抛异常**："同一语言已有代码块处理器"时会抛 `already registered`，`main.ts` 里那段
  try/catch 是必要的兜底，保留它。
- **自带运行时**：插件用自己打包的 mermaid，全局 `mermaid.initialize` 只在首次渲染前调用一次；
  按图配置全部通过注入 `%%{init: …}%%` 指令实现。多条 init 指令深合并、**后出现者覆盖先出现者**。
- **节点观感由注入指令里的 `look: "classic"` 决定**：mermaid 12 每个图种段自带 `look: "neo"`（节点投影 +
  被硬编码抬高的内边距），`buildInitConfig` 注入**顶层** `look` 一条就能全图种关掉；同一处还把
  `state` / `flowchart` 的 `minNodeWidth` 放开到 0、`wrappingWidth` 放宽到 400，让节点贴着文字量尺寸。
  动这几行等于改整个插件的观感，取值依据与逆向结论见 [docs/obsidian-internals.md](docs/obsidian-internals.md)。
- **判断节点（`{}`）的菱形是贴着文字量画的，不走配置**：mermaid 内置的 `question` 恒为正方形
  （边长 = 文字宽 + 文字高 + 2×padding），一行短标签会被裹进一大片空白；配置里没有任何形状或宽高比
  开关，所以我们在自己打包那份 mermaid 的形状表上把处理器包一层，只重写几何。改这个观感去
  `src/decision-shape.ts`（等比贴字 + 宽高比夹在 `DECISION_MIN_ASPECT`–`DECISION_MAX_ASPECT`），
  门控与四条逆向结论见 [docs/obsidian-internals.md](docs/obsidian-internals.md)。
- **只声明桌面**：`manifest.json` 的 `isDesktopOnly` 为 `true`，导出（`src/export.ts`）一律走浏览器下载，
  不要再加移动端分支或移动端文案 —— 真机从未实测。
- **Obsidian 1.15 已把官方 mermaid 换成 Pele**（2026-10-22 catalyst changelog；本机 `obsidian-1.14.5.asar`
  已分发 `lib/pele.min.js` 但未启用）。这意味着「自带 mermaid 12 + ELK」的相对优势有保质期；换不换、
  什么时候换的实测数据与分阶段方案在 [docs/pele-migration.md](docs/pele-migration.md)，动渲染层前先读它。
- **兼容口径按实测写**：`minAppVersion` 取唯一实测过的 Obsidian 版本（现 1.14.4），因为接管依赖未公开的
  选择器与钩子；要下调它先用 `scripts/scan-asar.mjs --allow-stale` 复核目标版本，再看 `docs/obsidian-internals.md`。
- **本机运行版本 ≠ 安装目录版本**：Windows 自动更新把新包下到 `%APPDATA%\obsidian\obsidian-<版本>.asar`
  并在启动时优先加载，安装目录里的 exe 与 `resources\obsidian.asar` 会长期停在一个旧版本上。逆向一律以
  Roaming 那份为准 —— `scripts/scan-asar.mjs` 与 `scripts/extract-obsidian-mermaid.mjs` 不传路径时自动取它，
  传了比它旧的会直接拦下来（`--allow-stale` 才放行）。要判断真实版本看 `%APPDATA%\obsidian\obsidian.log`
  的 `Loading updated app package` 或窗口标题；只查安装目录就下结论，会得到「版本更低、某 API 不存在」的错答案。
- **复审 Failed 会让插件在社区目录搜不到**（维护者 2026-10-12 实测确认，不是观感问题而是发布阻断）：
  出现 **Error 级**条目就会把整次 release 复审打成 Failed。而且**同版本号重发不会重算**——结论按
  `version` 缓存（同一 commit 的 branch 预览是 Completed，release 条目却仍报修复前的旧行号），
  唯一出路是**发一个新版本**。所以代码侧结论必须前置到发版之前拿到，别指望原地修好。
- **前置手段是 `Review branch` 预览扫描**：`community.obsidian.md/account/plugins/<id>/review-branch`
  可对任意 branch / tag / SHA 跑同一套自动检查，不需要 release。但要知道它的边界 —— **预览没有
  `Releases` 与 `Build verification` 两节**（没有 release 资产可比），所以体积、attestation、
  byte-for-byte 复现这三项它给不出结论，仍要靠 dry-run + 三方 sha256。已知 Error 级只来自
  Source code 规则；产物类问题会不会也打成 Error 尚未证实。
- 更细的逆向结论与 mermaid 12 配置语义：见 [docs/obsidian-internals.md](docs/obsidian-internals.md)。

## 护栏

- 仓库保持无本机路径、无 vault 名、无个人信息；部署脚本只从 `VAULT` 环境变量或命令行参数取路径。
- 本机路径与版本记在 `.local/.env`（键值对 + `#` 注释；`.local` 整目录被 gitignore 的 `*.local` 覆盖，模板见 `env.example`）；需要 vault 路径、Obsidian 版本或 gh 落点时读它，不要问也不要猜。
- 双语文档保持同步：`README.md` ↔ `README.zh-CN.md`、`CONTRIBUTING.md` ↔ `CONTRIBUTING.zh-CN.md`。
- `CHANGELOG.md` 与 GitHub Release 说明都**面向普通用户**，具体说明与用户相关的功能、修复、行为变化、
  兼容性及必要的使用方式。内部维护记录可以一句概括，不展开实现细节、重构、开发工具、CI / 部署流程、
  元数据清理、品牌措辞调整或社区上架 / 复审内容。复审里「不修的项」及其理由、跑过的验证过程
  留在 `TODO.md`。
- GitHub Release 说明在「面向普通用户」之上另有固定格式：**英文在前、中文在后**，按
  New / Changed / Fixed / Compatibility（中文新增 / 变更 / 修复 / 兼容性）分节，只写用户能直接
  感知的变化；无用户可见变化的版本写一句双语「仅内部维护」。模板与细则见
  [.agents/skills/obsidian-plugin-release/SKILL.md](.agents/skills/obsidian-plugin-release/SKILL.md)。
- **发版顺序是硬门禁**（任何一步不过就别继续）：抬 `manifest.json` / `package.json` /
  `versions.json` 三处版本并按 `npm install` 同步 lock → 推 dev → 合默认分支并推送 →
  **对将发布的 commit 跑 `Review branch` 预览，无 Error 级才继续** → dry-run（`publish` 不勾）
  比对 CI 与本机三个产物的 sha256 逐一相同 → `publish=true` 建 Release 并签 attestation →
  补双语发布说明 → 点「Check for new releases」→ **等该 version 的条目回到 Completed 才算发完**
  （Failed 等于插件在市场搜不到，见「动手前必知的事实」）。`release.yml` 里的「代码侧守卫」是把
  已知 Error 级规则抄成 grep 的本地兜底，不能替代预览扫描。
- 提交信息遵循 Conventional Commits；提交与推送等维护者明确要求后再做。
- CSS 类名与指令保持 `cm-` 命名空间；按图配置走注入指令，全局 mermaid 状态不被改写。
  **唯一例外**：判断节点的菱形几何靠替换插件**自己打包那份** mermaid 的形状表实现
  （`installCompactDecisionShape`），因为几何不在任何配置里、`%%{init}%%` 与 CSS 都够不到
  （依据见 [docs/obsidian-internals.md](docs/obsidian-internals.md)）。Obsidian 官方那份 mermaid 不受影响，
  设置项「判断节点形状」可整体退回原生正方形，`%% cm:plain %%` 恒用原生。别把它扩大成第二类改写。
- 用户可见文案统一走 `plugin.t(英文, 中文)`（`src/i18n.ts`），不留硬编码标签；已渲染卡片靠 signature 里的语言字段触发重建来换文案，命令面板条目在语言变更时重新注册。
- 会被单测导入的模块不要在运行时 `import "obsidian"`（该包只有类型声明 `"main": ""`，离开 Obsidian 无法解析）；纯逻辑留在 `directives.ts` / `decision-shape.ts` / `fit.ts` / `themes.ts` / `i18n.ts`。
- **mermaid 版本已固定，升级版本需先在本地验证渲染行为再提交（四套主题着色、ELK/Dagre 差异、指令合并优先级）**；
  升级还会在构建期直接报 `Could not resolve "mermaid/dist/chunks/mermaid.core/chunk-<hash>.mjs"` ——
  那是判断节点形状补丁依赖的内部 chunk 文件名，**解析失败要当真**，重新核对 `docs/obsidian-internals.md`
  里「形状表 / `question` 恒为正方形 / `{}` 走 `diamond` 键」三条后再放行，不要改成动态 require 之类把它糊过去。
- 会话中踩坑、修正了既有认知或建立了新的可复用验证方式后，主动提议把「教训 → 对策」补录进
  [docs/agent-lessons.md](docs/agent-lessons.md)，经维护者确认后落档；与既有文档重复的内容引用而不复制。

## 常用命令

- `npm run build`：类型检查（src + tests）+ 生产构建
- `npm test`：vitest 单测，只覆盖无 Obsidian 依赖的纯模块（`directives` / `fit` / `themes` / `i18n`
  / `scripts/resolve-vault`）
- `npm run test:browser`：构建并托管 `tests/browser/` 的两个真实渲染验证页（主题 × 布局、主题与缓存
  不变量），升级 mermaid 前必跑
- `npm run extract-mermaid`（asar 路径可省，默认自动取本机**实际运行**的那份）+ `npm run shots`：
  **维护者本机生成 README 素材用，不属于贡献流程**（不要要求贡献者跑）。前者把 **Obsidian 自带的那份
  mermaid**（1.14.4 为 11.13.0）取到 `tests/browser/obsidian-mermaid.min.js`（已 gitignore），后者构建两个
  捕获页并把 PNG 写进 `images/`。「原生」一侧必须用取出来的这份 —— mermaid 12 起 flowchart 默认布局就是
  ELK，用插件自带的 12.1.0 复现原生会得到两张一样的图。
- `npm run deploy -- <库名> [<库名> …]`：一键跑「单测 → 构建 → 拷贝产物」，库名由 Obsidian 自己的
  vault 注册表换算成路径（`--no-check` 只拷现有产物；`--restart` 部署完重启 Obsidian，仅 Windows，
  会关掉所有库，只在维护者明确要求时用）。目标全部解析成功才开始构建，之后仍需重载插件（不会热更新）。
  改代码阶段只往 `.local/.env` 的 `VAULT_PRIMARY` / `VAULT_SECONDARY`（主要 / 次要验收 / 调试）部署，
  要换库先问；本机路径一律从 `.local/.env` 读，不要写进本文件或仓库任何被跟踪的文件。
