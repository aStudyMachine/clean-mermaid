import mermaid from "mermaid";
import { SYSTEM_FONT_STACK, type ThemeDefinition } from "./themes";
import type { ElkMergeEdges, ElkNodePlacement, LayoutEngine } from "./settings";

export interface RenderRequest {
	/** Mermaid source (already stripped of `%% cm: %%` directives). */
	code: string;
	/** Theme to inject; `null` renders with mermaid's own default look (plain mode). */
	theme: ThemeDefinition | null;
	layout: LayoutEngine;
	elkMergeEdges: ElkMergeEdges;
	elkNodePlacement: ElkNodePlacement;
	/** Plain mode renders mermaid's stock theme/dagre instead of the plugin styling. */
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
		// Stock mermaid appearance (what Obsidian would roughly show).
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
 * Injects our configuration as an `%%{init: ...}%%` directive.
 *
 * Why a directive and not YAML frontmatter:
 * mermaid merges all init directives (later ones win) and then applies them on top of the
 * frontmatter config, so a directive is the only injection point that never collides with a
 * user's own frontmatter — and any directive the user writes themselves still wins over ours.
 */
function injectInitDirective(source: string, init: Record<string, unknown>): string {
	const directive = `%%{init: ${JSON.stringify(init)}}%%`;
	const lines = source.split(/\r?\n/);

	// Keep user frontmatter first; insert right after its closing marker.
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

/** Forces explicit pixel dimensions on the SVG root so it behaves predictably inside an <img>. */
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
	return [
		request.plain ? "plain" : request.theme?.id ?? "none",
		request.layout,
		request.elkMergeEdges,
		request.elkNodePlacement,
		request.code,
	].join("\u0000");
}

export function svgToDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function renderDiagram(request: RenderRequest): Promise<RenderedDiagram> {
	ensureInitialized();

	const key = cacheKey(request);
	const cached = cache.get(key);
	if (cached) {
		// Refresh LRU position.
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}

	const id = `cm-${++renderSeq}-${Date.now().toString(36)}`;
	const code = injectInitDirective(request.code, buildInitConfig(request));

	let svg: string;
	try {
		const result = await mermaid.render(id, code);
		svg = result.svg;
	} finally {
		// mermaid leaves a temporary node behind when rendering throws.
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