---
name: obsidian-plugin-release
description: Obsidian 社区插件的「复审整改 → 抬版本 → 出包 → 触发目录重扫」全流程。当用户要求处理 community.obsidian.md 的自动复审结果、发布新版本、同步 manifest.json / package.json / versions.json / package-lock 版本、跑 release workflow 的 dry-run 与产物 sha256 比对、发版后让社区目录重新扫描，或排障「gh 触发 workflow 报 403」「Build verification 掉出 Pass」「Release 资产缺 attestation」时使用。适用于任意已上架 Obsidian 社区目录的插件仓库。
---

# Obsidian 插件发版与复审整改

## Overview

三段链路，顺序不可调换：**读复审报告 → 整改并抬版本 → CI 出包并让目录重扫**。

贯穿全局的不变量：**审核方的 Build verification（byte-for-byte 复现 release 的 `main.js`）是可信度资产，优先级高于「多消几条 Warning」**。任何让复现构建变得更不可靠的改动（漏同步 lock、把出包搬进 CI 却没比对哈希、手改 lock）都要先证明 parity 再发布。

占位符约定：`<owner>/<repo>` 为 GitHub 仓库、`<plugin-id>` 为 `manifest.json` 的 `id`、`<ver>` 为裸版本号（本流程假定 tag 无 `v` 前缀，与社区目录惯例一致）。

## 硬约束（先记住这五条，违反必然返工）

1. **`workflow_dispatch` 只有当 workflow 文件存在于默认分支时才能触发**（触发时可在下拉里选别的 ref）。所以「先把 release workflow 合到默认分支」是跑 dry-run 的前置条件，不是可选项。
2. **发新 Release 必须同时抬 `manifest.json` 的 `version`，且该文件要合到默认分支** —— 目录读默认分支 HEAD。
3. **发布后必须手动点「Check for new releases」，否则目录不会重扫。** 没有自动 webhook。
4. **复审是自动扫描，不是用户评价**，条目分 Warning / Recommendation / **Error** 三档。Warning 的多少不影响 listing 可用；但**出现 Error 级会把整次 release 复审打成 `Failed`，插件因此在社区目录搜不到**（维护者实测），且只有**发新版本**才能恢复。
5. **代码侧规则必须在发版前拿到结论**：本地跑不到 Obsidian 官方 linter（`npm test` / `npm run build` 都不含它），而 Failed 的唯一出路是再发一版 —— 事后补救的代价是「一次完整发版周期 + 中间一段搜不到」。用 `Review branch` 预览扫描前置（第 3 节）。

## 1. 读社区复审报告

- 地址：`https://community.obsidian.md/account/plugins/<plugin-id>`。该页需登录态，**只能走用户浏览器**（browser-use 类 MCP 工具）；`WebFetch` 取不到内容，不要浪费一次调用。
- 调用浏览器工具前先取该工具的入参 schema；参数校验很严，多余字段会直接被拒。
- 报告锚定「默认分支 HEAD + 最新 Release」这一次快照。**含义**：小步多次发版不会让复审更好，攒成一次发版更省事。
- 条目分 **Warning** 与 **Recommendation** 两组，按「规则名 + 指向的 `file:line`」成组列出。逐条抄成本地可核对的清单，再对每条跑一次 `git grep -n` 定位真实位置。
- **判定「它扫的是新代码还是缓存」用行号位移，不要用直觉**。实例：某轮删掉两处 `setDynamicTooltip()` 后，同一次扫描里另一文件的告警行号整体 `-2`，说明扫描器确实重跑了新代码。若某条已修但仍被报，先按行号位移确认它读的是哪份代码，再怀疑缓存。
- **同一判据的反向用法**：改动前后被报的行号**一模一样**、且该行现在的语句根本不属于这条规则（例：`src/viewer.ts:373` 已是 `setCssStyles(...)`、`:374` 是 `this.clampPan();`），说明结论来自缓存、没重算。这时别再改代码，先确认是不是在同版本号上打转 —— release 复审结论按 `version` 缓存，**必须抬版本号才会重算**。
- **先读条目 summary 的状态词**：`Completed` / `Pending` / `Failed`。账号页顶部出现 "The latest release of this entry failed one or more automated checks" 就是 Failed 态；`Pending` 时正文会带 "These results are incomplete. More checks are still running."，此时读到的缺项（尤其 `Build verification`）不代表失败。
- 人工提交审核的意见在 `obsidian-releases` 仓库的 PR 里，**不在这份报告中**。要人工意见就单独去取，别假装报告里有。
- 已经 Pass 的项要列进「本轮必须守住」清单，最常见的是 `Build verification`。

