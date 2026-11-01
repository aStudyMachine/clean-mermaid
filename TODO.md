# TODO

滚动删除：完成一项即删一行，不留历史。

1. [ ] **复审长期「不修」项**（0.1.10 复审 Completed、无 Error，只剩下面三条；理由只记在这里，
   别写进 `CHANGELOG.md` 或 Release 说明）：
   - main.js 超 5 MiB（0.1.10 为 5,370,586 B ≈ 5.12 MiB）：自带 mermaid 12 运行时的必然结果，要压进去只能裁
     图表类型、代价是失去与原生渲染的一致性；
   - `styles.css` 仅剩 2 处 `!important`（`.cm-core-hidden` 与 live-guard 守卫规则）：对抗官方异步追加、
     可能带内联样式的输出，摘掉会官方图与卡片同显；
   - 剪贴板访问：就是「复制为 PNG / SVG」功能本身。
2. [ ] `package-lock.json` 的 `resolved` 除 katex、dompurify 与 `@codemirror/*` 相关条目已换回
   `registry.npmjs.org` 外，其余仍指向 `registry.npmmirror.com`，发布链路因此依赖这个第三方镜像的
   可用性。等某次装包自然重生成 lock 时统一换回官方源，不要为它单独刷一次大 diff。
3. [ ] 可选：mermaid 上游自抬 katex 到 `>=0.18.2` 后，摘掉 `package.json` 的 `overrides`
   （现状：mermaid 12.1.0 仍声明 `^0.16.47`，override 仍必要）。
4. [ ] 可选：issue 模板配 `config.yml`；设置面板增加更多语言（界面文案已全部走 `plugin.t`）。
5. [ ] **Pele 迁移**：调研与实测数据见 [docs/pele-migration.md](docs/pele-migration.md)，阶段 0（抽薄接口）
   已完成。待办：① 升级 Obsidian 后先跑 `npm run verify:takeover` 复核接管侧清单，Pele 专有项
   （`lib/pele.min.js` 是否启用、渲染入口）仍按文档第 10 节另核；② 第 8 节 6 个决策点需维护者拍板后
   才进阶段 1。
