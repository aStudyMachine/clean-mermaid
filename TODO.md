# TODO

滚动删除：完成一项即删一行，不留历史。

1. [ ] 跟进 community.obsidian.md 的下一轮自动复审（0.1.2 → 0.1.3 这轮已整改完）。核对上次还报的
   `src/livepreview.ts` 那条 `document.createElement` 是否随 `widget.createEl(...)` 消失；若仍报，
   就在本条下面记一句「该行已是父元素 createEl，规则仍报 createElement，属误报」，不再改写法。
   发新 Release 必须同时抬 `manifest.json` 的 `version`，且 `manifest.json` 要合到默认分支 ——
   目录读的是默认分支 HEAD。三条「不修」的理由只记在本条，**不要写进 `CHANGELOG.md` 或 GitHub
   Release 说明**：main.js 超额（0.1.3 为 5.115 MiB，超 5 MiB 约 2.3%）是自带 mermaid 12 运行时的
   必然结果，要压进去只能裁图表类型、代价是失去与原生渲染的一致性；`@codemirror/view` 在
   `esbuild.config.mjs` 的 `external` 里、运行时由 Obsidian 提供，列进 dependencies 只会多一个版本
   锁定；剪贴板访问就是「复制为 PNG / SVG」功能本身
2. [ ] 0.1.4 发版时补中英双语的 Release 说明：`release.yml` 只接受单行 `notes` 输入，留空时写的是
   占位句，双语正文要在 Release 创建后到 GitHub 上补
3. [ ] mermaid 上游把 katex 抬到 `>=0.18.2` 之后再跟进（现在 `^0.16.47` 与公告区间无交集，只能靠
   `overrides`）；跟进前先给 `tests/browser/` 补数学渲染用例，否则换完无从判定有没有坏
4. [ ] `.cm-media` 与 CodeMirror 内置类名撞车：改名后试摘 `styles.css:45/46/287/288` 的 `!important`
   （:170/:175/:185 那三处对抗官方输出、可能带内联样式，摘不掉）。动手前先在真机 devtools 确认
   被哪条规则压住
5. [ ] `package-lock.json` 的 258 条 `resolved` 全指向 `registry.npmmirror.com`；`release.yml` 把出包
   搬进 CI 之后，发布链路就依赖这个第三方镜像的可用性。等某次装包自然重生成 lock 时统一换回
   `registry.npmjs.org`，不要为它单独刷一次大 diff
6. [ ] 可选：issue 模板配 `config.yml`、设置面板增加更多语言（界面文案已全部走 `plugin.t`）
