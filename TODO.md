# TODO

滚动删除：完成一项即删一行，不留历史。

1. [ ] 实测确认实时预览接管：编辑视图里 mermaid 渲染为卡片（右上角 `⋯` / `⤢`），阅读视图正常；
   若有问题看控制台 `[clean-mermaid]` 开头的输出。未信任 vault 时不接管属预期行为
2. [ ] CI：GitHub Actions 跑 `npm run build`，让 PR 自动做类型检查 + 构建校验
3. [ ] 社区插件市场上架自查：按官方 checklist 逐项核对（`manifest.json` 的 `authorUrl` 目前是占位符）
4. [ ] 可选：issue 模板配 `config.yml`、设置面板增加更多语言（界面文案已全部走 `plugin.t`）