### 修 / 不修的判定

每条给一个结论加**量化理由**（体积超额给到 KiB 与百分比、误报给到证据行号）。典型不修类别：

- 产品底座必然结果（插件自带渲染运行时导致产物体积超额）；
- 误报（依赖在 `esbuild` 的 `external` 里、运行时由宿主提供，补进 `dependencies` 反而引入版本错锁）；
- 功能本身（剪贴板访问就是「复制为图片」这个特性）；
- 上游无合法解（安全公告要求的版本区间与该依赖声明的区间**无交集**，只能靠 `overrides` 破坏依赖契约，且本地没有能判定「换完没坏」的测试用例）。

对「同一个根因的三组标记」，要么整批迁移要么整批保留 —— 半迁移通常无效。典型例子：`display()` → `update()` 在没有声明式设置定义时不会重绘面板，因为 `update()` 只服务于 `getSettingDefinitions()` 那条路径。

**止损点**：同一行改了两次仍被报，就此打住，登记「规则仍报另一种写法，属误报」，不要继续猜规则想要什么形式。

## 2. 抬版本：四处同步

| 文件 | 改什么 | 注意 |
|---|---|---|
| `manifest.json` | `version` | 目录与审核方读的就是它；`minAppVersion` 是另一个字段 |
| `package.json` | `version` | 与 manifest 保持一致 |
| `versions.json` | 新增 `"<ver>": "<minAppVersion>"` | 键是插件版本、值是所需 Obsidian 最低版本；漏加会让旧版用户拿不到更新 |
| `package-lock.json` | 两处 `version`（根与 `packages[""]`） | **由 `npm install` 写入，绝不手改** |

- 只要动过依赖（尤其删/加 `devDependencies`），**必须 `npm install` 重新生成 lock，再跑一次 `npm ci` 确认 parity**。残留的 lock 条目会让审核方的复现构建环境与本地不一致，直接把 Build verification 打下去。
- 有用的事实：**插件版本号不进打包产物**（抬 `version` 后 `main.js` 字节不变，可 grep 旧版本号确认）。这条可当归因基线 —— 若抬版本后 `main.js` 哈希变了，一定是别的原因。
- `CHANGELOG.md` 与 GitHub Release 说明**只写变更内容**（新增 / 修复 / 变更 / 兼容性）。「本轮不修的项及其理由」「跑过的验证过程」留在仓库待办，不要塞进发布物：在一个没有用户可见变化的补丁版发布说明里放三十行内部申辩，读者只会困惑。

## 3. 出包：CI + dry-run 先行

### workflow 设计

- 触发方式用 `workflow_dispatch` 手动，**不要用 tag 自动触发** —— 误推一个 tag 就直接发布到社区目录，代价不对称。
- 输入项三个：`version`（必填）、`notes`（可留空，双语正文之后到 GitHub 上补）、**`publish` 布尔开关且默认 `false`**。没有这个开关就没法安全地「只构建打印哈希」。
- 权限按步骤分粒度：整体 `contents: read`，只在发布 job 上开 `contents: write` + `id-token: write` + `attestations: write`。
- `if: ${{ inputs.publish }}` 要挂在**各个发布步骤**上，不要挂在 job 级 —— 挂 job 级会让 dry-run 直接跳过构建，比对哈希这一步就没数据了。
- 加一个「校验版本三处一致」步骤：读 `manifest.json` / `package.json` / `versions.json`，与 `inputs.version` 不符就 `exit 1`。再加一个「发布前检查分支」步骤，非默认分支拒绝 publish。
- 构建链路照 CI 常规：`npm ci` → `npm test` → `npm run build` → `sha256sum main.js manifest.json styles.css`。
- **签名必须与构建在同一个 workflow、同一个 job**，build provenance 依赖当次产出的工件；跨 workflow 签不了。
- 用 `actions/attest@v4` 签 `main.js` 与 `styles.css`（`subject-path` 多行）。**动手前先查最新版**（`gh release list -R actions/attest --limit 3`）：v4 起 `actions/attest-build-provenance` 只是 `actions/attest` 的包装，官方建议新实现直接用后者；凭记忆写 `@v2` 会直接用错。

