# 用 Pele 替换内置 mermaid.js —— 调研与迁移规划

状态：**调研完成，未动工**。本文只记录事实与方案，不含任何已落地的代码改动。
调研日期：2026-10-23。所有数字都是在本机实测得到的，复核命令见文末「附录 A」。

---

## 0. 结论摘要

- **技术上可行，且收益明确**：`main.js` 5.11 MiB → 约 1.1 MiB（只留本插件自身代码 + pele），
  单图渲染 45 ms → 0.35 ms，同时消掉三条长期痛点（5 MiB 复审 Warning、mermaid chunk 哈希的构建期
  硬依赖、实时预览同帧补偿的抖动隐患）。
- **但它不是「换一个依赖」，是换渲染层 + 重做主题体系**。主题从「Mermaid `themeVariables`」变成
  「11 个 `--pele-*` CSS 变量」，布局引擎、判断节点几何补丁、flowchart 配置项全部失去着力点。
- **有一条决定性外部事实**：Obsidian **1.15.0（2026-10-22，catalyst 早期访问）已把官方 mermaid 换成
  Pele**。本机 `obsidian-1.14.5.asar` 里已经躺着 `lib/pele.min.js`（Pele **1.8.0**，699,670 B），
  1.14.4 里没有。也就是说官方正在分批落地，1.15 正式版发布后「自带 mermaid 12」这件事本身会从
  卖点变成负担（更慢、观感更旧、多 5 MB）。
- **建议节奏**：现在不动；先把渲染层抽成薄接口（无行为变化），等 1.15 正式版发布后按本文第 6 节
  分阶段迁移，作为 **0.2.0 主线**。
- **建议不做的折中**：双引擎（默认 Pele + `%% cm:engine=mermaid %%` 回退）。代价是 5.11 MiB 仍在包里，
  5 MiB 复审 Warning 不会消失，只买到一半收益。

---

## 1. 调研范围与一手来源

一手来源（全部直接读取，不依赖二手报道）：

- 仓库源码：`obsidianmd/pele` main 分支（`src/` 全量目录树、`package.json`、`AGENTS.md`、`LICENSE`）。
- 官方文档：`pele.run` 的 `api` / `compatibility` / `theming` 四篇（对应 `website/src/content/docs/`）。
- npm 产物：`pele@1.9.0` 实装到临时目录后直接 `import` 跑断言与基准。
- Obsidian 官方 changelog：`obsidian.md/changelog/2026-10-22-desktop-v1.15.0/`。
- 本机 asar：`%APPDATA%\obsidian\obsidian-1.14.4.asar` / `obsidian-1.14.5.asar`（用本仓库
  `scripts/scan-asar.mjs` 扫，遵守 AGENTS.md 里「本机运行版本 ≠ 安装目录版本」的口径）。
- 真实语料：从主库 `My-Resume/agent-output` 抽出 66 个 mermaid 代码块做批量渲染回归。

---

## 2. Pele 是什么

- `obsidianmd/pele`，作者 kepano（Obsidian CEO），**MIT**，当前 1.9.0，约 3000 星。
- 读 **Mermaid 12.1.0 语法**（与本插件当前自带的版本一致），但**自己实现解析器 + 布局引擎 + 渲染器**，
  不复用 mermaid 的任何代码路径；`tests/compat/` 里移植了 mermaid 的 parser specs 做差分模糊测试。
- 输出 SVG 字符串，**同步**返回，**零运行时依赖**，无 DOM 依赖（Node 里可直接跑）。
- 用 CSS 自定义属性着色，主题切换不需要重渲染。
- 官方自我定位（`AGENTS.md`）：*"Pele renders Mermaid text to SVG for Obsidian, themed with CSS custom
  properties."* + *"Rendering must be synchronous, without DOM access."*
- 支持的图种：Mermaid 12.1.0 内置的全部（flowchart / swimlane / sequence / class / state / er / gantt /
  gitGraph / pie / mindmap / kanban / timeline / journey / quadrant / xychart / requirement / sankey /
  architecture / C4 / block / railroad / treeview / cynefin / wardley / eventmodeling / usecase / venn /
  ishikawa / packet / radar / treemap / info …）。**不支持** ZenUML 与第三方 mermaid 插件。

