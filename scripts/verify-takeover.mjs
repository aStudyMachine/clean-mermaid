// 仅开发期用：把「接管依赖的 Obsidian 侧事实」逐条断言一遍，升级 Obsidian 后先跑它。
//
// 与 scripts/scan-asar.mjs 的分工：那个按任意关键词检索、给人看上下文；这个是一份固定的断言清单，
// 对应 docs/obsidian-internals.md 里每条结论，直接给 PASS/FAIL，用来判断「升级后结论是否仍成立、
// 要不要改接管」。任一项 FAIL 都说明文档某条结论作废，先重新检索再动代码。
//
// 用法：node scripts/verify-takeover.mjs [<obsidian.asar>] [--allow-stale]
// 不传路径时自动取本机**实际运行**的那份；传了比它旧的会拦下来（原因见 scripts/obsidian-asar.mjs）。
import { openAsar, parseFlags } from "./obsidian-asar.mjs";

const USAGE = "node scripts/verify-takeover.mjs [\"<obsidian.asar>\"] [--allow-stale]";

/** [说明, 断言用到的稳定片段（必须是 asar 里的原样字节，别写会被 minify 改掉的写法）] */
const CHECKS = [
	// —— 阅读视图接管
	["阅读视图：官方按 code.language-mermaid 扫描", ['findAll("code.language-mermaid")']],
	["代码块处理器把 <pre> 换成 div.block-language-<lang>", ['createDiv("block-language-"+e)']],
	["同语言重复注册抛异常（main.ts 保留 try/catch 的依据）", ["Code block postprocessor for language "]],
	["sortOrder 生效：postProcessors 升序排序（-100 因此排在官方之前）", ["(e.sortOrder||0)-(t.sortOrder||0)"]],
	// —— 实时预览接管
	["部件类名由 cm-lang-<lang> 拼出（WIDGET_SELECTOR 仍匹配）", ['markdown-rendered cm-lang-"+a)']],
	["mermaid 在部件里被硬编码直调，注册表查不到", ['"mermaid"===a']],
	["canRenderLang 对 mermaid 恒真", ['"mermaid"===e||"query"===e']],
	["官方输出容器是 div.mermaid", ['createDiv("mermaid")']],
	["悬浮操作条 .embed-actions", ["embed-actions"]],
	// —— 镜像信任门
	["信任键 mermaid-vault-trust", ['"mermaid-vault-trust"']],
	["未信任守卫 mermaid-wrapper is-guarded", ['createDiv("mermaid-wrapper is-guarded")']],
	// —— 同帧接管
	["CodeMirror measure() 调 docViewUpdate", ["this.docViewUpdate()"]],
	["docViewUpdate 派发到 view 插件上同名方法", ["n.docViewUpdate"]],
	// —— 样式竞争（styles.css 里提特异性的依据）
	["阅读视图 img 规则 .markdown-rendered img", [".markdown-rendered img"]],
	["实时预览 img 规则 .markdown-source-view.mod-cm6 img", [".markdown-source-view.mod-cm6 img"]],
	// —— 主题 / 模态框
	["深色类挂在 body 上", ["body.theme-dark"]],
	["modal 背景取 --modal-background", ["background-color: var(--modal-background)"]],
	["遮罩色 --background-modifier-cover", ["--background-modifier-cover:"]],
	// —— 阅读视图的图片灯箱（imageify / plain 的 <img> 会被它劫走）
	["灯箱黑底 --lightbox-background", ["--lightbox-background: black"]],
	["灯箱容器 lightbox-bg", ['createDiv("lightbox-bg")']],
	["灯箱让路口 defaultPrevented", ["defaultPrevented"]],
	["灯箱委托选择器 img,video", ['t.on("click","img,video",s)']],
	// —— 运行时
	["内置 mermaid 11.13.0", ["mermaid@11.13.0"]],
	["分发 lib/pele.min.js（Pele 迁移的启动信号）", ["pele.min.js"]],
];

const { allowStale, positional } = parseFlags(process.argv.slice(2));
const given = positional[0]?.toLowerCase().endsWith(".asar") ? positional[0] : undefined;
const { path: asarPath, version, buffer } = openAsar(given, { allowStale, usage: USAGE });
const text = buffer.toString("latin1");

console.log(`asar: ${asarPath}`);
console.log(`Obsidian 版本: ${version} | bytes: ${buffer.length}\n`);

let failed = 0;
for (const [name, needles] of CHECKS) {
	const counts = needles.map((needle) => text.split(needle).length - 1);
	const ok = counts.every((count) => count > 0);
	if (!ok) {
		failed++;
	}
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}  [${counts.join(", ")}]`);
}

console.log(
	failed === 0
		? `\n全部通过（${CHECKS.length} 项）：docs/obsidian-internals.md 的结论在本版本上仍成立。`
		: `\n失败 ${failed} 项：先按 docs/obsidian-internals.md 重新检索这些片段，再决定怎么改接管。`,
);
process.exitCode = failed === 0 ? 0 : 1;
