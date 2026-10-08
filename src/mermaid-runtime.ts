import mermaid from "mermaid";
import { SYSTEM_FONT_STACK, themeIdentity, type ThemeDefinition } from "./themes";
import type { ElkMergeEdges, ElkNodePlacement, LayoutEngine } from "./settings";

export interface RenderRequest {
	/** mermaid 源码（已剥掉 `%% cm: %%` 指令）。 */
	code: string;
	/** 要注入的主题；`null` 走 mermaid 自带默认外观（plain 模式）。 */
	theme: ThemeDefinition | null;
	layout: LayoutEngine;
	elkMergeEdges: ElkMergeEdges;
	elkNodePlacement: ElkNodePlacement;
	/** plain 模式用 mermaid 自带的 theme/dagre，不加插件样式。 */
	plain: boolean;
}

export interface RenderedDiagram {
	svg: string;
	width: number;
	height: number;
}

let initialized = false;
let renderSeq = 0;

function ensureInitialized(): void {
	if (initialized) {
		return;
	}
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "loose",
		suppressErrorRendering: true,
		logLevel: "fatal",
		theme: "base",
		fontFamily: SYSTEM_FONT_STACK,
		flowchart: {
			curve: "basis",
			htmlLabels: true,
			padding: 12,
			nodeSpacing: 45,
			rankSpacing: 50,
		},
		sequence: { useMaxWidth: true },
		gantt: { useMaxWidth: true },
	});
	initialized = true;
}

function buildInitConfig(request: RenderRequest): Record<string, unknown> {
	const init: Record<string, unknown> = {};

	if (request.plain || !request.theme) {
		// mermaid 原生外观（大致就是 Obsidian 默认会显示的样子）。
		init.theme = request.plain && isDarkDocument() ? "dark" : "default";
		init.layout = "dagre";
		return init;
	}

	init.theme = "base";
	init.themeVariables = request.theme.variables;
	init.layout = request.layout;

	if (request.layout === "elk") {
		const elk: Record<string, unknown> = {};
		if (request.elkMergeEdges === "on") {
			elk.mergeEdges = true;
		} else if (request.elkMergeEdges === "off") {
			elk.mergeEdges = false;
		}
		if (request.elkNodePlacement !== "default") {
			elk.nodePlacementStrategy = request.elkNodePlacement;
		}
		if (Object.keys(elk).length > 0) {
			init.elk = elk;
		}
	}
	return init;
}

function isDarkDocument(): boolean {
	return document.body.classList.contains("theme-dark");
}

/**
 * 把我们的配置作为 `%%{init: ...}%%` 指令注入。
 *
 * 为什么用指令而不是 YAML frontmatter：
 * mermaid 会先合并所有 init 指令（后出现的胜出），再叠在 frontmatter 配置之上，
 * 所以指令是唯一不会和用户自己的 frontmatter 冲突的注入点 ——
 * 而且用户自己写的指令仍然压得过我们这条。
 */
function injectInitDirective(source: string, init: Record<string, unknown>): string {
	const directive = `%%{init: ${JSON.stringify(init)}}%%`;
	const lines = source.split(/\r?\n/);

	// 用户的 frontmatter 保持在最前，指令插在它的结束标记之后。
	if (/^\s*---\s*$/.test(lines[0] ?? "")) {
		for (let i = 1; i < lines.length; i++) {
			if (/^\s*---\s*$/.test(lines[i])) {
				lines.splice(i + 1, 0, directive);
				return lines.join("\n");
			}
		}
	}
	return `${directive}\n${source}`;
}

/** 给 SVG 根节点强制写上像素尺寸，放进 <img> 里表现才可预期。 */
function normalizeSvg(svg: string): RenderedDiagram {
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	const el = doc.documentElement;
	if (!el || el.nodeName.toLowerCase() !== "svg") {
		return { svg, width: 0, height: 0 };
	}

	let width = 0;
	let height = 0;
	const viewBox = el.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox.trim().split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
			width = parts[2];
			height = parts[3];
		}
	}
	if (!width || !height) {
		width = Number.parseFloat(el.getAttribute("width") ?? "") || 800;
		height = Number.parseFloat(el.getAttribute("height") ?? "") || 600;
	}

	el.setAttribute("width", String(width));
	el.setAttribute("height", String(height));
	el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	if (!el.getAttribute("xmlns:xlink")) {
		el.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
	}
	const style = el.getAttribute("style");
	if (style && /max-width/i.test(style)) {
		el.setAttribute("style", style.replace(/max-width\s*:[^;]*;?/gi, "").trim());
	}

	return { svg: new XMLSerializer().serializeToString(el), width, height };
}

const cache = new Map<string, RenderedDiagram>();
const CACHE_LIMIT = 100;

function cacheKey(request: RenderRequest): string {
	// plain 模式会把当前文档外观烘进 SVG（见 buildInitConfig），所以外观要进 key ——
	// 否则切换明暗时会重放出另一套样子。
	return [
		request.plain ? `plain:${isDarkDocument() ? "dark" : "light"}` : themeIdentity(request.theme),
		request.layout,
		request.elkMergeEdges,
		request.elkNodePlacement,
		request.code,
	].join("\u0000");
}

export function svgToDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 同步查缓存。
 *
 * 要把图表放进编辑器已测量过的 DOM 的调用方，必须让结果和 DOM 写入落在同一帧 ——
 * await 渲染会让块在 CodeMirror 记下高度之后才变高，从而触发视图重新测量
 * （滚动时笔记会明显跳动）。
 */
export function peekRendered(request: RenderRequest): RenderedDiagram | null {
	const key = cacheKey(request);
	const cached = cache.get(key);
	if (!cached) {
		return null;
	}
	// 刷新 LRU 位置。
	cache.delete(key);
	cache.set(key, cached);
	return cached;
}

export async function renderDiagram(request: RenderRequest): Promise<RenderedDiagram> {
	ensureInitialized();

	const cached = peekRendered(request);
	if (cached) {
		return cached;
	}

	const key = cacheKey(request);
	const id = `cm-${++renderSeq}-${Date.now().toString(36)}`;
	const code = injectInitDirective(request.code, buildInitConfig(request));

	let svg: string;
	try {
		const result = await mermaid.render(id, code);
		svg = result.svg;
	} finally {
		// mermaid 渲染抛错时会留下一个临时节点。
		document.getElementById(`d${id}`)?.remove();
	}

	const normalized = normalizeSvg(svg);
	cache.set(key, normalized);
	while (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) {
			break;
		}
		cache.delete(oldest);
	}
	return normalized;
}