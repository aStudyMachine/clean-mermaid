/**
 * 渲染引擎的契约层：**只放类型与接口，不 import 任何渲染器实现**。
 *
 * 存在的理由：卡片、导出、查看器这些上层只该知道「给我一份 SVG」，不该知道背后是 mermaid
 * 还是别的渲染器。引擎适配、配色与 SVG 自包含化留在实现层；卡片只处理结果与同步/异步时序。
 *
 * 这个文件因此必须保持「无副作用、无运行时依赖」：它会被纯逻辑模块与单测引用。
 */

import type { DecisionShape, ElkMergeEdges, ElkNodePlacement, LayoutEngine } from "./settings";
import type { ThemeDefinition } from "./themes";

/**
 * 一次渲染请求。
 *
 * 字段描述调用者选择的布局与外观；实现方只处理图种支持的选项。
 */
export interface RenderRequest {
	/** 源码（已剥掉 `%% cm: %%` 指令）。 */
	code: string;
	/** 要注入的主题；`null` 走渲染器自带默认外观（plain 模式）。 */
	theme: ThemeDefinition | null;
	layout: LayoutEngine;
	elkMergeEdges: ElkMergeEdges;
	elkNodePlacement: ElkNodePlacement;
	/** 判断节点菱形的画法，来自设置项。 */
	decisionShape: DecisionShape;
	/** plain 模式用渲染器原生外观，不加插件样式。 */
	plain: boolean;
}

/** 渲染结果。`svg` 是自包含的 SVG 字符串，可直接进 `<img src="data:…">`。 */
export interface RenderedDiagram {
	svg: string;
	width: number;
	height: number;
}

/**
 * 一个渲染引擎实例。
 *
 * `peek` 必须是**同步**的：要把图表放进编辑器已测量过的 DOM 的调用方，必须让结果和 DOM
 * 写入落在同一帧 —— await 渲染会让块在 CodeMirror 记下高度之后才变高，从而触发视图重新
 * 测量（滚动时笔记会明显跳动）。
 *
 * Pele 与 Dagre 的冷渲染同步返回，ELK 的冷渲染异步返回。上层保留同步路径，
 * 让能够同步返回的结果在同次 CodeMirror 测量之前写入卡片。
 * 外观缓存失效由 renderer.ts 的组合入口统一提供给插件生命周期调用。
 */
export interface RenderEngine {
	/** 同步查缓存；没有则返回 `null`，调用方应改用 `render`。 */
	peek(request: RenderRequest): RenderedDiagram | null;
	/** 渲染（命中缓存时立即返回）。 */
	render(request: RenderRequest): RenderedDiagram | Promise<RenderedDiagram>;
}
