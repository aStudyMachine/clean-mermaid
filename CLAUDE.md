# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**本仓库的开发约定只有一份权威源：[AGENTS.md](AGENTS.md)。动手前先读它**，那里有「动手前必知的事实」
（两条渲染接管路径、`look: "classic"`、形状表例外、asar 版本陷阱、复审 Error = 市场搜不到）与「护栏」
（`cm-` 命名空间、`plugin.t()` 文案、纯模块不 import obsidian、双语文档同步、发版硬门禁、部署换库先问）。

配套文档按需查阅，不在这里复述：

- [CONTRIBUTING.md](CONTRIBUTING.md) — 环境、目录结构、实现约定、手动验收清单
- [docs/obsidian-internals.md](docs/obsidian-internals.md) — 动渲染 / 主题 / 接管前必读的逆向结论
- [docs/agent-lessons.md](docs/agent-lessons.md) — 跨会话踩坑经验与对策
- [.agents/skills/obsidian-plugin-release/SKILL.md](.agents/skills/obsidian-plugin-release/SKILL.md) — 发版与复审整改全流程

## 命令（AGENTS.md「常用命令」之外的两条）

仓库没有 ESLint / Prettier / Biome 配置，**`npm run build` 里的 tsc 是唯一的静态检查**。

```bash
npx vitest run tests/fit.test.ts        # 单个测试文件
npx vitest run -t "caps tall diagrams"  # 按用例名筛
```

`npm run test:browser` 只构建并起静态服务，**不会自动断言**：需打开 `render.html` / `cache.html`，
等 `window.__cmDone` / `__cmCacheDone` 后读 `__cmResults` / `__cmCacheResults` 逐项核对。
