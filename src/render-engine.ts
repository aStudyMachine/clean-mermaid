/**
 * 渲染引擎的契约层：**只放类型与接口，不 import 任何渲染器实现**。
 *
 * 存在的理由：卡片、导出、查看器这些上层只该知道「给我一份 SVG」，不该知道背后是 mermaid
 * 还是别的渲染器。换渲染器（mermaid → Pele，方案见 docs/pele-migration.md）时只需要替换
 * 一个实现文件，上层一行不用改。
 *
 * 这个文件因此必须保持「无副作用、无运行时依赖」：它会被纯逻辑模块与单测引用。
 */

import type { DecisionShape, ElkMergeEdges, ElkNodePlacement, LayoutEngine } from "./settings";
import type { ThemeDefinition } from "./themes";

/**
 * 一次渲染请求。
 *
 * 字段是**能力清单**而不是某个引擎的配置：实现方忽略自己没有对应概念的字段即可
 * （例如换到 Pele 后 `layout` / `elk*` / `decisionShape` 都失去着力点，实现里直接不读）。
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
 * 刻意不含「清缓存 / 让字体度量失效」这类方法：现在没有调用方，加进来就是死代码。
 * 换到 Pele 时它需要 `forgetTextWidths()` 才能重测字体，届时有真实调用方再往这里加。
 */
export interface RenderEngine {
	/** 同步查缓存；没有则返回 `null`，调用方应改用 `render`。 */
	peek(request: RenderRequest): RenderedDiagram | null;
	/** 渲染（命中缓存时立即返回）。 */
	render(request: RenderRequest): Promise<RenderedDiagram>;
}