### 2.1 决定性外部事实：Obsidian 1.15 已经内置 Pele

Obsidian 1.15.0 Desktop changelog（2026-10-22，catalyst 早期访问）原文要点：

- Mermaid 图与图表**改用 Pele 渲染**，兼容 Mermaid 12.1.0 语法。
- 图表更快、并使用你的主题的颜色与字体。
- 图表**响应笔记宽度**，缩小后可缩放平移。
- **因为 Pele 不能执行代码，图表不再先询问**，`Show Mermaid diagrams in notes` 设置被移除。

本机 asar 交叉验证：

| asar | `lib/pele.min.js` | Pele 版本 | `lib/mermaid.min.js` |
| --- | --- | --- | --- |
| `obsidian-1.14.4.asar` | 不存在 | — | 存在（mermaid 11.13.0） |
| `obsidian-1.14.5.asar` | **699,670 B** | **1.8.0**（bundle banner 自带版本号） | 仍存在 |

即：官方 Pele 代码已随 1.14.5 分发但尚未启用（1.15 的 asar 尚未发布，GitHub 上 v1.15.0 资产 404）。

---

## 3. 实测数据

### 3.1 体积

| 产物 | 原始 | gzip |
| --- | --- | --- |
| 当前 `main.js`（v0.1.8） | 5,367,227 B ≈ 5.11 MiB | 1,531,439 B |
| └ 其中 mermaid 12.1.0 单独打包 | 5,312,542 B | 1,514,237 B |
| pele 全量（32 个图种，CJS minified） | 718,731 B | 267,673 B |
| pele 仅 flowchart（`pele/core` + `pele/diagrams/flowchart`） | 133,926 B | 52,185 B |

→ 全量换 Pele 后插件产物预计落在 **0.9–1.2 MiB** 区间（Pele 全量 + 本插件自身代码，且本插件自身代码
现在被 mermaid 的体量掩盖了）。这也是复审里 `main.js > 5 MiB` 那条 Warning 消失的原因。

### 3.2 速度（headless Chrome，同一份源码，20 次平均，含 warmup）

| 场景 | mermaid 12.1.0 | pele 1.9.0 | 倍数 |
| --- | --- | --- | --- |
| 小图（6 节点含判断/分支/数据库/通知） | 44.95 ms | **0.35 ms** | ≈ 128× |
| 60 节点链式图 | 114.1 ms | **1.5 ms** | ≈ 76× |
| 同一小图的 SVG 输出 | 59,319 B | **3,704 B** | ≈ 1/16 |

### 3.3 语法覆盖（真实语料回归）

主库 `My-Resume/agent-output` 抽出 **66 个 mermaid 块**：

- 类型分布：flowchart 36 / state 16 / sequence 13 / er 1。
- Pele 渲染结果：**66 成功、0 失败**。
- 覆盖到的语法特性：`subgraph`（含内部 `direction`）、`<br/>`（4 处）、判断节点 `{}`（24 处）、
  边标签 `-->|x|`（18 处）、状态 `[*]`（15 处）、时序 `alt/loop/opt/par`（8 处）、时序 `Note`（5 处）。

补充探针（单条语法，全部通过）：`classDef` / `style` / `linkStyle` / `accTitle` / `accDescr` /
frontmatter `title` / `config:` / markdown 字符串标签 `` "`**bold**`" `` / `<font color>` / 图标
`@{ icon: "fa:fa-car" }` / `flowchart-elk` 关键字 / class / state / er / timeline / gitGraph / kanban /
journey / xychart / mindmap / pie / gantt。

### 3.4 输出安全性

| 检查 | Pele 输出 |
| --- | --- |
| `<style>` 内嵌样式表 | 无 |
| `<script>` | 无 |
| `<foreignObject>`（HTML label 载体） | 无 |
| 外部 `href` | 无（链接只出现在 `links[]` 元信息里） |
| 是否自包含可进 `<img src="data:...">` | **是**（实测栅格化取色正确） |

Pele 自身还有 `limit`（源码 50,000 字符）、`outputLimit`（SVG 4,000,000 字符）、`maxEdges`（5,000）
三道限制，并过滤 link/style 白名单。对本插件「图片化预览」是净收益：mermaid 的 `htmlLabels: true`
会产出 `foreignObject`，转 data URL 后在部分环境不稳定。

