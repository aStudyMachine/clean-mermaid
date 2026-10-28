import { BUILTIN_THEMES } from "../../src/themes";
import { renderDiagram } from "../../src/renderer";

const FLOW = `flowchart TD
  A[开始] --> B{判断条件}
  B -->|是| C[处理数据]
  B -->|否| D[结束流程]
  C --> D`;

const results: unknown[] = [];
(window as unknown as Record<string, unknown>).__cmResults = results;

/**
 * 量出判断节点菱形的包围盒。
 *
 * 定位靠 `polygon.label-container`（mermaid 的 `insertPolygonShape` 给所有多边形节点打的类）——
 * 不能直接取第一个 polygon，箭头标记本身就是个三点 polygon。
 *
 * 这是「紧凑菱形补丁真的打在 mermaid 渲染时读的那份形状表上」的唯一硬证据：
 * 补丁静默失效时图照样出得来，只是菱形仍是正方形，肉眼在缩略图里很容易看漏。
 */
function decisionPolygonBox(svg: string): { width: number; height: number } | null {
	const polygon = new DOMParser()
		.parseFromString(svg, "image/svg+xml")
		.querySelector("polygon.label-container");
	const raw = polygon?.getAttribute("points")?.trim();
	if (!raw) {
		return null;
	}
	const points = raw.split(/\s+/).map((pair) => pair.split(",").map(Number));
	if (points.length !== 4 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
		return null;
	}
	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);
	return {
		width: Math.max(...xs) - Math.min(...xs),
		height: Math.max(...ys) - Math.min(...ys),
	};
}

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
					decisionShape: "compact",
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

	// 校验用户手写的 init 指令仍优先于我们的（mainBkg 决定节点填充色）。
	try {
		const overridden = await renderDiagram({
			code: `%%{init: {"themeVariables": {"mainBkg": "#ff0000"}}}%%\n${FLOW}`,
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "compact",
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

	// 校验 plain 模式可渲染，且判断节点在 plain 下仍是 mermaid 内置的正方形菱形
	// （plain 的定义就是「Obsidian 默认会显示的样子」，几何也算样子的一部分）。
	try {
		const plain = await renderDiagram({
			code: FLOW,
			theme: null,
			layout: "dagre",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "compact",
			plain: true,
		});
		const box = decisionPolygonBox(plain.svg);
		results.push({
			check: "plain mode",
			width: Math.round(plain.width),
			height: Math.round(plain.height),
			plainKeepsSquareDiamond: !!box && Math.abs(box.width - box.height) < 1,
		});
	} catch (error) {
		results.push({ check: "plain mode", error: error instanceof Error ? error.message : String(error) });
	}

	// 判断节点几何：设置项「紧凑」下是扁菱形，「原生」下退回 mermaid 内置的正方形。
	try {
		const compact = await renderDiagram({
			code: FLOW,
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "compact",
			plain: false,
		});
		const box = decisionPolygonBox(compact.svg);
		results.push({
			check: "compact decision shape",
			aspect: box ? Number((box.width / box.height).toFixed(3)) : null,
			size: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null,
			isFlatDiamond: !!box && box.width > box.height,
			// 等比贴字 + 宽高比夹在 2–4：验证页里的量法与纯模块同一套判据。
			withinAspectBand: !!box && box.width / box.height >= 1.99 && box.width / box.height <= 4.01,
		});

		// 长标签：wrappingWidth 折行后文字框变宽，这里量的是宽高比上限有没有夹住。
		const long = await renderDiagram({
			code: "flowchart TD\n  A{这个判断条件写得很长以至于它必然会在 wrappingWidth 处折行变成两行}",
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "compact",
			plain: false,
		});
		const longBox = decisionPolygonBox(long.svg);
		results.push({
			check: "long decision label",
			size: longBox ? `${Math.round(longBox.width)}x${Math.round(longBox.height)}` : null,
			aspect: longBox ? Number((longBox.width / longBox.height).toFixed(3)) : null,
			withinAspectBand: !!longBox && longBox.width / longBox.height <= 4.01,
		});

		// 同一份源码、同一个主题，只有设置项不同 —— 证明几何确实由设置项驱动，而不是缓存串台。
		const native = await renderDiagram({
			code: FLOW,
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "native",
			plain: false,
		});
		const nativeBox = decisionPolygonBox(native.svg);
		results.push({
			check: "native decision shape setting",
			aspect: nativeBox ? Number((nativeBox.width / nativeBox.height).toFixed(3)) : null,
			isSquareDiamond: !!nativeBox && Math.abs(nativeBox.width - nativeBox.height) < 1,
		});
	} catch (error) {
		results.push({ check: "compact decision shape", error: error instanceof Error ? error.message : String(error) });
	}

	// 共用菱形处理器的其它图种会一起变扁（state 的 choice、block 的 ?）—— 记录实际结果供目检。
	for (const [label, code] of [
		[
			"state choice",
			"stateDiagram-v2\n  [*] --> s1\n  s1 --> c <<choice>>\n  c --> done: 成功\n  c --> s1: 重试\n",
		],
		["block question", "block-beta\n  columns 1\n  a[\"输入\"]\n  b?\"判断\"\n  c[\"输出\"]\n  a --> b\n  b --> c\n"],
	] as const) {
		try {
			const rendered = await renderDiagram({
				code,
				theme: BUILTIN_THEMES[0],
				layout: "dagre",
				elkMergeEdges: "default",
				elkNodePlacement: "default",
				decisionShape: "compact",
				plain: false,
			});
			const box = decisionPolygonBox(rendered.svg);
			results.push({
				check: label,
				polygonFound: !!box,
				aspect: box ? Number((box.width / box.height).toFixed(3)) : null,
			});
		} catch (error) {
			results.push({ check: label, error: error instanceof Error ? error.message : String(error) });
		}
	}

	// 校验数学渲染（katex 随 mermaid 传递引入，渲染抛错即此处记录 error）：
	// mermaid 把 `$$...$$` 交给 katex.renderToString，输出 MathML。升级 katex
	// 前后都跑这页，用本条判定有没有坏。
	try {
		const math = await renderDiagram({
			code: 'flowchart TD\n  A["能量公式 $$E = m c^2$$"] --> B[结果]',
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "compact",
			plain: false,
		});
		results.push({
			check: "katex math",
			hasMathElement: math.svg.includes("<math"),
			hasKatexClass: math.svg.includes("katex"),
			width: Math.round(math.width),
			height: Math.round(math.height),
		});

		const mathBox = document.createElement("div");
		mathBox.style.background = "transparent";
		mathBox.style.padding = "16px";
		mathBox.style.margin = "16px 0";
		mathBox.style.border = "1px dashed #f59e0b";
		mathBox.style.display = "flex";
		mathBox.style.justifyContent = "center";
		const mathImg = document.createElement("img");
		mathImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(math.svg)}`;
		mathImg.style.width = "520px";
		mathBox.appendChild(mathImg);
		out.appendChild(mathBox);
	} catch (error) {
		results.push({ check: "katex math", error: error instanceof Error ? error.message : String(error) });
	}

	// SVG 净化：安全级别为 loose，标签里的 HTML 必须经 mermaid 的 DOMPurify 过滤。
	// 升级带净化的传递依赖前后都跑这条 —— 带事件处理器的负载不能以可执行属性落进输出。
	try {
		const payload = await renderDiagram({
			code: 'flowchart TD\n  A["<img src=x onerror=window.__cmXss=1>"] --> B[ok]',
			theme: BUILTIN_THEMES[0],
			layout: "elk",
			elkMergeEdges: "default",
			elkNodePlacement: "default",
			decisionShape: "compact",
			plain: false,
		});
		const holder = document.createElement("div");
		holder.innerHTML = payload.svg;
		document.body.appendChild(holder);
		await new Promise((resolve) => setTimeout(resolve, 200));
		results.push({
			check: "svg sanitization",
			payloadInOutput: /onerror/i.test(payload.svg),
			executableAttributeKept: holder.querySelector("[onerror]") !== null,
			xssExecuted: (window as unknown as Record<string, unknown>).__cmXss === 1,
		});
		holder.remove();
	} catch (error) {
		results.push({ check: "svg sanitization", error: error instanceof Error ? error.message : String(error) });
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
