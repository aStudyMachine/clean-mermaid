# docs/agent-lessons.md — Agent 经验共识

跨会话、跨 agent 的踩坑记录：每条按**二段式**写——「教训」（含根因 / 证据）与「对策」（含验证方式）。
目的是让下一个会话不用重新踩一遍坑，而不是记录「我们做了什么」——做过什么看 git 历史。

维护规则：

- **何时补录**：会话中踩坑、修正了既有认知、或建立了新的可复用验证方式时，agent 主动提议、
  维护者确认后落档（AGENTS.md 护栏有对应条款）。
- **怎么写**：二段式；与既有文档重复的内容**引用而不复制**（见文末「既有结论索引」）；条目要可复核——
  写清当时怎么发现的、以后拿什么命令 / 页面验证。
- **何时删除**：条目所依据的事实变化（如 Obsidian 升级后规则变了、脚本改名了）时更新或删除。

## 复审与发布

### 复审原文只在登录墙后面，公开渠道没有镜像

**教训**：community.obsidian.md 的评审门户要 Obsidian 账号登录，匿名 WebFetch 只会拿到登录页；
obsidian-releases 的 PR / issue 与论坛都搜不到复审记录，而且 GitHub 搜索对这种超大仓库的 PR 索引
不可靠——「搜不到」不代表不存在。0.1.4 复审处置时在公开渠道反复换关键词搜索全部空手而归。

**对策**：要复审原文，直接读维护者已登录的 Chrome（计算机控制读无障碍树，一次可拿全全部 warning），
或让维护者贴原文；不要在公开渠道反复尝试搜索。

### 复审 warning 逐条用权威工具裁决，不凭感觉判误报、也不凭感觉照修

**教训**：同一轮复审里两种情况都出现过——`src/settings.ts:151` 的「断言不必要」是真问题
（删掉后 tsc 照样通过），而 `obsidianmd/prefer-create-el` 报 `src/livepreview.ts:128` 是误报
（该行早已是 `widget.createEl(...)`）。

**对策**：类型断言类先删掉跑 `npm run build` 让 tsc 裁决；lint 规则类先读被标记行确认实际代码。
修得动的修；修不动或属实误报的，在 `TODO.md` 落档「哪一行、为什么、不改写法」。

### 「不修」项只在 TODO 落档，并写明「复审每轮仍会报」

**教训**：bot 复审是静态规则，合理的不修项（对抗内联样式的 `!important`、external 依赖不列
dependencies、剪贴板访问即功能本身）每轮都会原样重报；不落档的话，下个会话会当成新问题重新纠结一遍。

**对策**：维持 `TODO.md` 第 1 条的对账记录（已修 / 不修 + 理由 + 「0.1.4 复审仍在报，维持」），
处置完的 warning 要能在 TODO 里逐条对上；CHANGELOG 与 Release 说明不写这些（护栏已有此边界）。

### bot 的依赖告警只盯会打进 main.js 的运行时依赖

**教训**：katex（随 mermaid 进产物）被报漏洞公告，而 moment、vitest（dev 依赖树里，
`grep -c moment main.js` 为 0）从未被报。

**对策**：看到依赖告警先 `npm ls <pkg>` 查来源、再 `grep -c <pkg> main.js` 确认是否进产物，
据此决定处置路径；dev 依赖的公告不进产物，不在复审处置范围内。

### Error 级把复审打成 Failed 等于插件在市场搜不到，而同版本重发不重算

**教训**：0.1.5 发完点重扫，条目回 `Failed`，根因是查看器改动（`278a5a9`）引入
`obsidianmd/no-static-styles-assign`（Error 级，静态字面量 `modal.style.left = "0px"`）。改完
`setCssStyles` 后删掉 release 与 tag、用同一版本号 `0.1.5` 重打 —— tag 和产物确实换成了新 commit，
但复审条目**仍报修复前的 `src/viewer.ts:373` 与 `:374`**：新 commit 的 373 是 `setCssStyles(...)`、
374 是 `this.clampPan();`，方法调用不可能被这条规则报。维护者实测确认 Failed 期间插件在社区搜索里
搜不到；抬到 `0.1.6` 重新发布后条目才回到 `Completed`。

**对策**：结论按 `version` 缓存，**要重算必须抬版本号**，原地重发是死路。分辨「新算还是缓存」沿用
本篇「行号位移」思路的反向用法：被报行号与改动前完全一致、且该行语句已不属于该规则，就是缓存。
因果与顺序已写进 AGENTS.md「动手前必知的事实」与护栏，这里不重复。

### 代码侧规则本地跑不到，发版前用 `Review branch` 预览扫描挡一道

**教训**：本地没有任何环节会跑 Obsidian 官方 linter —— `npm test` 是纯模块 vitest，
`npm run build` 是 tsc + esbuild。过去把「CI dry-run 通过」当成发版前最后一道，其实它只验产物哈希，
对源码规则一无所知，所以 Error 级只能在发出去之后才被发现。

**对策**：`community.obsidian.md/account/plugins/<id>/review-branch` 填 branch / tag / SHA 跑一次，
不需要 release。实测 `5cc7539` 的预览 = `Completed`、无 Error，与随后 `0.1.6` 正式复审结论一致，
可当前置门禁。**边界**：预览没有 `Releases` 与 `Build verification` 两节，体积、attestation、
byte-for-byte 复现仍要靠 dry-run + 三方 sha256。`release.yml` 另加「代码侧守卫」步骤，把这次三条
已知规则抄成 grep 做硬失败兜底，但它不能替代预览扫描。

