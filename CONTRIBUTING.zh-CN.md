# Clean Mermaid 贡献指南

[![English](https://img.shields.io/badge/lang-English-blue)](CONTRIBUTING.md) [![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red)](CONTRIBUTING.zh-CN.md)

感谢参与贡献！请尽量让改动保持在插件既定范围内、行为可预期。

## 环境要求

- Node.js 18 或更高版本，以及 npm（开发环境为 Node 24 / npm 11）
- 手动测试需要 Obsidian 桌面端 —— 插件声明 `isDesktopOnly: true`，移动端既不支持也不测

## 本地准备

```bash
npm install
npm run dev        # 监听构建，产出 main.js
npm run build      # 类型检查（tsc --noEmit，覆盖 src 与 tests）+ 生产构建
npm test           # 单元测试（vitest，不需要 Obsidian）
npm run test:watch # 改动后自动重跑相关用例
```

浏览器验证脚本（真实渲染 mermaid，用浏览器即可，不需要 Obsidian）：`npm run test:browser` 会构建
`tests/browser/*.js` 并起本地服务，打开 `http://localhost:8787/render.html`（4 套主题 × 2 种布局 +
指令优先级）与 `http://localhost:8787/cache.html`（主题与缓存不变量）。升级 mermaid 版本前必须先跑这两个。

一键部署：跑单测 → 构建 → 把产物拷进指定的库。**不要把 vault 路径硬编码进仓库**，库用名字指定，
脚本会去 Obsidian 自己的 vault 注册表（`%APPDATA%/obsidian/obsidian.json` 等）里查，库名就是路径最后一段：

```bash
npm run deploy -- <库名> [<库名> …]        # 一次可以部署多个库
npm run deploy -- <库名> --no-check        # 跳过测试与构建，只拷现有产物
npm run deploy -- <库名> --restart         # 部署完重启 Obsidian（仅 Windows，会关掉所有库）
npm run deploy -- "<你的 Vault 完整路径>"   # 库还没在 Obsidian 里打开过时
VAULT="<你的 Vault 完整路径>" npm run deploy
npm run deploy                             # 不带参数：打印可用库名与用法
```

目标名字全部解析成功才会开始跑测试与构建；之后在 Obsidian 里重载插件（*设置 → 第三方插件 → 重新加载*，
或 `Ctrl+P → Reload plugin without saving`）；插件不支持热更新。

本机自己的信息 —— vault 路径、Obsidian 版本、工具落点 —— 记在 `.local/env.md`（整目录已被
gitignore，照 `local-env.example.md` 复制一份填写），不要写进任何入库文件。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | 插件入口：注册 mermaid 代码块处理器（`sortOrder -100`）、实时预览扩展、命令与外观监听 |
| `src/block.ts` | 单个图表：卡片 DOM、缩放平移状态机、`ResizeObserver`、导出 |
| `src/directives.ts` | `%% cm: ... %%` 指令解析（纯字符串逻辑，有单测） |
| `src/livepreview.ts` | 实时预览接管（Obsidian 在该视图硬编码渲染 mermaid，因此替换其已渲染部件） |
| `src/mermaid-runtime.ts` | 自带 mermaid 运行时：初始化配置、`%%{init}%%` 指令注入、SVG 归一化、LRU 缓存 |
| `src/themes.ts` | 内置主题、自定义主题解析与校验、明暗主题选择 |
| `src/fit.ts` | 纯函数自适应计算（不依赖 Obsidian，便于单测） |
| `src/viewer.ts` | 全屏查看器（缩放、平移、捏合、适应、导出） |
| `src/export.ts` | PNG 栅格化、SVG 输出、剪贴板 |
| `src/i18n.ts` | 语言检测（`auto` 跟随 Obsidian）与插件所有界面文案共用的中英取词 |
| `src/settings.ts` | 设置模型与设置面板（含自定义主题 JSON 编辑器与界面语言选项） |
| `styles.css` | 全部样式，类名以 `cm-` 命名空间；明暗通过 `body.theme-dark` 区分 |
| `tests/` | 纯逻辑模块的 vitest 单测（`directives.ts`、`fit.ts`、`themes.ts`、`i18n.ts`、`scripts/resolve-vault.mjs`） |
| `tests/browser/` | 真实 mermaid 渲染的浏览器验证脚本（主题 × 布局产出、主题与缓存不变量），以及 README 对比图的捕获链路（`capture-*`、`native-config.ts`）—— 维护者本机的素材工具，不属于贡献流程 |
| `images/` | README 对比图的 PNG，由上面那条链路生成 |
| `scripts/extract-obsidian-mermaid.mjs` | 从 Obsidian 的 asar 里取出它自带的 mermaid 构建，供 README 对比图的「原生」一侧使用 —— 维护者本机用，见 `AGENTS.md` |
| `scripts/obsidian-asar.mjs` | 下面两个脚本共用的 asar 定位：默认取本机**实际运行**的那份，给到更旧的会拦下来（`--allow-stale` 放行） |
| `scripts/deploy.mjs` | 一键部署：单测 → 构建 → 把三个产物拷进指定的一个或多个库（`--no-check` / `--restart`） |
| `scripts/resolve-vault.mjs` | 库名 ↔ 路径的换算（读 Obsidian vault 注册表；纯判定与文件读取分开，便于单测） |
| `scripts/scan-asar.mjs` | Obsidian 升级后重新核对 `docs/obsidian-internals.md` 里的逆向结论 |
| `local-env.example.md` | `.local/env.md` 的模板 —— 各台机器把自己的路径记在那里，不入库 |

## 实现约定

- 所有 CSS 类名保持 `cm-` 命名空间，所有指令保持 `%% cm:... %%` 前缀。
- 用户可见文案一律走 `plugin.t(英文, 中文)`（见 `src/i18n.ts`），卡片工具条、`⋯` 菜单、错误卡片、
  全屏查看器与提示里都不要留下硬编码标签。
- 纯逻辑放到 `fit.ts` / `themes.ts` 这类模块里，保持可测试性。
- 会被单测导入的模块不得在运行时 `import` `obsidian` 包：该包只有类型声明（`"main": ""`），离开
  Obsidian 就无法解析。指令解析、自适应计算、主题选择、i18n 这些纯逻辑要放在不依赖它的模块里 ——
  绑定 Obsidian 的是 `block.ts`、`main.ts`、`settings.ts`。
- 渲染缓存键与卡片 signature 必须覆盖所有会影响 SVG 的输入：主题**内容**（用 `themeIdentity`，不是
  主题 id）、布局引擎、ELK 选项、图表源码，以及 plain 模式下的明暗。少一项就会静默回放旧图。
- 不要改写全局对象（不替换 `window.mermaid`、不产生全局 `mermaid.initialize` 副作用）；
  按图配置一律通过注入指令实现。
- 任何提交进仓库的文件里都不得出现本机路径、vault 名称或个人信息。

## 提交与 PR

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`feat: ...`、
  `fix: ...`、`docs: ...`、`refactor: ...`、`chore: ...`。
- PR 保持聚焦，并在描述里说明**为什么**需要这个改动。
- 行为、设置或指令发生变化时，需同时更新 `README.md` 与 `README.zh-CN.md`、
  `CONTRIBUTING.md` 与 `CONTRIBUTING.zh-CN.md`，保持各语言版本内容一致。
- 仅在发布 PR 里更新 `manifest.json` 与 `versions.json` 的版本号。

## 手动验收清单

先跑自动化检查 —— `npm test` 与 `npm run build` 都必须通过（CI 会在每个 PR 上执行这两步）。
再把 `main.js`、`manifest.json`、`styles.css` 部署到某个 vault 后，逐项验证：

1. 阅读视图：mermaid 代码块渲染为 Clean Mermaid 卡片（白/深底画布、居中、右上角控件），
   而不是 Obsidian 自带渲染效果。
2. 实时预览：编辑代码块后能正确重渲染。
3. ELK 生效：复杂流程图与 `%% cm:layout=dagre %%` 的输出可见差异；ELK 设置
   （`mergeEdges`、`nodePlacementStrategy`）能改变渲染结果。
4. 切换 Obsidian 明暗外观后，图表按对应主题重绘；`%% cm:plain %%` 的图、以及固定主题（不跟随明暗）
   下的图同样如此。
5. 拖动分栏宽度时图表自动缩放并保持居中；极窄分栏不溢出。
6. `Ctrl/Cmd + 滚轮`以指针为中心缩放；普通滚轮照常滚动笔记；拖拽可平移；双击复位。
7. `⤢` 打开全屏查看器；缩放/平移/适应/100%/Esc 均正常；关闭后不影响内联图表。
8. `⋯` 菜单：PNG（含背景）、SVG、复制图片、复制源码均可用。
9. `%% cm:theme=neutral %%`、`%% cm:layout=dagre %%`、`%% cm:plain %%` 行为符合文档，
   且指令行不会出现在渲染结果中。
10. 自定义主题：非法 JSON 被拒绝并保留上一版生效值；合法 JSON 立即生效。
11. 语法错误时显示错误卡片（含切换 Dagre 的建议），且不影响笔记其它内容。
12. 禁用插件后恢复 Obsidian 自带的 Mermaid 渲染，无残留 DOM、无控制台报错。
13. 语言设置：切换后卡片工具条、`⋯` 菜单、错误卡片、全屏查看器与各类提示立即换成对应语言，
    命令面板条目名称同样同步更新，无需重载插件。
14. `git status` 与全文检索确认没有本机路径、token 或个人信息进入暂存区。

## 反馈问题

请附上：Obsidian 版本、插件版本、操作系统、出问题的 Mermaid 源码（或最小复现），以及控制台报错信息。

---

English version: [CONTRIBUTING.md](CONTRIBUTING.md)