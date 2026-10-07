# 更新日志

本项目的版本记录。格式参考 Keep a Changelog，版本号遵循语义化版本；最新条目在最上面。
面向用户的中英双语发布说明在 GitHub Release 里，本文件是仓库内的完整变更记录。

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

首个公开版本：接管 vault 内所有 ` ```mermaid ` 代码块，渲染为 Codex 风格卡片。

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