---

## 4. 能力对照：本插件现状 vs Pele

### 4.1 能直接对应的

| 能力 | 现在 | Pele 对应 |
| --- | --- | --- |
| 同步取 SVG 字符串 | `await mermaid.render(id, code)` | `render(source)` **同步** |
| 尺寸 | 从 SVG `viewBox` 解析 | `RenderResult.width/height` 直接给 |
| 错误信息 | mermaid 抛 Error（位置信息弱） | `PeleError`：`code` / `line` / `column` / `snippet` |
| 图类型识别 | — | `detectType()` / `supports()` / `mermaidType` |
| 确定性（可缓存） | 是 | 是（实测同输入同输出） |
| 无全局主题状态串味 | 需要小心（全局 `initialize` 一次） | 是（实测同进程内多次 `render` 互不影响） |

`PeleError.code` 有四个值：`unsupported-diagram` / `syntax` / `semantic` / `limit`。可以直接用来把
「语法错误」与「超出限制」分成两种错误卡片文案。

### 4.2 会失去的（破坏性）

| 能力 | 现状实现 | Pele 下的结果 |
| --- | --- | --- |
| **ELK 布局**（默认卖点） | `init.layout = "elk"` | **不存在**。`layout:"elk"` 与 `"dagre"` 输出逐字节相同；Pele 只有自家分层布局 |
| ELK 合并连线 / 节点排布策略 | `elkMergeEdges` / `elkNodePlacement` | 无对应开关 |
| **主题 = Mermaid `themeVariables`** | 4 套内置主题、42 个唯一键、126 条键值 | **完全不生效**。实测 `primaryColor:"#ff0000"` 输出与不写一模一样 |
| 自定义主题（用户填 themeVariables JSON） | 设置面板 JSON 编辑器 + 校验 | 需改为填 `--pele-*` 变量，是**不兼容的格式变更** |
| **判断节点扁菱形补丁** | `decision-shape.ts` + 形状表包装 | 补丁整体作废。Pele 自带菱形**固定宽高比 1.6** |
| flowchart 细粒度配置 | `nodeSpacing` / `wrappingWidth` / `minNodeWidth` / `look` | 实测只有 `rankSpacing` 生效；其余全部无效（`look` 无效反而无害，Pele 无 neo 观感） |
| `%% cm:layout=elk|dagre %%` 指令 | 有 | 无意义，需降级为「已忽略」或移除 |
| 数学公式 | katex 由 mermaid 内部调用 | **需自己接**：不传 `math` resolver 就直接显示 TeX 源码 |
| HTML 标签（`<b>` 部分可用、`<br/>` 可用、`<font color>` 被剥） | `htmlLabels: true` 完整 HTML | 仅 SVG `<text>` + 有限标记；任意 HTML label 不支持 |
| `click` 链接 | SVG 内嵌 `<a>` | 只返回 `links[]`，需自己绑事件（但本插件默认 `<img>` 展示，本来就不支持点击，**无回归**） |

判断节点菱形的具体差异（同一标签文字量下）：

| 标签文字框 | Pele（固定 1.6） | 本插件 compact 方案 |
| --- | --- | --- |
| 70×20 | 131×82（1.60） | 113×53（2.14） |
| 140×20 | 201×126（1.60） | 215×58（3.73） |
| 280×40 | 373×233（1.60） | 470×118（4.00） |

即 Pele 比 mermaid 原生正方形好得多，但比我们调过的扁菱形更「胖」，且长标签会明显变高。
**想保留现观感，就得在 SVG 字符串上再后处理 `polygon points`** —— 技术可行（Pele 的菱形就是
`<polygon points="0,-h/2 w/2,0 0,h/2 -w/2,0">`），但等于把 `decision-shape.ts` 重写一遍，
且要自己同步布局尺寸（Pele 的布局已按原尺寸排好，改形状会与相邻节点错位）。

### 4.3 主题映射（11 个变量 vs 42 个键）

Pele 暴露的着色入口（`theming` 文档 + 实测根元素内联变量）：

