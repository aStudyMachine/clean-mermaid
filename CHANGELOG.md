# 更新日志

本项目的版本记录。格式参考 Keep a Changelog，版本号遵循语义化版本；最新条目在最上面。
面向用户的中英双语发布说明在 GitHub Release 里，本文件是仓库内的完整变更记录。

## [0.1.3] - 2026-10-10

按 community.obsidian.md 对 0.1.2 的自动复审反馈做的整改。插件功能与用户可见行为不变，只有一项开发期
工具改动（见「新增」）。

### 新增

- `scripts/obsidian-asar.mjs`：`scan-asar.mjs` 与 `extract-obsidian-mermaid.mjs` 共用的 asar 定位。
  Windows 自动更新会把新包下到用户数据目录（`obsidian-<版本>.asar`）并在启动时优先加载，安装目录里的
  `resources\obsidian.asar` 因此长期停在旧版本上 —— 拿它做逆向会得出「版本更低、某 API 不存在」的错误
  结论。现在两个脚本不传路径就自动取实际运行的那份，传了更旧的会报错退出；确需扫旧版（例如核对
  `minAppVersion` 下调）时加 `--allow-stale`。`AGENTS.md`「动手前必知的事实」补了同一条，
  `CONTRIBUTING` 双语的目录表一并更新（顺带把误写的 `app.asar` 改成 asar）。

### 修复

- 构建配置不再依赖已废弃的 `builtin-modules` 包，改用 Node 内置的 `module.builtinModules`
  （`esbuild.config.mjs`）。旧列表是新列表的严格子集、多出来的全是 `node:` 前缀别名，打包闭包不变。
  `package-lock.json` 一并同步 —— 复审的「可复现构建」要求 lock 与 `package.json` 一致。

### 变更

- 界面语言判定改走 Obsidian 公开的 `getLanguage()`（`src/main.ts`），`src/i18n.ts` 里那处
  `window.localStorage.getItem("language")` 随之删除，纯模块不再碰任何存储。行为不变：Obsidian 自己的解析
  就是 `localStorage.getItem("language") || navigator 语言检测 || "en"`，与我们原来的手写逻辑一致。
- 导出与实时预览里三处 `document.createElement` 改用 Obsidian 的全局 `createEl`（`src/export.ts` 的
  canvas 与下载 anchor、`src/livepreview.ts` 的 host）。这两处要的都是**游离元素**，所以用全局函数而不是
  `document.createEl` —— 后者的语义是「创建并挂到该节点」，写错会让每次导出往文档里塞一个 anchor。
- 实时预览按住官方输出的 CSS 规则不再用 `:has()` 结构选择器，改由 `livepreview.ts` 在卡片撑起内容后往
  部件上打 `.cm-live-guard` 类（`styles.css`）。CodeMirror 会复用 DOM 部件，所以这个类必须和
  `.cm-core-hidden` 一起在 `dispose()` / `releaseWidget()` 里清除，否则复用后的部件高度会塌成 0。
- 设置面板两个滑块去掉已废弃的 `setDynamicTooltip()` —— 1.13 起滑块值本来就内联显示。

### 兼容性

- 仅桌面。`minAppVersion` 保持 1.14.4，mermaid 仍固定 12.1.0。

## [0.1.2] - 2026-10-08

面向社区目录上架自查的整改版本。

### 新增

- README 的「渲染对比」：四组图（流程图、状态图、ER 图、时序图）左右并排给出插件效果与 Obsidian
  原生效果。图片由 `npm run shots` 生成，源码在 `tests/browser/capture-diagrams.ts`。
- `scripts/extract-obsidian-mermaid.mjs`：从 Obsidian 的 `app.asar` 里取出**它自带的那份** mermaid
  （1.14.4 内为 11.13.0）作为对比的「原生」基线。必须用它而不是插件自带的 12.1.0 —— mermaid 12 起
  flowchart 的默认布局已经是 ELK，用 12.1.0 复现原生会得到两张一模一样的布局。
- `THIRD-PARTY-LICENSES.md`：按 `main.js` 的实际打包闭包列出 63 个第三方包及许可，并单独说明
  mermaid（MIT）、`elkjs`（EPL-2.0，弱 copyleft，注明对应源码出处）、DOMPurify（MPL-2.0 或
  Apache-2.0，本项目按 Apache-2.0 使用）与 robust-predicates（Unlicense）。
- `npm run deploy -- <库名> [<库名> …]`：一键「单测 → 构建 → 拷贝产物」，库名经 Obsidian 自己的
  vault 注册表换算成路径，仓库里不再需要出现任何本机路径。

### 修复

- 实时预览里的接管改为赶在 CodeMirror 量到该部件之前那一帧完成（内部钩子 `docViewUpdate`），
  滚动长文时不再出现高度跳动。

### 变更

- 文案不再以「Codex 风格」描述插件（README、`manifest.json` 与 `package.json` 的描述、代码与 CSS
  注释、设置面板里那句提示），避免借势第三方商标。设置项 `codex-light` / `codex-dark` 这类**旧主题 id
  的迁移映射值保持不变**，改了会让用户已保存的设置迁移失败。
- 不再宣称移动端可用：`isDesktopOnly` 改为 `true`，删掉 `src/export.ts` 中移动端「保存进 vault」的
  降级分支（连同随之无用的 `Platform` / `normalizePath` 引用与三个函数上多余的 `app` 参数），
  issue 模板的平台选项去掉 iOS / Android。剪贴板不可用时的降级提示保留 —— 桌面端同样可能缺
  `ClipboardItem`。
