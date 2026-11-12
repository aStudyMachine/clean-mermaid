import type { RenderEngine, RenderRequest, RenderedDiagram } from "./render-engine";
import type { PeleRuntime } from "./pele-types";
import { renderPeleMath } from "./pele-math";
import { peleSeries, peleTheme, peleThemeOverrides, sourceThemeVariables } from "./pele-theme";
import { centerSvgHorizontally, normalizeSvg } from "./svg-utils";
import { SYSTEM_FONT_STACK, themeIdentity } from "./themes";

let runtime: PeleRuntime | undefined;
let sanitize: (svg: string) => string;
let revision = 0;
let seq = 0;
const cache = new Map<string, RenderedDiagram>();

export function initializePele(pele: PeleRuntime, sanitizeSvg: (svg: string) => string): void {
	runtime = pele;
	sanitize = sanitizeSvg;
	invalidatePele();
}

export function invalidatePele(): void {
	revision++;
	cache.clear();
	runtime?.forgetTextWidths();
}

export function peleRevision(): number { return revision; }

function key(request: RenderRequest): string {
	return [revision, themeIdentity(request.theme), document.body.classList.contains("theme-dark"), request.plain, request.code].join("\0");
}

/** 把宿主 CSS 变量解析为具体值，图片和导出不能继承正文的样式。 */
function appearance(request: RenderRequest): { colors: Record<string, string>; font: string; mono: string; size: number } {
	const dark = document.body.classList.contains("theme-dark");
	const theme = request.theme ?? { id: "plain", name: "Plain", builtin: true, dark, variables: {} };
	const overrides = sourceThemeVariables(request.code);
	const v = { ...(request.plain ? {} : theme.variables), ...overrides };
	const sequence = /^\s*sequenceDiagram/m.test(request.code);
	const sourceColors = { ...peleThemeOverrides(overrides, sequence), ...peleSeries(overrides, request.code) };
	const colors = { ...peleTheme({ ...theme, variables: request.plain ? {} : theme.variables }, sequence, overrides), ...peleSeries(v, request.code) };
	const probe = document.createElement("span");
	probe.className = "mermaid";
	probe.style.display = "none";
	document.body.appendChild(probe);
	try {
		const computed = getComputedStyle(probe);
		for (const field of Object.keys(colors)) {
			if (field === "--pele-font" || field === "--pele-font-mono") continue;
			const inherited = request.plain && !sourceColors[field] ? computed.getPropertyValue(field).trim() : "";
			if (field.endsWith("-weight")) {
				probe.style.fontWeight = inherited || colors[field];
				colors[field] = getComputedStyle(probe).fontWeight;
				continue;
			}
			if (field === "--pele-radius") {
				probe.style.borderRadius = inherited || colors[field];
				colors[field] = getComputedStyle(probe).borderTopLeftRadius;
				continue;
			}
			probe.style.color = "";
			probe.style.color = inherited || colors[field];
			colors[field] = getComputedStyle(probe).color;
		}
		probe.style.fontFamily = sourceColors["--pele-font"] || (request.plain ? computed.getPropertyValue("--font-mermaid").trim() || SYSTEM_FONT_STACK : colors["--pele-font"]);
		const font = getComputedStyle(probe).fontFamily;
		colors["--pele-font"] = font;
		probe.style.fontFamily = (request.plain ? computed.getPropertyValue("--pele-font-mono").trim() : "") || colors["--pele-font-mono"];
		const mono = getComputedStyle(probe).fontFamily;
		colors["--pele-font-mono"] = mono;
		const size = Number.parseFloat(String(v.fontSize ?? "14"));
		return { colors, font, mono, size: Number.isFinite(size) && size > 0 ? size : 14 };
	} finally { probe.remove(); }
}

function peek(request: RenderRequest): RenderedDiagram | null {
	const k = key(request);
	const result = cache.get(k);
	if (result) { cache.delete(k); cache.set(k, result); }
	return result ?? null;
}

function render(request: RenderRequest): RenderedDiagram {
	const cached = peek(request);
	if (cached) return cached;
	if (!runtime) throw new Error("Obsidian 1.15 or later with Pele is required");
	const { colors, font, mono, size } = appearance(request);
	const result = runtime.render(request.code, {
		idPrefix: `cm-pele-${++seq}`,
		responsive: false,
		autoDirection: false,
		fontFamily: font,
		fontFamilyMono: mono,
		fontSize: size,
		config: { themeVariables: request.plain ? {} : request.theme?.variables ?? {} },
		math: renderPeleMath,
	});
	const normalized = normalizeSvg(sanitize(result.svg));
	const doc = new DOMParser().parseFromString(normalized.svg, "image/svg+xml");
	const root = doc.documentElement as unknown as SVGSVGElement;
	for (const [name, value] of Object.entries(colors)) root.style.setProperty(name, value);
	// Pele 1.8 的状态图自环可能留下单侧空白；按着色及字体后的真实边界居中。
	centerSvgHorizontally(root);
	const rendered = { ...normalized, svg: new XMLSerializer().serializeToString(root) };
	cache.set(key(request), rendered);
	if (cache.size > 100) cache.delete(cache.keys().next().value!);
	return rendered;
}

export const peleEngine: RenderEngine = { peek, render };