- 主变量：`--pele-bg` / `--pele-fg` / `--pele-muted` / `--pele-line` / `--pele-surface` /
  `--pele-surface-alt` / `--pele-border` / `--pele-accent` / `--pele-critical` / `--pele-error` /
  `--pele-radius`。
- 字体与字重：`--pele-font` / `--pele-font-mono` / `--pele-title-weight` / `--pele-heading-weight` /
  `--pele-bold-weight`。
- 图表色板：`--pele-series-1` … `--pele-series-8`。
- 另有 `RenderOptions.fontSize`（实测生效：14→192×61、16→200×64、20→216×70）。

各图种实际引用的变量（实测扫描输出 SVG 的 `var(--…)`）：

- sequence / state / er / gantt：只用主变量 + 字体，**没有任何专属配色位**。
- pie / gitGraph 等图表：额外用 `--pele-series-1..8`。

初步映射草案（细节留给实施阶段定，见第 6 节阶段 3）：

| Pele 变量 | 从现有 `themeVariables` 取 |
| --- | --- |
| `--pele-bg` | `background` |
| `--pele-fg` | `textColor` / `primaryTextColor` |
| `--pele-muted` | `titleColor`（或 `textColor` 降透明度） |
| `--pele-line` | `lineColor` |
| `--pele-surface` | `mainBkg`（**注意**：mermaid 里节点填充取的也是 `mainBkg`，不是 `primaryColor`） |
| `--pele-surface-alt` | `clusterBkg` |
| `--pele-border` | `nodeBorder` / `clusterBorder` |
| `--pele-accent` | `primaryBorderColor` 或新增一个独立强调色 |
| `--pele-font` | `fontFamily`（= `SYSTEM_FONT_STACK`） |
| `--pele-radius` | 新增（现有主题无圆角概念，取 4–6px） |

`actorBkg` / `signalColor` / `noteBkgColor` / `labelBoxBkgColor` / `activationBkgColor` 等 20 余个
mermaid 专属键在 Pele 下**无落点**，只能合并进 surface 系列。

---

## 5. 文件级影响面

| 文件 | 现状 | 处理 |
| --- | --- | --- |
| `src/mermaid-runtime.ts`（307 行） | mermaid 初始化 + init 指令注入 + 形状表补丁 + 缓存 | 换成 `src/renderer-pele.ts` 实现 `RenderEngine`；本文件删除 |
| `src/render-engine.ts` / `src/renderer.ts` / `src/svg-utils.ts` | 阶段 0 已落地：契约 / 组合根 / 引擎无关的 SVG 处理 | `renderer.ts` 换 import；契约只加 Pele 真需要的成员（如 `forgetTextWidths`） |
| `src/decision-shape.ts`（76 行） | 扁菱形几何 | **删除**（除非决定做 SVG 后处理保留观感） |
| `src/mermaid-shapes.d.ts`（58 行） | chunk 哈希 import 的类型声明 | **删除** |
| `src/themes.ts`（272 行） | 42 个 themeVariables 键 × 4 套 | 重做：11 变量映射 + 4 套主题重配色 + 自定义主题改格式 |
| `src/settings.ts`（592 行） | 含 `layoutEngine` / `elkMergeEdges` / `elkNodePlacement` / `decisionShape` / themeVariables JSON 编辑器 | 移除 4 个设置项、重做主题编辑器；`migrateSettings` 要处理旧配置（忽略而非报错） |
| `src/directives.ts`（54 行） | `%% cm:theme= %%` / `layout=` / `plain` | `layout` 作废；`theme` / `plain` 语义保留（`plain` 改为「Pele 默认外观」） |
| `src/block.ts`（576 行） | 双路径：命中缓存同步 build / 未命中 await | 合并为同步单路径（`peekRendered` 与 `renderDiagram` 可合一）；抖动隐患根除 |
| `src/livepreview.ts`（237 行） | 事后替换官方部件 + `docViewUpdate` 同帧 + `mermaid-vault-trust` 信任门 | 接管骨架保留；**信任门必须在 1.15 上重核**（官方已删除该设置与闸门） |
| `src/main.ts`（148 行） | 注册处理器 / 编辑器扩展 / `css-change` 重绘 | `css-change` 处理可简化（Pele 变量可 CSS 驱动），但字体变更仍需 `forgetTextWidths()` |
| `src/export.ts`（192 行） | SVG → canvas → PNG / 下载 | 阶段 0 起已不依赖任何引擎（只靠 `render-engine` 类型 + `svg-utils`） |
| `src/viewer.ts`（511 行） | 展开查看器 | 同上，**不用动** |
| `src/fit.ts`（88 行） | 纯缩放计算 | **不用动** |
| `src/i18n.ts` | 文案 | 需删/改与布局引擎、判断节点形状相关的条目 |
| `styles.css` | 卡片 / 工具条 / live-guard | 主体不动；`.cm-media` 内部 SVG 的类名从 mermaid 变成 `pele-*`，需核查有无依赖 mermaid 类名的规则 |
| `THIRD-PARTY-LICENSES.md` | mermaid + 62 个运行时包 | 改为 pele 单包 MIT |
| `esbuild.config.mjs` | 无特殊配置 | 无需改动（Pele 是标准 ESM，实测 CJS 打包可用） |
| `package.json` | `dependencies: mermaid 12.1.0`、`overrides: katex` | 换成 `pele`；`overrides.katex` 视是否保留数学公式决定 |
| `docs/obsidian-internals.md` | 大量 mermaid 12 配置语义 / 形状表逆向结论 | 大段失效，需标注「mermaid 时代结论」或归档 |

