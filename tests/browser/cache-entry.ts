import { renderDiagram } from "../../src/mermaid-runtime";
import { themeIdentity } from "../../src/themes";

const FLOW = `flowchart TD
  A[开始] --> B{判断条件}
  B -->|是| C[处理数据]
  B -->|否| D[结束流程]
  C --> D`;

type AnyTheme = Parameters<typeof renderDiagram>[0]["theme"];

const custom = (mainBkg: string, dark = false) => ({
	id: "my-custom",
	name: "My Custom",
	dark,
	builtin: false,
	variables: {
		background: "#ffffff",
		mainBkg,
		primaryColor: mainBkg,
		nodeBorder: "#c4b5fd",
		lineColor: "#a1a1aa",
	},
});

async function req(theme: AnyTheme, plain = false) {
	return renderDiagram({
		code: FLOW,
		theme,
		layout: "elk",
		elkMergeEdges: "default",
		elkNodePlacement: "default",
		plain,
	});
}

const results: Record<string, unknown>[] = [];

async function main(): Promise<void> {
	// 1. Editing the colours of an existing custom theme (same id) must produce a new SVG.
	const first = await req(custom("#111111"));
	const edited = await req(custom("#ff0000"));
	results.push({
		check: "theme edit re-renders (id unchanged)",
		firstUsedOldColor: first.svg.includes("#111111"),
		editedUsesNewColor: edited.svg.includes("#ff0000"),
		editedDroppedOldColor: !edited.svg.includes("#111111"),
	});

	// 2. Nothing about caching got worse: an identical request comes straight back out of it.
	const again = await req(custom("#ff0000"));
	results.push({ check: "identical request still hits cache", sameReference: again === edited });

	// 3. Identity separates same-id themes by content, and honours the dark flag.
	results.push({
		check: "themeIdentity content + dark flag",
		differsByColors: themeIdentity(custom("#111111")) !== themeIdentity(custom("#222222")),
		sameByEqualContent: themeIdentity(custom("#111111")) === themeIdentity(custom("#111111")),
		differsByDark: themeIdentity(custom("#111111", false)) !== themeIdentity(custom("#111111", true)),
		nullIsNone: themeIdentity(null) === "none",
	});

	// 4. Plain mode bakes the document appearance into the SVG, so it must not replay across looks.
	document.body.classList.remove("theme-dark");
	const plainLight = await req(null, true);
	document.body.classList.add("theme-dark");
	const plainDark = await req(null, true);
	const darkRepeat = await req(null, true);
	document.body.classList.remove("theme-dark");
	const lightAgain = await req(null, true);
	results.push({
		check: "plain mode keys the appearance",
		svgsDiffer: plainLight.svg !== plainDark.svg,
		darkHitsDark: darkRepeat === plainDark,
		lightHitsLight: lightAgain === plainLight,
	});

	// 5. The same diagram in two themes that happen to share an id prefix still renders twice.
	const other = await req({ ...custom("#00ff00"), id: "other-custom" });
	results.push({
		check: "different ids are independent",
		otherColorApplied: other.svg.includes("#00ff00"),
		stillDistinct: other !== edited,
	});
}

main()
	.then(() => {
		(window as unknown as Record<string, unknown>).__cmCacheResults = results;
		(window as unknown as Record<string, unknown>).__cmCacheDone = true;
		document.getElementById("out")!.textContent = JSON.stringify(results, null, 2);
	})
	.catch((error) => {
		(window as unknown as Record<string, unknown>).__cmCacheDone = "failed";
		document.getElementById("out")!.textContent = String(error);
	});
