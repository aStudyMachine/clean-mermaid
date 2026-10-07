# 本机环境模板（复制为 `.local/env.md` 后填写）

新克隆到一台机器后，把本文件复制成 `.local/env.md` 并按下面字段填写。`.local/` 整目录被
`.gitignore` 忽略（命中的是 `*.local` 那行），所以本机事实只活在你自己的磁盘上。

- **只记路径与版本，不记任何凭据**（token、密码、`.env` 内容一律不放这里）。
- 这些值不得出现在仓库的其它文件里 —— 文档与代码只写「从 `VAULT` 环境变量或命令行参数传入」。
- 换设备 = 重新填一份：路径本就因设备而异，不要指望它跟着 `git clone` 过来。
- 每次提交前照旧核对 `git status` 与全文检索，确认没有本机路径进入暂存区（见 `CONTRIBUTING.md` 验收清单）。

```markdown
# 本机环境（clean-mermaid）

## 设备
- 设备键（`COMPUTERNAME`）：<主机名>
- 系统：<OS 与版本、架构>
- 用户目录：<路径>
- 项目在本机的位置：<路径>

## 运行时与工具
- Node <版本> / npm <版本>
- gh CLI：<路径与版本>（是否在 PATH 写清楚）
- Shell：<路径>

## Obsidian
- 版本：<版本>
- asar：<路径>（`node scripts/scan-asar.mjs "<asar>" "<关键词>"` 的输入）

## 测试 vault（`VAULT=<路径> npm run deploy`）
| 用途 | 路径 | 备注 |
| --- | --- | --- |
| 主测试 | <路径> | 有无其它 mermaid 插件 |
| 冲突提示测试 | <路径> | 装了什么竞争插件、当前启用还是禁用 |
| 图型全覆盖 | <路径> | 笔记数 / mermaid 块数量级、当前外观是浅色还是深色 |

## 插件落盘位置
`<vault>\.obsidian\plugins\clean-mermaid\`（`main.js` + `manifest.json` + `styles.css`，
`data.json` 为用户设置）；部署后需在 Obsidian 里重载插件，不热更新。
```

字段可以按需增删，但这四条纪律保留：无凭据、无跨文件复制、按设备各填一份、提交前自查。