**不受影响**：`src/export.ts`、`src/viewer.ts`、`src/fit.ts`、卡片外观与交互、PNG/SVG 导出、
展开查看器、图片化预览、按图 `%% cm:theme= %%` / `%% cm:plain %%` 语义。

---

## 6. 迁移方案（分阶段，每阶段可独立验收）

### 阶段 0 —— 现在就能做，且不改变任何行为

**状态：已完成**（2026-10-23）。

**目标**：把「渲染」抽成一个薄接口，让上层不直接依赖 mermaid 类型。

实际落地（与本文初稿的差异已在此修正）：

- `src/render-engine.ts`：**纯类型 + `RenderEngine` 接口**，无任何运行时 import。`RenderRequest` /
  `RenderedDiagram` 从 `mermaid-runtime.ts` 搬到这里，成为引擎无关的契约。
- `src/svg-utils.ts`：`svgToDataUrl()` 与 `normalizeSvg()` 搬到这里 —— 换引擎后这两步依然要做。
- `src/renderer.ts`：组合根，只导出 `peekRendered()` / `renderDiagram()`；换引擎改这一个文件的 import。
- `src/mermaid-runtime.ts`：仍是唯一 import `mermaid` 的文件，导出 `mermaidEngine: RenderEngine`。
- 上层（`block.ts` / `export.ts` / `viewer.ts` / `tests/browser/*`）改走 `renderer.ts` + `render-engine.ts`。
- 初稿提的 `clearRenderCache()` / `invalidateTextMetrics()` **没做**：当前没有任何调用方（「强制重画」
  只是绕过 signature 短路，不要求真的重跑渲染器），加进来就是死代码。换到 Pele 时它需要
  `forgetTextWidths()` 才能重测字体，届时有真实调用方再往 `RenderEngine` 加。

**验收结果**：`tsc` 通过；`npm test` 73 项全绿；`npm run test:browser` 两页在浏览器里跑通
（theme/cache 不变量 5 条全过；render 页 16 条断言无 error，compact 菱形 aspect 2 / 长标签 4 /
原生正方形 1、katex 数学元素存在，均与改前一致）；`npm run build` 产物 5,367,349 B，
与改前 5,367,227 B 只差源文件重排。

**等价性验证**（临时做了一次，未入库）：用 `git worktree` 在 HEAD（改前）上建一份基线，两侧各
构建一个只调用 `renderDiagram()` 的浏览器页，对 7 类图 × plain 开/关共 14 个用例比对
`width` / `height` / 归一化后 SVG 的 sha256（归一化只抹掉 mermaid 每次渲染都不同的 `cm-<seq>-<时间戳>`
及其 id/marker 引用）。结果：**12/14 逐字节相同**；不一致的 2 个都是 `classDiagram`，而基线
**自己连跑两次也不相同**（`ca09dcf…` → `826c757…`）—— 那是 mermaid 自身的非确定性，
与本次改动无关。这条也说明 `classDiagram` 进不了基于 SVG 哈希的缓存断言。

