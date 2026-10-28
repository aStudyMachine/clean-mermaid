# TODO

滚动删除：完成一项即删一行，不留历史。

1. [ ] 0.1.9（commit `7c3bc96`，2026-10-27）正式复审已 Completed、无 Error；5 条 Warning 分别是
   main.js 超 5 MiB、styles.css 两处 `!important`、`prefer-create-el` 误报、`@codemirror/view`
   未声明、dompurify 漏洞公告；2 条 Recommendation 为剪贴板访问与 localStorage。**工作区已处理、
   待发版**：dompurify 升到 3.4.17（mermaid 的 `^3.4.12` 本就允许，无需 overrides）、
   `@codemirror/view` 按 Obsidian peer 版本 6.38.6 声明为 dependencies、`src/hints.ts` 改用
   `app.loadLocalStorage/saveLocalStorage`（仍是本机教学状态、不进 data.json，理由见
   [ADR 0002](docs/adr/0002-teaching-hints-for-discoverability.md)）、`prefer-create-el` 那条把
   `createEl("div")` 改成等价的 `createDiv` 再试一次（新版复审仍报就按误报止损）。`Build verification` 的
   main.js 字节级复现与两项 attestation 均 Pass。发布提交的 branch 预览 Completed、无 Error；
   dry-run 与正式发布均成功，本机 / CI / Release 三个产物的 sha256 逐项一致
   （`d9c6eb34` / `e931cba7` / `682bad8c`）。
   0.1.8（commit `7e410be`，2026-10-19）正式复审已 Completed、无 Error；4 条 Warning
   均为下述既有「不修」项，Recommendation 只剩剪贴板访问（`mermaidAPI` 弃用已消失）；
   两项产物 attestation、依赖漏洞检查与 main.js 字节级构建复现均 Pass。发布提交的 branch
   预览 Completed、无 Error；dry-run 与正式发布均成功，本机 / CI / Release 三个产物的
   sha256 逐项一致。
   0.1.7（commit `88a01a5`，2026-10-13）正式复审已 Completed、无 Error；4 条 Warning
   均为下述既有「不修」项，2 条 Recommendation 分别为剪贴板访问与 `mermaidAPI` 弃用；
   后者已改为读取 mermaid 随本次渲染传入的 `renderOptions.config.theme`
   （`src/mermaid-runtime.ts`），compact / native / plain 三种门控已在浏览器验证页复核，
   下一版预期不再报。两项产物 attestation、依赖漏洞检查与 main.js 字节级构建复现均 Pass。发布提交的 branch
   预览 Completed、无 Error；dry-run 与正式发布均成功，本机 / CI / Release 三个产物的
   sha256 逐项一致。维护者已确认真实库判断节点与自定义主题布局（空列表 / 已有条目）目检通过。
   0.1.6
   （commit `4e06ad4`，2026-10-12）自动复审状态 Completed、无 Error；4 条 Warning 与 1 条
   Recommendation 均属于本条记录的「不修」项。attestation、依赖漏洞检查与 main.js 字节级构建复现均 Pass。
   0.1.4 复审
   （6 Warning + 1 Recommendation）的整改已随 0.1.5 发出（main `d8e0324`）。0.1.5 复审新增一条
   **Error 级** `obsidianmd/no-static-styles-assign`（`src/viewer.ts` 查看器把 `left`/`top` 归零写成
   静态字面量赋值），已改用 `modal.setCssStyles({ left: "0px", top: "0px" })`，`5cc7539` 的 branch
   预览扫描确认 Error 消失、状态 Completed，随 0.1.6 发出。同轮 katex 依赖与两条 attestation 转
   Pass、`!important` 由 7 降到 2。已修：`src/settings.ts:151`
   的多余类型断言（删掉后 tsc 通过，复审属实）；`styles.css` 的 `!important` 7 → 2（`.cm-media`
   改名 `.cm-media-image` 并用 `.cm-stage .cm-canvas` 提特异性摘 2 处、`.cm-hidden` 作用域化为
   `.cm-menu/.cm-zoom-badge` 专属规则摘 1 处、`.cm-modal-stage .cm-modal-media` 摘 2 处；竞争规则
   已从 asar 的 app.css 核实：阅读视图 `.markdown-rendered img`、实时预览
   `.markdown-source-view.mod-cm6 img`）；katex 经 `overrides` 升到 0.18.10（GHSA-238p-pmpm-9mq7
   消除；`tests/browser/` 补了数学用例，主题×布局与缓存两套验证页 + 截图目检全绿）。
   复审仍会报的「不修」项与理由只记在本条，**不要写进 `CHANGELOG.md` 或 GitHub Release 说明**：
   main.js 超 5 MiB（本次改动后 5,370,380 B ≈ 5.12 MiB）是自带 mermaid 12 运行时的必然结果，
   要压进去只能裁图表类型、代价是失去与原生渲染的一致性；剪贴板访问就是「复制为 PNG / SVG」
   功能本身；styles.css 仅剩的 2 处 `!important`
   （`.cm-core-hidden` 与 live-guard 守卫规则）对抗官方异步追加、可能带内联样式的输出，行内
   样式只有 `!important` 压得住，摘掉会官方图与卡片同显。
   发新 Release 必须同时抬 `manifest.json` 的 `version`，且 `manifest.json` 要合到默认分支 ——
   目录读的是默认分支 HEAD。
2. [ ] `package-lock.json` 的 `resolved` 除 katex、dompurify 与 `@codemirror/*` 相关条目已
   换回 `registry.npmjs.org` 外，其余仍指向 `registry.npmmirror.com`；`release.yml` 把出包搬进
   CI 之后，发布链路依赖这个第三方镜像的可用性。等某次装包自然重生成 lock 时统一换回官方源，
   不要为它单独刷一次大 diff
3. [ ] 可选：mermaid 上游自抬 katex 到 `>=0.18.2` 后，摘掉 `package.json` 的 `overrides`
4. [ ] 可选：issue 模板配 `config.yml`、设置面板增加更多语言（界面文案已全部走 `plugin.t`）
5. [ ] **Pele 迁移**：调研已完成，方案与实测数据在 [docs/pele-migration.md](docs/pele-migration.md)。
   待办分解：① ~~阶段 0（抽薄接口，不改行为）~~ **已完成**；
   ② 等 Obsidian 1.15 正式版 asar 发布后，用 `scripts/scan-asar.mjs` 重核接管选择器 / 信任门 /
   `docViewUpdate`（文档第 10 节）；③ 第 8 节 6 个决策点需维护者拍板后才进阶段 1。
6. [ ] **下一版待发**（工作区已改完、未提交/未发版）：dompurify 3.4.17、`@codemirror/view`
   6.38.6 声明、hints 改走 `app.loadLocalStorage/saveLocalStorage`、livepreview 的
   `createEl("div")` 改 `createDiv`。发版走硬门禁：抬版本 → Preview 扫描 → dry-run 三方哈希 →
   publish → Check for new releases，并确认新版本复审里 dompurify、localStorage 与
   `@codemirror/view` 三条消失、prefer-create-el 是否仍报（仍报即误报，止损）。
