import { BUILTIN_THEMES, themeCanvasColor } from "../../src/themes";
import { renderDiagram } from "../../src/mermaid-runtime";
import { CAPTURE_DIAGRAMS } from "./capture-diagrams";
import { postJson, rasteriseToPng, showError, sizeSvg } from "./capture-shared";

/** 出厂默认：ELK + Clean Light + 明色文档。 */
const CLEAN_LIGHT = BUILTIN_THEMES.find((theme) => theme.id === "clean-light") ?? BUILTIN_THEMES[0];

const SIDE = "plugin";

async function main(): Promise<void> {
	const summary: { slug: string; width: number; height: number }[] = [];

	for (const diagram of CAPTURE_DIAGRAMS) {
		const rendered = await renderDiagram({
			code: diagram.code,
			theme: CLEAN_LIGHT,
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			plain: false,
		});
		const sized = sizeSvg(rendered.svg);
		const base64 = await rasteriseToPng(sized, themeCanvasColor(CLEAN_LIGHT));
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