- 设置面板去掉「General / 通用」分节标题，语言设置直接置顶，对齐 Obsidian 官方 UI 指南。
- 插件加载时不再往控制台打印 `reading view processor registered`；只保留真实异常路径上的输出。
- 删掉 `manifest.json` 里的 `authorUrl` 占位符（官方标注该字段可选）。
- `docs/obsidian-internals.md` 补上两条实测结论：Obsidian 1.14.4 自带 mermaid 11.13.0；mermaid 12
  起 flowchart 默认布局已是 ELK（不写 `layout` 键的产出与显式 `layout:"elk"` 完全一致）。

### 兼容性

- `minAppVersion` 由 `1.4.0` 提到 **`1.14.4`**。1.4.0 这个声明本来就是错的：代码用到的
  `loadLocalStorage` 官方标注 `@since 1.8.7`、`removeCommand` 标注 `@since 1.7.2`；而实时预览的接管
  依赖未公开的选择器与钩子，只在 1.14.4 上逆向并实测过。`versions.json` 新增 `0.1.2 → 1.14.4`，
  已发布版本的旧映射保持原样。
- 仅桌面。mermaid 仍固定 12.1.0。

## [0.1.1] - 2026-10-08

### 新增

- 语言设置覆盖插件的全部界面文案：卡片工具条、`⋯` 菜单、错误卡片、全屏查看器、导出与复制的
  提示、以及命令面板里的条目名称，都跟随「自动 / 中文 / English」。此前只影响设置面板。
  切换语言后已渲染的卡片立即换文案，不需要重载插件。
- `npm test`（vitest）：49 条单测覆盖单图指令解析、自适应缩放计算、主题解析与 JSON 校验、
  语言判定。只测无 Obsidian 依赖的纯模块。
- `tests/browser/`：真实 mermaid 渲染验证脚本入库（4 主题 × 2 布局的着色与尺寸、用户 `%%{init}%%`
  指令优先级、plain 模式，以及主题与缓存不变量），`npm run test:browser` 构建并托管。
- `.github/workflows/ci.yml`：PR 与推送到 `main`/`dev` 时自动执行 `npm ci` → `npm test` → `npm run build`。
- `local-env.example.md` 与 `.local/env.md` 约定：vault 路径、Obsidian 版本、工具落点这类本机信息
  每台机器各填一份，整目录被 gitignore，不再散落到按工具命名的目录里。
- `scripts/scan-asar.mjs`：Obsidian 升级后用它复核 `docs/obsidian-internals.md` 里的逆向结论。

### 修复

- 编辑自定义主题的 `themeVariables` 后图表不再变色。卡片 signature 与渲染缓存都只按主题 id 识别，
  id 不变的改动会被当成「没有变化」，连命令面板的「Redraw all diagrams」也命中的是同一份缓存。
  现在主题内容（含 `dark` 标记）参与两者的计算。
- plain 图（`%% cm:plain %%`）在切换 Obsidian 明暗后仍是旧配色。plain 模式的配色取自文档明暗，
  但这一点没有进入渲染缓存键，因此会回放另一套配色的缓存结果。

### 变更

- `parseBlockDirectives` 从 `src/block.ts` 拆到 `src/directives.ts`；语言检测与取词从 `src/settings.ts`
  拆到 `src/i18n.ts`，插件对外暴露 `language` 与 `t(英文, 中文)`。
- 新增实现约定：会被单测导入的模块不得在运行时依赖 `obsidian`（该包只有类型声明，`"main": ""`），
  纯逻辑统一放在 `directives.ts` / `fit.ts` / `themes.ts` / `i18n.ts`。
- `npm run build` 的类型检查范围扩到 `tests/`。

### 兼容性

- `minAppVersion` 与 `versions.json` 的最低版本仍为 1.4.0，mermaid 仍固定 12.1.0。
- 本轮改动实测基于 Obsidian 1.14.4（桌面版）。

## [0.1.0] - 2026-10-07

首个公开版本：接管 vault 内所有 ` ```mermaid ` 代码块，渲染为干净的卡片。

- 阅读视图与实时预览双路接管。实时预览里官方按语言硬编码渲染，因此采用事后替换已渲染部件，
  并保留官方 DOM、镜像 vault 级的 mermaid 信任提示。
- 自带 mermaid 12 运行时，ELK 为默认布局引擎；可全局或按图切回 Dagre，支持 ELK 的 `mergeEdges`
  与节点排布策略。按图配置一律通过注入指令实现，不改写全局 mermaid 状态。
- 自适应居中与高度上限、`Ctrl/Cmd + 滚轮`缩放（10%–800%）、拖拽平移、双击复位、全屏查看器
  （滚轮/双指缩放、适应、100%、导出）。
- 图片化渲染（SVG data URL），避免被 Obsidian 主题或 CSS 片段改写，所见即所导出。
- 导出 PNG（1×/2×/3×、主题背景或透明）、SVG，复制图片或 Mermaid 源码；移动端改为保存进 vault。
- 四套内置主题（Clean Light、Clean Dark、Neutral、GitHub Light），自定义 `themeVariables` JSON
  带校验（非法输入拒绝并保留上一版生效值），随 Obsidian 明暗自动切换。
- 单图指令 `%% cm:theme=… %%`、`%% cm:layout=dagre %%`、`%% cm:plain %%`；中英双语设置面板。
- 检测到其它接管 mermaid 的插件时给一次性提示。
