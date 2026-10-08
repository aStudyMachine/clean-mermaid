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
	// 1. 修改已有自定义主题的配色（id 不变）必须产出新的 SVG。
	const first = await req(custom("#111111"));
	const edited = await req(custom("#ff0000"));
	results.push({
		check: "theme edit re-renders (id unchanged)",
		firstUsedOldColor: first.svg.includes("#111111"),
		editedUsesNewColor: edited.svg.includes("#ff0000"),
		editedDroppedOldColor: !edited.svg.includes("#111111"),
	});

	// 2. 缓存没有退化：完全相同的请求直接从缓存返回。
	const again = await req(custom("#ff0000"));
	results.push({ check: "identical request still hits cache", sameReference: again === edited });

	// 3. themeIdentity 按内容区分同 id 的主题，并计入 dark 标志。
	results.push({
		check: "themeIdentity content + dark flag",
		differsByColors: themeIdentity(custom("#111111")) !== themeIdentity(custom("#222222")),
		sameByEqualContent: themeIdentity(custom("#111111")) === themeIdentity(custom("#111111")),
		differsByDark: themeIdentity(custom("#111111", false)) !== themeIdentity(custom("#111111", true)),
		nullIsNone: themeIdentity(null) === "none",
	});

	// 4. plain 模式把文档外观烘进 SVG，换外观后不能复用另一外观的结果。
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

	// 5. 同一图表用两个恰好共享 id 前缀的主题，仍然各渲染一次。
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
