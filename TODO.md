# TODO

滚动删除：完成一项即删一行，不留历史。

1. [ ] 跟进下次发版（0.1.5+）后的自动复审：预期 warning 只剩本条记录的「不修」项。0.1.4 复审
   （6 Warning + 1 Recommendation）的整改已随 0.1.5 发出（main `d8e0324`，目录侧已进入 Pending
   扫描）。已修：`src/settings.ts:151`
   的多余类型断言（删掉后 tsc 通过，复审属实）；`styles.css` 的 `!important` 7 → 2（`.cm-media`
   改名 `.cm-media-image` 并用 `.cm-stage .cm-canvas` 提特异性摘 2 处、`.cm-hidden` 作用域化为
   `.cm-menu/.cm-zoom-badge` 专属规则摘 1 处、`.cm-modal-stage .cm-modal-media` 摘 2 处；竞争规则
   已从 asar 的 app.css 核实：阅读视图 `.markdown-rendered img`、实时预览
   `.markdown-source-view.mod-cm6 img`）；katex 经 `overrides` 升到 0.18.10（GHSA-238p-pmpm-9mq7
   消除；`tests/browser/` 补了数学用例，主题×布局与缓存两套验证页 + 截图目检全绿）。
   复审仍会报的「不修」项与理由只记在本条，**不要写进 `CHANGELOG.md` 或 GitHub Release 说明**：
   main.js 超 5 MiB（katex 升级后 5,361,260 B ≈ 5.11 MiB 持平）是自带 mermaid 12 运行时的必然
   结果，要压进去只能裁图表类型、代价是失去与原生渲染的一致性；`@codemirror/view` 在
   `esbuild.config.mjs` 的 `external` 里、运行时由 Obsidian 提供，列进 dependencies 只会多一个
   版本锁定；剪贴板访问就是「复制为 PNG / SVG」功能本身；styles.css 仅剩的 2 处 `!important`
   （`.cm-core-hidden` 与 live-guard 守卫规则）对抗官方异步追加、可能带内联样式的输出，行内
   样式只有 `!important` 压得住，摘掉会官方图与卡片同显；`src/livepreview.ts:128` 仍被
   `obsidianmd/prefer-create-el` 报 `document.createElement` 属误报（该行已是
   `widget.createEl(...)`，0.1.3 起如此），不改写法。
   发新 Release 必须同时抬 `manifest.json` 的 `version`，且 `manifest.json` 要合到默认分支 ——
   目录读的是默认分支 HEAD。
2. [ ] `package-lock.json` 的 `resolved` 除 katex 相关条目已随 overrides 换回
   `registry.npmjs.org` 外，其余仍指向 `registry.npmmirror.com`；`release.yml` 把出包搬进 CI
   之后，发布链路依赖这个第三方镜像的可用性。等某次装包自然重生成 lock 时统一换回官方源，
   不要为它单独刷一次大 diff
3. [ ] 可选：mermaid 上游自抬 katex 到 `>=0.18.2` 后，摘掉 `package.json` 的 `overrides`
4. [ ] 可选：issue 模板配 `config.yml`、设置面板增加更多语言（界面文案已全部走 `plugin.t`）