### 发布顺序

1. 抬版本 + 同步 lock，一次 chore 提交；本地 `npm test` + `npm run build` 通过，记下本机三个产物的 sha256 作为基准。
2. 推开发分支。
3. **对含改动的 commit 跑 `Review branch` 预览扫描**：`https://community.obsidian.md/account/plugins/<plugin-id>/review-branch`，输入框填 branch / tag / 完整 SHA（留空 = 默认分支），点 `Run preview scan`，等条目从 `Pending` 变 `Completed`，**正文里没有 Error 级才继续**。预览覆盖代码侧（Source code / CSS lint / Behavior / Dependencies），**但不含 `Releases` 与 `Build verification` 两节**（它没有 release 资产可比），所以产物侧结论仍要靠第 6 步的三方哈希。
4. 合到默认分支并推送 —— **这一步同时让 workflow 变得可触发**。
5. 触发 **dry-run**（不勾 `publish`），等它成功。
6. **三方 sha256 比对**：本机基准 / CI 日志里「产物哈希」步骤 / release 资产的 digest。三者逐一相同才继续；**不同就停下来上报，不要放宽成「差不多就行」**。
7. 再触发一次 `publish=true` 建 Release 并签名。
8. 补中英双语 Release 说明（workflow 的 `notes` 只吃单行，留空时是占位句）。
9. 到社区目录点「Check for new releases」，并**等该 version 的条目回到 `Completed` 才算发完**（见第 6 节）。

> **窗口风险**：第 4 步到第 7 步之间，默认分支的 `manifest.json` 已经写新版本、而最新 Release 还是旧版本。目录读的是默认分支 manifest，所以**别把这两步隔一夜**。

## 4. gh 的实测坑

每条都真实发生过，按字面抄命令会踩：

- **`gh release view --json` 没有 `isLatest` 字段**。可用字段（实测列表）：`apiUrl assets author body createdAt databaseId id isDraft isImmutable isPrerelease name publishedAt tagName tarballUrl targetCommitish uploadUrl url zipballUrl`。要判断「最新」就用 `isDraft`/`isPrerelease` + `publishedAt`，或 `gh release list` 的首行。
- **`gh attestation verify` 的 `--owner` 与 `--repo` 互斥**：同时给会报 `if any flags in the group [owner repo] are set none of the others can be`。只给 `--owner <owner>`。
- **`gh attestation verify` 的空输出不可信**。管道后 `echo exit=$?` 拿到的是 `tail` 的退出码，不是 gh 的。消费端验签证不了时，改从 workflow 日志取证：`gh run view <run-id> --log` 里应有一行 **`Attestation created for N subjects`**，并确认签名证书来自预期的 Sigstore 实例。
- **`gh workflow run` 返回 `HTTP 403: Resource not accessible by integration`**：这里的 *integration* 指 GitHub App。真实原因是 gh 挂在一个 App 的 user-to-server 令牌上（前缀 `ghu_`），而**该 App 安装没有被授予 Actions 写权限** —— 与 workflow 文件本身无关，同一次检查里 workflow 已注册为 active 就是旁证。
  - 令牌类型靠前缀认：`ghu_` = GitHub App user-to-server；`github_pat_` = 细粒度 PAT；`ghp_` = classic。**「响应里没有 `X-OAuth-Scopes` 头」不能用来判定细粒度 PAT** —— App 令牌同样没有这个头，据此推断会得出错原因。
  - **不要 `gh auth login` 重新登录**：那会覆盖现有凭据，可能连带弄坏依赖这个 App 授权的其他工具。
  - 三条出路，按侵入门禁排：① 什么都不改，触发走浏览器（第 5 节）；② 在 `github.com/settings/installations` 找到该 App 安装 → Installation settings → Repository permissions → Actions 设为 Read and write（前提是这个安装归你管；IDE 集成自动装的可能会改不动或被下次同步覆盖）；③ 建一个只含目标仓库、只给 Actions: Read and write 的细粒度 PAT，用 `GH_TOKEN=<pat> gh workflow run ...` 只作用于这一条命令，不动现有登录态。