### 阶段 1 —— 接入 Pele 但保持旧路径可回退（仅本地验证，不发布）

**目标**：在真实 vault 上跑通观感与语法覆盖，收集差异清单。

- 新增 `src/renderer-pele.ts`（实现 `RenderEngine`），`render()` → `normalizeSvg()` → 缓存，
  然后在 `src/renderer.ts` 里把 `engine` 换成它。
- 关键实现细节（都是实测确认过的）：
  - **`responsive: false`、不传 `maxWidth`**。本插件自己算 `computeFit` 缩放；Pele 的响应式会
    按容器宽度重排布局（<640px 自动把 `LR` 转竖向），两套适配叠加会互相打架。
  - **每张图传唯一 `idPrefix`**。`render()` 默认前缀是 `pele`，一页多图会撞 ID（sankey 渐变、
    `accTitle` 的 `aria-labelledby` 都依赖它）。
  - **变量注入方式**：在根 `<svg>` 已有 `style` 属性最前面插入 `--pele-*:…;`。注意 Pele 的根
    `style` 里已有 `font-family:var(--pele-font,sans-serif)`，所以变量必须真的设上，否则字体会回退。
  - **字体必须「量的」与「画的」一致**：`render()` 用 `fontFamily` 选项测量，绘制时用
    `var(--pele-font)`。两者不一致会让标签溢出节点。→ 同时传 `fontFamily: SYSTEM_FONT_STACK`
    并注入 `--pele-font` 同一串。
  - **`fontFamily` 里带引号的字体名会被 XML 转义**（实测 `"Segoe UI"` 变成 `&quot;Segoe UI&quot;`）。
    现有 `SYSTEM_FONT_STACK` 含引号，需确认在 SVG 里仍能解析；必要时改成无引号写法。
  - `normalizeSvg()` 现有的「剥掉 `max-width`、强制写像素宽高、补 `xmlns:xlink`」逻辑可以原样复用。
- 验收：
  - 主库 66 块全部渲染成功（本文 3.3 已预跑通过）。
  - 主题 × 布局验证页（`npm run test:browser`）在 Pele 下重跑，目检 4 套主题 × 主要图种。
  - 实时预览滚动无抖动（Pele 同步渲染，理论上比现在更稳）。

### 阶段 2 —— 主题体系重做

**目标**：4 套内置主题 + 自定义主题在新变量体系下等价。

- 按 4.3 的映射草案产出 `--pele-*` 变量表，逐套目检（浅色 / 深色各一遍）。
- 自定义主题格式变更：从 `themeVariables` JSON 改为 `--pele-*` 变量 JSON。
  需在 `migrateSettings` 里做旧值处理：**保留旧数据但标记为不生效**并给一次性提示，不要静默丢弃。
- 卡片背景色（`themeCanvasColor`，同时用作 PNG 导出背景）改读 `--pele-bg` 对应值。
- 验收：与阶段 1 的截图对比，逐图确认观感差异都在预期内（差异必然存在：布局引擎换了）。

### 阶段 3 —— 设置与指令清理

- 移除 `layoutEngine` / `elkMergeEdges` / `elkNodePlacement` / `decisionShape` 四项及其 UI。
- `%% cm:layout=… %%` 降级为「识别但忽略」还是彻底移除，需维护者拍板（见第 8 节）。
- 判断节点菱形：默认接受 Pele 的 1.6，还是做 SVG 后处理保留扁菱形，需维护者拍板。
- 验收：设置面板截图、`npm test`（`directives` 单测要同步改）。

### 阶段 4 —— 数学公式（可选，取决于是否需要）

- 若不接 `math` resolver：`$$…$$` 会显示 TeX 源码 —— 对现有 vault 是**回归**（现在 mermaid 内置 katex 能排）。
- 接法：`math: (tex, size) => ({ svg, width, height })`，用 katex 的 `output: 'mathml'` 会走
  `foreignObject`（进 `<img>` 会失效），必须走 **SVG 输出**。
