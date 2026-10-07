# Clean Mermaid 贡献指南

[![English](https://img.shields.io/badge/lang-English-blue)](CONTRIBUTING.md) [![简体中文](https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-red)](CONTRIBUTING.zh-CN.md)

感谢参与贡献！请尽量让改动保持在插件既定范围内、行为可预期。

## 环境要求

- Node.js 18 或更高版本，以及 npm（开发环境为 Node 24 / npm 11）
- 手动测试需要 Obsidian 桌面端

## 本地准备

```bash
npm install
npm run dev        # 监听构建，产出 main.js
npm run build      # 类型检查（tsc --noEmit）+ 生产构建
```

把构建产物部署到某个 vault 里测试 —— **不要把 vault 路径硬编码进仓库**：

```bash
VAULT="<你的 Vault 路径>" npm run deploy
# 或者
npm run deploy -- "<你的 Vault 路径>"
```

之后在 Obsidian 里重载插件（*设置 → 第三方插件 → 重新加载*）；插件不支持热更新。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | 插件入口：注册 mermaid 代码块处理器（`sortOrder -100`）、实时预览扩展、命令与外观监听 |
| `src/block.ts` | 单个图表：指令解析、卡片 DOM、缩放平移状态机、`ResizeObserver`、导出 |
| `src/livepreview.ts` | 实时预览接管（Obsidian 在该视图硬编码渲染 mermaid，因此替换其已渲染部件） |
| `src/mermaid-runtime.ts` | 自带 mermaid 运行时：初始化配置、`%%{init}%%` 指令注入、SVG 归一化、LRU 缓存 |
| `src/themes.ts` | 内置主题、自定义主题解析与校验、明暗主题选择 |
| `src/fit.ts` | 纯函数自适应计算（不依赖 Obsidian，便于单测） |
| `src/viewer.ts` | 全屏查看器（缩放、平移、捏合、适应、导出） |
| `src/export.ts` | PNG 栅格化、SVG 输出、剪贴板、移动端「保存进 vault」降级 |
| `src/settings.ts` | 设置模型与设置面板（含自定义主题 JSON 编辑器与界面语言选项） |
| `styles.css` | 全部样式，类名以 `cm-` 命名空间；明暗通过 `body.theme-dark` 区分 |

## 实现约定

- 所有 CSS 类名保持 `cm-` 命名空间，所有指令保持 `%% cm:... %%` 前缀。
- 纯逻辑放到 `fit.ts` / `themes.ts` 这类模块里，保持可测试性。
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

把 `main.js`、`manifest.json`、`styles.css` 部署到某个 vault 后，逐项验证：

1. 阅读视图：mermaid 代码块渲染为 Clean Mermaid 卡片（白/深底画布、居中、右上角控件），
   而不是 Obsidian 自带渲染效果。
2. 实时预览：编辑代码块后能正确重渲染。
3. ELK 生效：复杂流程图与 `%% cm:layout=dagre %%` 的输出可见差异；ELK 设置
   （`mergeEdges`、`nodePlacementStrategy`）能改变渲染结果。
4. 切换 Obsidian 明暗外观后，图表按对应主题重绘。
5. 拖动分栏宽度时图表自动缩放并保持居中；极窄分栏不溢出。
6. `Ctrl/Cmd + 滚轮`以指针为中心缩放；普通滚轮照常滚动笔记；拖拽可平移；双击复位。
7. `⤢` 打开全屏查看器；缩放/平移/适应/100%/Esc 均正常；关闭后不影响内联图表。
8. `⋯` 菜单：PNG（含背景）、SVG、复制图片、复制源码均可用。
9. `%% cm:theme=neutral %%`、`%% cm:layout=dagre %%`、`%% cm:plain %%` 行为符合文档，
   且指令行不会出现在渲染结果中。
10. 自定义主题：非法 JSON 被拒绝并保留上一版生效值；合法 JSON 立即生效。
11. 语法错误时显示错误卡片（含切换 Dagre 的建议），且不影响笔记其它内容。
12. 禁用插件后恢复 Obsidian 自带的 Mermaid 渲染，无残留 DOM、无控制台报错。
13. `git status` 与全文检索确认没有本机路径、token 或个人信息进入暂存区。

## 反馈问题

请附上：Obsidian 版本、插件版本、操作系统、出问题的 Mermaid 源码（或最小复现），以及控制台报错信息。

---

English version: [CONTRIBUTING.md](CONTRIBUTING.md)