## 5. 403 之后：用浏览器触发 workflow

打开 `https://github.com/<owner>/<repo>/actions/workflows/<workflow-file>` 后：

1. **「Run workflow」按钮是个 `<summary>` 折叠控件，可访问性树里不暴露**。先枚举 DOM 找它（实测文本形如 `Run workflow <summary class=primary btn-sm btn>`），用脚本 `click()` 并确认父 `<details>` 的 `open === true`。
2. **表单是懒渲染的**：`dialog` 打开前枚举 `input` 只会拿到空数组。所以分两步 —— 先只点开，**下一步再**枚举字段；不要在同一个脚本里「点开 + 填 + 提交」。
3. 字段命名规律：文本输入是 `inputs[version]` / `inputs[notes]`（`id` 为 `input_0`、`input_1`…），分支是隐藏项 `branch`，workflow 是隐藏项 `workflow`。**布尔输入成对出现**：一个 `type=hidden` 的 `inputs[publish]`（默认 `value="false"`）加一个同名 `type=checkbox`。只勾 checkbox 不够，**提交时真正生效的是 hidden 项的值** —— 勾完要把 hidden 也置为 `true`。
4. **提交前读一遍将要发送的实际值**（各字段的 `value` / `checked`，等价于 FormData），核对 `branch`、`workflow`、每个 `inputs[...]` 都对，再 `submit()`。这一步是唯一的拦截点。
5. 提交后回 CLI 确认（读权限通常还在）：`gh run list --workflow <workflow-file> --limit 1` 应出现 `workflow_dispatch` 事件，再 `gh run watch <run-id>` 等结论。

## 6. 发完之后：让社区目录重扫

- 回到 `https://community.obsidian.md/account/plugins/<plugin-id>`，点 **「Check for new releases」**。**不点就不会重扫** —— 发 GitHub Release 本身不会通知目录。
- **发版完成的定义是「该 version 的条目回到 `Completed`」，不是「点了重扫」**。留在 `Failed` 就意味着插件在社区搜索里搜不到，而除账号页顶部那行横幅外没有任何告警。条目会先 `Pending`（正文带 "These results are incomplete. More checks are still running."），实测一到两分钟内转 `Completed`。
- **同版本号重发是死路**：release 复审结论按 `version` 缓存，即使删掉 release 与 tag、用 CI 重建并把 tag 换到新 commit，条目回来时仍带着修复前的行号与旧结论。要重算**必须抬版本号**。
- 页面只 hydrate 出导航栏时（反复重载也白等），改用同源取载荷：在页面里 `fetch('/account/plugins/<plugin-id>')` → `DOMParser().parseFromString(html,'text/html')` → 读 `details summary` 与 `details` 正文。该站是 Next.js RSC，数据在 flight 载荷里，**没有可直取的 JSON 接口**。
- 点了之后页面通常长期停在 `Checking for releases…`，这是排队中的正常态，不是失败。若连载荷都读不到，如实报告 ——「扫描请求已发出，未能亲眼确认排队」，并建议用户过几分钟自己刷一次。**不要连续敲同一页面**，也不要据此宣称「已触发重扫」。
- 下一轮复审报告出来后再回到第 1 节，重点核对上一轮「改了但仍在报」的那几条和必须守住的 Pass 项。

## 7. 收尾核对清单