- 代价：katex 重新进包（约 300 KB 级），部分抵消体积收益。
- 验收：`tests/browser/` 的数学用例在 `<img>` 展示路径下目检。

### 阶段 5 —— 文档、许可、发版

- `THIRD-PARTY-LICENSES.md` 重写（单包 MIT）。
- `README.md` ↔ `README.zh-CN.md`、`CONTRIBUTING.md` ↔ `CONTRIBUTING.zh-CN.md` 同步：
  - 删除 ELK / 布局引擎 / 判断节点形状相关表述。
  - 「渲染对比」一节的「原生」一侧口径要重定义（1.15 之后原生就是 Pele）。
  - `npm run extract-mermaid` / `npm run shots` 两个素材脚本的前提（从 asar 取 mermaid 11.13.0）
    在 1.15 上失效，需重新设计。
- `docs/obsidian-internals.md` 大段失效，需加「mermaid 时代」标注。
- `CHANGELOG.md` 与 Release 说明按「面向普通用户」写破坏性变更（见第 7 节）。
- 发版走 AGENTS.md 的硬门禁全流程（含 `Review branch` 预览扫描）。

---

## 7. 破坏性变更清单（面向用户的草案）

- **布局**：不再提供 ELK / Dagre 选择，改用新的布局引擎；图的排布会变。
- **主题**：自定义主题改为填 `--pele-*` 变量；旧的 `themeVariables` JSON **不再生效**（会被保留但不应用）。
- **判断节点形状**：设置项移除（形状由渲染器决定）。
- **图表外观**：所有图种的默认配色与留白都会变（因为渲染器换了）。
- **性能与体积**：渲染快约两个数量级，插件体积降到约 1/5。
- **`%% cm:layout=… %%`**：不再有作用。

---

## 8. 需要维护者拍板的决策点

1. **何时动工**：等 1.15 正式版（退出 catalyst）再切，还是 1.15 早期访问期间就开始？
   - 建议：等正式版。现在切会让 1.14.x 用户看到与官方完全不同的观感，制造新的不一致。
2. **判断节点菱形**：接受 Pele 的固定 1.6（简单、零维护），还是做 SVG 后处理保留扁菱形观感
   （要重写几何补丁 + 承担与布局错位的风险）？
   - 建议：先接受 1.6，把它当作「渲染器升级带来的观感统一」写进 CHANGELOG；真被抱怨再补后处理。
3. **数学公式**：接 katex（保住 `$$…$$`，代价是包体回升），还是接受显示 TeX 源码？
   - 建议：接。现有 vault 里 `$$` 用得少，但「能排公式」是用户对 mermaid 的既有预期。
4. **`%% cm:layout=… %%`**：静默忽略、还是在卡片上给一次提示、还是直接删掉文档？
   - 建议：识别但静默忽略（不报错），文档里注明已失效。
5. **是否保留 `%% cm:plain %%`**：语义从「Obsidian 默认会显示的样子（mermaid 原生）」变成
   「Pele 默认外观」。保留键名，改文档描述。
6. **1.15 之后 minAppVersion**：是否抬到 1.15 以换取「官方已有 Pele、无需自带运行时」？
   - 这条要谨慎：抬 minAppVersion 会丢掉全部 1.14.x 用户。自带 Pele 的好处是版本可控，
     所以**不抬也能工作**，抬不抬取决于是否想复用官方那份 `lib/pele.min.js`。
   - 建议：不抬，继续自带 Pele（与现在自带 mermaid 的策略一致，版本自控）。

---

## 9. 风险与回退

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Pele 语法覆盖有洞（66 块样本之外的写法） | 部分用户的图渲染失败 | 阶段 1 用更大语料（全库 + pele 的 `tests/corpus`）跑批量回归；失败时降级为代码块展示而非错误卡片 |
| Pele 在 1.x 期间 API 变动 | 升级即破 | 锁定精确版本（`"pele": "1.9.0"`），不做 `^` 浮动 |
| 观感变化引发用户不满 | 评价下降 | CHANGELOG 明确写清「渲染器升级」；README 对比图重做 |
| 主题重做后配色失真 | 视觉回归 | 阶段 2 逐套目检，保留 4 套主题的色值语义 |
| `--pele-font` 与测量字体不一致 | 标签溢出节点 | 阶段 1 强制两者同源，并加一条浏览器验证页断言 |
| 数学公式回归 | 用 `$$` 的用户看到 TeX 源码 | 阶段 4 接 katex，或至少在 CHANGELOG 声明 |
| 回退成本 | 已发布的破坏性变更难收回 | 阶段 1 全程保留旧实现可切换，直到阶段 5 才删 |

