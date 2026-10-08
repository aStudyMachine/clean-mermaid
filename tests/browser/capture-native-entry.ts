import { CAPTURE_DIAGRAMS } from "./capture-diagrams";
import { defineCssVar, postJson, rasteriseToPng, showError, sizeSvg } from "./capture-shared";
import { NATIVE_CONFIG, NATIVE_FONT_STACK } from "./native-config";

/**
 * 「原生」一侧：用 Obsidian 自带的那份 mermaid 构建（`obsidian-mermaid.min.js`，由
 * `scripts/extract-obsidian-mermaid.mjs` 从 app.asar 取出）+ 它自己的 `mermaid.initialize` 参数渲染。
 *
 * 两个刻意之处：
 * - **不 import** 插件自带的 `mermaid`，也不用 `src/mermaid-runtime.ts`：那样两侧就是同一个版本、
 *   同一套默认布局（12 起 flowchart 默认已是 ELK），对比图会假性地一模一样。
 * - 该构建以 UMD 方式挂到 `globalThis.mermaid`，所以这里只按用到的方法做最小结构声明。
 */
interface NativeMermaid {
	initialize(config: unknown): void;
	parse(text: string): Promise<unknown>;
	render(id: string, text: string): Promise<{ svg: string }>;
}

const SIDE = "native";

function requireMermaid(): NativeMermaid {
	const candidate = (globalThis as Record<string, unknown>).mermaid as NativeMermaid | undefined;
	if (!candidate) {
		throw new Error(
			"页面里没有 window.mermaid —— 先跑 npm run extract-mermaid \"<obsidian.asar>\" 生成 tests/browser/obsidian-mermaid.min.js",
		);
	}
	return candidate;
}

async function renderOne(mermaid: NativeMermaid, id: string, code: string): Promise<string> {
	await mermaid.parse(code);
	const { svg } = await mermaid.render(id, code);
	// 官方没设 suppressErrorRendering：坏图不抛错，而是给出一张错误图。
	// 只认错误图的属性写法（mermaid 自带的样式表里也有 `.error-text` 这类选择器，不能当标志）。
	if (/class="error-text"/.test(svg)) {
		throw new Error(`#${id} 渲染成了错误图：${svg.slice(0, 200)}`);
	}
	return svg;
}

async function main(): Promise<void> {
	const mermaid = requireMermaid();
	mermaid.initialize(NATIVE_CONFIG);
	document.documentElement.style.setProperty("--font-mermaid", NATIVE_FONT_STACK);

	const summary: { slug: string; width: number; height: number }[] = [];
	let index = 0;

	for (const diagram of CAPTURE_DIAGRAMS) {
		index += 1;
		const raw = await renderOne(mermaid, `n${index}`, diagram.code);
		const sized = defineCssVar(sizeSvg(raw), "font-mermaid", NATIVE_FONT_STACK);
		const base64 = await rasteriseToPng(sized, "#ffffff");
		await postJson({ kind: "png", side: SIDE, file: `compare-${diagram.slug}-${SIDE}.png`, base64 });
		summary.push({ slug: diagram.slug, width: sized.width, height: sized.height });
	}

	await postJson({ kind: "done", side: SIDE, count: summary.length, summary });
	(window as unknown as Record<string, unknown>).__cmDone = summary;
}

main().catch((error: unknown) => {
	(window as unknown as Record<string, unknown>).__cmDone = "failed";
	const message = error instanceof Error ? error.message : String(error);
	showError(message);
	throw error;
});