- [ ] `manifest.json` / `package.json` / `versions.json` / `package-lock.json` 四处版本一致，lock 由 `npm install` 生成
- [ ] 动过依赖则 `npm ci` 已验 parity
- [ ] 发版前对目标 commit 跑过 branch 预览，正文**无 Error 级**
- [ ] dry-run 成功，且 CI 产物 sha256 与本机**逐一相同**
- [ ] Release 资产齐（`main.js` / `manifest.json` / `styles.css`），digest 与本机、CI 三方一致
- [ ] 日志出现 `Attestation created for N subjects`
- [ ] Release 说明只含变更内容，双语齐
- [ ] 默认分支与最新 Release 的版本号已收敛（没有停在「manifest 新、Release 旧」的窗口里）
- [ ] 已点「Check for new releases」，并**亲眼确认该 version 条目为 `Completed`**（不是「请求已发出」）
- [ ] 仓库内不出现本机路径、账号名、测试库名；不修项的理由在待办而不是发布物里

## 8. 未验证项与措辞边界

写进本文件但**尚未被证实**的，引用时要带上限定：

- 「`document.createElement` 那条规则要的是挂在父元素上的 `el.createEl(...)`、不认裸全局调用」是基于一次行号位移证据的**推断**，本地跑不到他们的 linter。改法本身等价（父元素 `createEl` 语义即「创建并追加为该节点的子元素」），但别宣称「规则已确认」。
- 消费端 `gh attestation verify` 是否真能验通，只证到 workflow 日志那一行；跑不通就把这一点标为未证。
- **产物类问题会不会也打成 Error 级，未证实**。已知的 Error 只来自 Source code 规则；`attestation 缺失` 或 `Build verification 不复现` 是否足以让条目变 `Failed`，没有样本 —— 所以「预览 Completed」只保证代码侧干净，不等于正式复审 Completed。
- 预览扫描与正式复审的等价性，目前只有**一个样本**对得上（同一 commit 的预览 = Completed、无 Error，随后该版本的正式复审结论一致）。别把它当已证明的恒等关系。

## 9. 落地位置与升级到用户级的判据

本文件当前是**跨 agent 共用副本**，落点 `.agents/skills/obsidian-plugin-release/SKILL.md`，状态为「单仓库实测通过、未经第二个插件仓库核验」。

- **该落点已纳入版本管理**：`.gitignore` 用 `.agents/*` + `!.agents/skills/` 只放开这一个子目录（整目录 `.agents/` 被排除时，`!.agents/skills/` 是无效的 —— git 不会 descend 进已排除的父目录）。所以本文件**会随仓库公开**，写之前自检一遍：不得含本机路径、账号名、测试库名、凭据前缀之外的授权拓扑细节。
- **本文件只写流程层**。某个仓库自己的硬门禁（CI 里的 grep 守卫、AGENTS 的发版顺序条目）留在该仓库的 workflow 与入口文档里，**不要复制进本文件** —— 两处维护必然分叉。
- **各 agent 的加载目录不同，`.agents/skills/` 不是任何 CLI 的自动注册位置**。Qoder 的项目级 Skill 只从 `.qoder/skills/` 读。要让某个 agent 用上本文件，两种做法：在该 agent 一定读到的入口文档（`AGENTS.md` / `CLAUDE.md` 等）里给一行指针；或在它的加载目录放一个**转发壳**（正文只写「读取并遵循 `.agents/skills/obsidian-plugin-release/SKILL.md`」）。**禁止把正文复制一份过去** —— 两份副本必然分叉。
- 拷贝到新插件仓库时**整目录照搬，不改正文**；若必须改才能用，说明那条事实是仓库专有的，应把它从本文件里**移出**，写进该仓库的 `AGENTS.md` / 待办，而不是在项目级副本上开叉。
- 允许上移到用户级 Skill 目录的条件，三条同时满足：① 至少在**两个**不同插件仓库逐条复现过第 1–7 节；② 第 8 节的未验证项已被证实或被删掉；③ 正文不含任何仓库专有事实（仓库名、workflow 文件名、某个依赖的个案结论）。
- 上移动作应通过产品的 Skill 管理入口做，不在项目目录里长期维护两份分叉。
