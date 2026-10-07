import { BUILTIN_THEMES } from "../../src/themes";
import { renderDiagram } from "../../src/mermaid-runtime";

const FLOW = `flowchart TD
  A[开始] --> B{判断条件}
  B -->|是| C[处理数据]
  B -->|否| D[结束流程]
  C --> D`;

const results: unknown[] = [];
(window as unknown as Record<string, unknown>).__cmResults = results;

async function main(): Promise<void> {
	const out = document.getElementById("out")!;

	for (const theme of BUILTIN_THEMES) {
		for (const layout of ["elk", "dagre"] as const) {
			try {
				const rendered = await renderDiagram({
					code: FLOW,
					theme,
					layout,
					elkMergeEdges: "default",
					elkNodePlacement: "default",
					plain: false,
				});
				results.push({
					theme: theme.id,
					layout,
					width: Math.round(rendered.width),
					height: Math.round(rendered.height),
					hasThemeColor: rendered.svg.includes(String(theme.variables.primaryColor)),
					svgBytes: rendered.svg.length,
				});

				if (layout === "elk") {
					const box = document.createElement("div");
					box.style.background = String(theme.variables.background);
					box.style.padding = "16px";
					box.style.margin = "16px 0";
					box.style.border = "1px solid #ccc";
					box.style.display = "flex";
					box.style.justifyContent = "center";
					const img = document.createElement("img");
					img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`;
					img.style.width = "520px";
					box.appendChild(img);
					out.appendChild(box);
				}
			} catch (error) {
				results.push({ theme: theme.id, layout, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}

	// Check that a user-written init directive still wins over ours (mainBkg paints node fills).
	try {
		const overridden = await renderDiagram({
			code: `%%{init: {"themeVariables": {"mainBkg": "#ff0000"}}}%%\n${FLOW}`,
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			plain: false,
		});
		results.push({
			check: "user directive wins",
			userOverrideApplied: overridden.svg.includes("#ff0000"),
			pluginLineColorKept: overridden.svg.includes("#a1a1aa"),
			pluginMainBkgReplaced: !overridden.svg.includes("#f1effc"),
		});
	} catch (error) {
		results.push({ check: "user directive wins", error: error instanceof Error ? error.message : String(error) });
	}

	// Check plain mode renders.
	try {
		const plain = await renderDiagram({
			code: FLOW,
			theme: null,
			layout: "dagre",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			plain: true,
		});
		results.push({ check: "plain mode", width: Math.round(plain.width), height: Math.round(plain.height) });
	} catch (error) {
		results.push({ check: "plain mode", error: error instanceof Error ? error.message : String(error) });
	}
}

main()
	.then(() => {
		(window as unknown as Record<string, unknown>).__cmDone = true;
	})
	.catch((error) => {
		(window as unknown as Record<string, unknown>).__cmDone = "failed";
		document.getElementById("out")!.textContent = String(error);
	});