回退策略：阶段 1–4 期间 `src/renderer.ts` 里同时保留 `mermaidEngine` 与 `peleEngine` 两个实现，
用一个内部开关切换；只有阶段 5 发版时才删除旧实现。这样任何阶段发现问题都能一行切回。

---

## 10. 待观测（本文写作时还无法确认的）

- **Obsidian 1.15 正式版的 asar**：目前只有 changelog，1.15 的 `obsidian-1.15.x.asar` 尚未发布。
  拿到后要用 `scripts/scan-asar.mjs` 重核这几条：
  - 实时预览的代码块部件选择器是否仍是 `.cm-embed-block.cm-lang-mermaid`。
  - 官方 Pele 渲染出来的 DOM 结构（我们靠隐藏官方输出来接管，结构变了规则要跟着变）。
  - `mermaid-vault-trust` 与「Show Mermaid diagrams」闸门是否真的完全消失。
  - `docViewUpdate` 钩子是否还在（滚动抖动那条经验的依据）。
- **官方 Pele 与 npm Pele 的版本差**：1.14.5 里是 1.8.0，npm 已到 1.9.0。官方那份不对外暴露，
  所以插件仍要自带。
- **Pele 后续是否补上布局引擎选择 / 形状配置**：如果上游加了，本文第 4.2 的几条破坏性结论要重估。
- **Pele 的 `themeVariables` 支持**：当前完全不支持。若上游后续加了兼容层，主题重做可以省掉。

---

## 附录 A：复核命令

体积：

```sh
# 当前产物
gzip -c main.js | wc -c
# pele 全量 / 仅 flowchart（在装了 pele 的临时目录里）
npx esbuild entry-all.ts --bundle --format=cjs --minify --target=es2018 --platform=browser --outfile=pele-all.js
npx esbuild entry-core.ts --bundle --format=cjs --minify --target=es2018 --platform=browser --outfile=pele-fc.js
```

行为探针（Node 里直接跑，Pele 无 DOM 依赖）：

```js
import { render } from 'pele';
render('flowchart LR\n A-->B');                              // 基本
render('%%{init:{"themeVariables":{"primaryColor":"#f00"}}}%%\nflowchart LR\n A-->B');  // 主题变量不生效
render('%%{init:{"layout":"elk"}}%%\nflowchart LR\n A-->B');  // 与 dagre 逐字节相同
render('flowchart LR\n X{判断}', { fontSize: 20 });           // 菱形 1.6、fontSize 生效
```

语料回归（本文 3.3 的做法）：从 vault 抽出全部 ```` ```mermaid ```` 块，逐块 `render()` 并统计失败。

本机 asar 交叉验证：

```sh
node scripts/scan-asar.mjs "$APPDATA/obsidian/obsidian-1.14.5.asar" "pele.min.js" "mermaid.min.js"
```

官方 changelog（1.15 的 Pele 声明）：`https://obsidian.md/changelog/2026-10-22-desktop-v1.15.0/`

---

## 附录 B：本文未重复的既有结论

- mermaid 12 的配置语义（`look` / `minNodeWidth` / `wrappingWidth` / `themeVariables` 白名单）、
  形状表逆向结论、`getBBox()` 约定：见 [obsidian-internals.md](obsidian-internals.md)。
  这些结论在切到 Pele 后**全部失去适用对象**，但保留作为「为什么要换」的证据链。
- 接管时机（`docViewUpdate`）、信任门、官方输出隐藏策略：见 [obsidian-internals.md](obsidian-internals.md)。
- 复审 / 发版流程与硬门禁：见 [AGENTS.md](../AGENTS.md) 与
  [.agents/skills/obsidian-plugin-release/SKILL.md](../.agents/skills/obsidian-plugin-release/SKILL.md)。