### 守卫里的计数要按声明行正则，不能全文 grep

**教训**：给 `!important` 写上限守卫时，`grep -c "!important" styles.css` 得 **7**，会当场误报——
其中 5 处是注释里在解释「为什么这里不用 / 刻意保留」（本仓库惯例：每处保留都写理由，见
`styles.css` 注释与 TODO 第 1 条）。真实声明只有 2 处。

**对策**：按声明行计数 `grep -cE '^[[:space:]]*[a-z-]+[[:space:]]*:.*!important' styles.css`
（当前基线 = 2）。任何「数违规」的守卫写完**先在本地跑一遍确认拿到期望基线**，再进 CI；
否则第一条 run 就红，排查成本比省下的时间高。

## 依赖与构建

### 传递依赖的安全公告：用例先行，再 overrides

**教训**：mermaid 版本锁定时，其传递依赖（katex）的公告区间与锁定版本无交集，只能 npm overrides；
但盲改无法判定数学渲染有没有坏——这正是当初推迟跟进的原因。

**对策**：顺序固定——先给 `tests/browser/render-entry.ts` 补对应渲染用例并确认**基线绿** →
`package.json` 加 `overrides` → 重跑两套验证页 + 截图目检 → 记录 main.js 体积变化。
katex 0.16.47 → 0.18.10 即按此完成，升级前后结果逐字节一致。overrides 重装只允许目标依赖子树
重写 lock，其余 resolved 条目不动（镜像源统一迁移是独立事项，见 TODO）。

## 测试与验证

### tests/browser 验证页不会自动断言，要真开页面读结果

**教训**：`npm run test:browser` 只是构建 + 起静态服务；页面把渲染结果挂在
`window.__cmResults` / `window.__cmCacheResults`，没人打开页面就等于没验证。

**对策**：起服务后打开 `render.html` / `cache.html`，等 `__cmDone` / `__cmCacheDone` 再读结果数组
逐项核对（agent 可用浏览器自动化读取，不必人工）；新增渲染路径的用例同时往 `#out` 追加可视化
图例留作截图比对——katex 数学用例即此做法，换 katex 版本前后靠它目检。

### 样式竞争规则从 asar 取证，不靠 devtools 盲猜

**教训**：摘 `!important` 前需要知道是谁压住了谁；devtools 人工翻查慢且结论不可复核。

**对策**：`node scripts/scan-asar.mjs "<选择器片段>"` 直接从 app.css 拿权威规则与特异性。
2026-10 结论留档（Obsidian 1.14.4，升级后需重跑）：阅读视图 `.markdown-rendered img`（0,1,1）、
实时预览 `.markdown-source-view.mod-cm6 img`（0,2,1）、Modal 无 img 规则——据此用 ≥(0,3,0) /
(0,2,0) 的自有选择器压制，`!important` 从 7 处降到 2 处（仅剩对抗官方内联输出的两处，styles.css
注释已标明）。

## 流程协作

### 人工验收步骤可用自动化取证替代，但必须明示偏差

**教训**：计划里「真机 devtools 确认」这类步骤，自动化会话做不到或代价极高；默默替换会让维护者
以为计划被原样执行了。

**对策**：替换时选更权威、可复核的手段（如上面的 asar 取证），并在完成报告的「与计划的偏差」一节
明说；真机部分整理成手动验收清单留给维护者。

### 部署边界：只有主要验收库是既定的，换库先问

**教训**：`.local/.env` 的次要验收库标着「未指定……换库前先问」——它不是可自行决定的选项。

**对策**：`npm run deploy -- My-Resume` 之外的任何库（包括临时想找个深色库验外观）先问维护者。

### `.env` 键名避开系统预留环境变量，写完用 `node --env-file` 冒烟验证

**教训**：2026-10-11 把 `.local/env.md` 迁移成 `.local/.env` 时，`OS` 键撞上 Windows 系统预留变量
`OS=Windows_NT`：`node --env-file` 对进程里已存在的变量**不覆盖**（官方语义：环境优先于文件），
读到的会是系统值而非文件值，且全程无报错。这类冲突静默发生，人眼扫键名不可靠。

**对策**：键名用具体前缀名词（`HOST_OS` 而非 `OS`），避开 `OS` / `PATH` / `USER` 等系统预留名；
交付前用 `node --env-file=<文件> -e "…"` 逐键断言非空（Node ≥ 20.6）——本次靠这一步当场抓到
`OS` 被吞。

## 既有结论索引（引用，不在这里重复维护）

- 动渲染接管路径、`docViewUpdate` 时序、`look: "classic"` 等逆向结论 →
  [docs/obsidian-internals.md](obsidian-internals.md)
- 壳版本 ≠ 实际运行版本、asar 一律以 Roaming 加载的那份为准 →
  AGENTS.md「动手前必知的事实」与 `.local/.env`（`scripts/obsidian-asar.mjs` 已做防呆校验）
- main.js ~5.1 MiB 的取舍与全部复审「不修」理由 → `TODO.md` 第 1 条
- mermaid 版本锁定与升级验证清单、i18n 文案、`cm-` 命名空间 → AGENTS.md 护栏
