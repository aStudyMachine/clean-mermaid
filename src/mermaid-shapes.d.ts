/**
 * mermaid 内部形状表的类型声明。
 *
 * 被声明的模块路径带 mermaid 构建产物的哈希文件名。升级 mermaid 时这条 import 会在构建期
 * 直接解析失败 —— 这是刻意的：文件名变了通常意味着打包分块也变了，`question` 处理器的契约
 * 必须重新核对后再放行，不要改成动态 require 之类的兜底把它糊过去。
 */
declare module "mermaid/dist/chunks/mermaid.core/chunk-XC4XBNZT.mjs" {
	export interface ChunkShapePoint {
		x: number;
		y: number;
	}

	export interface ChunkShapeBox {
		width: number;
		height: number;
	}

	/** 只声明本轮包装 `question` 时用得到的字段。 */
	export interface ChunkShapeNode extends ChunkShapeBox {
		padding?: number;
		calcIntersect?: (bounds: ChunkShapeNode, point: ChunkShapePoint) => ChunkShapePoint;
		intersect?: (point: ChunkShapePoint) => ChunkShapePoint;
	}

	/** d3 selection 的最小结构声明：本轮只用到 select / node / attr 与 empty。 */
	export interface ChunkSelection {
		select(selector: string): ChunkSelection;
		node(): Element | null;
		attr(name: string, value: string): ChunkSelection;
		empty(): boolean;
	}

	/** 渲染期由 mermaid 传入的配置快照；`theme` 已合并本次 init 指令。 */
	export interface ChunkShapeRenderOptions {
		config?: {
			theme?: string;
		};
	}

	export type ChunkShapeHandler = (
		parent: ChunkSelection,
		node: ChunkShapeNode,
		renderOptions?: ChunkShapeRenderOptions,
	) => Promise<ChunkSelection>;

	export const shapes: Record<string, ChunkShapeHandler>;

	export function updateNodeBounds(node: ChunkShapeNode, element: ChunkSelection): void;

	export const intersect_default: {
		polygon(
			node: ChunkShapeNode,
			polyPoints: ChunkShapePoint[],
			point: ChunkShapePoint,
		): ChunkShapePoint;
	};
}
