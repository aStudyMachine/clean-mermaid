import mermaid from "mermaid";
import {
	intersect_default,
	shapes,
	updateNodeBounds,
	type ChunkSelection,
	type ChunkShapeNode,
} from "mermaid/dist/chunks/mermaid.core/chunk-XC4XBNZT.mjs";
import { decisionBox, decisionPoints } from "./decision-shape";
import { SYSTEM_FONT_STACK, themeIdentity, type ThemeDefinition } from "./themes";
import type {
	DecisionShape,
	ElkMergeEdges,
	ElkNodePlacement,
	LayoutEngine,
} from "./settings";

export interface RenderRequest {
	/** mermaid 源码（已剥掉 `%% cm: %%` 指令）。 */
	code: string;
	/** 要注入的主题；`null` 走 mermaid 自带默认外观（plain 模式）。 */
	theme: ThemeDefinition | null;
	layout: LayoutEngine;
	elkMergeEdges: ElkMergeEdges;
	elkNodePlacement: ElkNodePlacement;
	/** 判断节点菱形的画法，来自设置项。 */
	decisionShape: DecisionShape;
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

/**
 * 判断节点菱形走哪套几何，需要两个条件同时成立。
 *
 * 1. 设置项没被切成 `native`。值读模块变量而不是 mermaid 配置 —— 实测往 `themeVariables`
 *    或 `flowchart` 段里塞自定义键，渲染期在形状处理器里读回来都是 `undefined`
 *    （mermaid 按 schema 与主题类的键表把未知键剥掉了，同一条指令里的 `primaryColor` 却活得好好的）。
 *    它是全局设置、不随单次渲染变化，所以没有并发竞态。
 * 2. 这次渲染用的是插件主题。载体只能用 `theme` 这个**已知**配置键：非 plain 分支恒定写
 *    `"base"`，plain 分支写 `"default"` / `"dark"`，而 `%% cm:plain %%` 的定义是「Obsidian
 *    默认会显示的样子」，正方形菱形也算样子的一部分。
 */
const PLUGIN_THEME_ID = "base";

let decisionShapeSetting: DecisionShape = "compact";

let decisionShapePatched = false;

function usesCompactDecisionShape(): boolean {
	return (
		decisionShapeSetting === "compact" &&
		mermaid.mermaidAPI.getConfig().theme === PLUGIN_THEME_ID
	);
}

/**
 * 把 mermaid 的 `question` 形状包一层，画成贴着文字量的扁菱形。
 *
 * 为什么只能在这里改：`FlowchartDiagramConfig` 没有任何形状或宽高比开关，`node.padding`
 * 又是全局统一赋值、classDef 覆盖不了；而卡片是 `<img src="data:image/svg+xml">`，页面 CSS
 * 进不到 SVG 内部。形状表 `shapes` 是运行时读取的普通对象，是改节点几何的唯一着力点。
 *
 * 只改几何、不重写处理器：先让原实现把标签量好、把 classDef 与主题着色都挂好，我们只替换
 * polygon 的 `points` / `transform`，再同步 `updateNodeBounds` 与 `calcIntersect` ——
 * 前者决定 dagre 与 ELK 给这个节点留多大位置，后者决定连边在菱形的哪条边上收尾。
 *
 * 改的是插件自己打包进 main.js 的私有 mermaid 副本，Obsidian 官方那份 mermaid 渲染不受影响。
 */
function installCompactDecisionShape(): void {
	if (decisionShapePatched) {
		return;
	}
	decisionShapePatched = true;

	// 形状表里 `diam` / `diamond` / `decision` / `question` 是同一个函数的四个别名键，
	// 而 flowchart 解析器把 `{}` 归到 `diamond`、block 图归到 `question`。
	// 按「与原 `question` 是同一个函数引用」来挑，四个键一起包，不依赖哪个图种用哪个名字。
	const shared = shapes.question ?? shapes.diamond;
	if (!shared) {
		// mermaid 换了形状表就不硬来；tests/browser 那条断言会把「静默失效」变成测试失败。
		return;
	}
	for (const key of Object.keys(shapes)) {
		if (shapes[key] === shared) {
			shapes[key] = wrapWithCompactBox(shared);
		}
	}
}

/** 包一层原处理器：先让它照常量标签、挂 classDef 与主题着色，我们只重写画出来的几何。 */
function wrapWithCompactBox(
	original: typeof shapes.question,
): typeof shapes.question {
	return async (parent, node, renderOptions) => {
		const shapeSvg = await original(parent, node, renderOptions);
		if (usesCompactDecisionShape()) {
			reshapeToCompactBox(shapeSvg, node);
		}
		return shapeSvg;
	};
}

function reshapeToCompactBox(shapeSvg: ChunkSelection, node: ChunkShapeNode): void {
	const polygon = shapeSvg.select("polygon");
	const label = shapeSvg.select("g.label").node();
	const shape = polygon.node();
	// handDrawn 观感下原实现画的是 rough path 而不是 polygon，放过它。
	if (!label || !shape) {
		return;
	}

	let labelWidth: number;
	let labelHeight: number;
	try {
		const bbox = (label as SVGGraphicsElement).getBBox();
		labelWidth = bbox.width;
		labelHeight = bbox.height;
	} catch {
		return;
	}
	if (labelWidth <= 0 || labelHeight <= 0) {
		return;
	}

	const next = decisionBox(labelWidth, labelHeight, node.padding ?? 0);
	const points = decisionPoints(next);
	shape.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
	// 局部坐标仍是 0..宽 × -高..0，所以 getBBox() 量到的正好是 next，不必自己写回 node.width。
	shape.setAttribute("transform", `translate(${-next.width / 2 + 0.5}, ${next.height / 2})`);

	updateNodeBounds(node, polygon);
	node.calcIntersect = (bounds, point) => intersect_default.polygon(bounds, points, point);
	node.intersect = (point) => intersect_default.polygon(node, points, point);
}

function ensureInitialized(): void {
	if (initialized) {
		return;
	}
	installCompactDecisionShape();
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

	// mermaid 12 各图种段自带 `look: "neo"`（节点投影 + 16~28px 内边距），会把段级值提到顶层，
	// 所以这里写顶层 `look` 一条就能统一全部图种。块里自带 `%%{init}%%` 的用户指令排在后面，
	// 天然压得过我们这条，想退回 neo 不必改代码。
	init.look = "classic";

	if (request.plain || !request.theme) {
		// mermaid 原生外观（大致就是 Obsidian 默认会显示的样子）—— 判断节点也就退回原生的正方形。
		init.theme = request.plain && isDarkDocument() ? "dark" : "default";
		init.layout = "dagre";
		return init;
	}

	init.theme = PLUGIN_THEME_ID;
	init.themeVariables = request.theme.variables;
	init.layout = request.layout;

	// 官方默认的 120 会把所有节点夹成等宽、并把长标签折行；改成贴着文字量尺寸。
	// `wrappingWidth` 是 max-width 而非固定宽，调大只会让长标签晚一点折，不会撑宽短节点。
	init.state = { minNodeWidth: 0, wrappingWidth: 400 };
	init.flowchart = { minNodeWidth: 0, wrappingWidth: 400 };

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
		request.decisionShape,
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
	// 形状处理器拿不到这次请求的对象，只能靠模块变量递话。它是全局设置、对所有块同值，
	// 所以并发渲染读到的必然是同一个值；cacheKey 里有它，切设置不会命中旧缓存。
	decisionShapeSetting = request.decisionShape;

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