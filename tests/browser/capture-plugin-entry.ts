import { BUILTIN_THEMES, themeCanvasColor } from "../../src/themes";
import { renderDiagram } from "../../src/renderer";
import { CAPTURE_DIAGRAMS, CAPTURE_LANGUAGES } from "./capture-diagrams";
import { postJson, rasteriseToPng, showError, sizeSvg } from "./capture-shared";

/** 出厂默认：ELK + Clean Light + 明色文档。 */
const CLEAN_LIGHT = BUILTIN_THEMES.find((theme) => theme.id === "clean-light") ?? BUILTIN_THEMES[0];

const SIDE = "plugin";

async function main(): Promise<void> {
	// 先把字体交给浏览器落定再开始渲染：首张图若赶在字体就绪前量尺寸，会拿回退字体的度量画一遍。
	await document.fonts.ready;

	const summary: { slug: string; language: string; width: number; height: number; svgBytes: number }[] = [];
	let index = 0;

	for (const language of CAPTURE_LANGUAGES) {
		for (const diagram of CAPTURE_DIAGRAMS) {
			index += 1;
			const rendered = await renderDiagram({
				code: diagram.codes[language],
				theme: CLEAN_LIGHT,
				layout: "elk",
				elkMergeEdges: "default",
				elkNodePlacement: "default",
				decisionShape: "compact",
				plain: false,
			});
			const sized = sizeSvg(rendered.svg);
			const base64 = await rasteriseToPng(sized, themeCanvasColor(CLEAN_LIGHT));
			await postJson({
				kind: "png",
				side: SIDE,
				file: `compare-${diagram.slug}-${language}-${SIDE}.png`,
				base64,
			});
			summary.push({
				slug: diagram.slug,
				language,
				width: sized.width,
				height: sized.height,
				svgBytes: sized.svg.length,
			});
		}
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
