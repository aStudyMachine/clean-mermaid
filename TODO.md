# TODO

滚动删除：完成一项即删一行，不留历史。

1. [ ] 跟进 community.obsidian.md 的下一轮自动复审（0.1.2 → 0.1.3 这轮已整改完）。发新 Release 必须同时
   抬 `manifest.json` 的 `version`，且 `manifest.json` 要合到默认分支 —— 目录读的是默认分支 HEAD。
   三条「不修」的理由只记在本条，**不要写进 `CHANGELOG.md` 或 GitHub Release 说明**：main.js 为
   5.115 MiB、只超额 2.3%，是自带 mermaid 12 运行时的必然结果（要压进去只能裁图表类型，代价是失去与
   原生渲染的一致性）；`@codemirror/view` 在 `esbuild.config.mjs` 的 `external` 里、运行时由 Obsidian
   提供，列进 dependencies 只会多一个版本锁定；剪贴板访问就是「复制为 PNG / SVG」功能本身
2. [ ] 设置面板迁移到声明式 `getSettingDefinitions()`：`src/settings.ts` 708 行、29 个 `new Setting(`。
   它和复审里「用 `update()` 代替 `display()`」「`display()` 已废弃」三条同源，**只能整体迁移** ——
   `update()` 只缓存声明式定义，在返回空定义时不会重绘命令式面板，半改会让语言切换与主题增删后的
   面板刷新失效。迁移时要一并保住 `plugin.t()` 的双语重建
3. [ ] 把出包搬进 GitHub Actions 并给 release 资产签 artifact attestation：现在 `ci.yml` 只有
   test-and-build，Release 是手动的所以签不了。复现构建已经能 byte-for-byte 对上，缺的只是 release job
4. [ ] mermaid 上游把 katex 抬到 `>=0.18.2` 之后再跟进（现在 `^0.16.47` 与公告区间无交集，只能靠
   `overrides`）；跟进前先给 `tests/browser/` 补数学渲染用例，否则换完无从判定有没有坏
5. [ ] `.cm-media` 与 CodeMirror 内置类名撞车：改名后试摘 `styles.css:45/46/287/288` 的 `!important`
   （:170/:175/:185 那三处对抗官方输出、可能带内联样式，摘不掉）。动手前先在真机 devtools 确认
   被哪条规则压住
6. [ ] 可选：issue 模板配 `config.yml`、设置面板增加更多语言（界面文案已全部走 `plugin.t`）
