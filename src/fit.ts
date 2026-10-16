export type FitMode = "width" | "viewport" | "raw";

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export interface FitInput {
	/** 图表的自然宽度（px，取自 SVG viewBox）。 */
	naturalW: number;
	/** 图表的自然高度（px）。 */
	naturalH: number;
	/** 代码块可用宽度（px）。 */
	containerW: number;
	/** 当前视口高度（px）。 */
	viewportH: number;
	mode: FitMode;
	/** 放大的硬上限，比例值（1.5 = 150%）。 */
	maxUpscale: number;
	/** 渲染高度的硬上限，按视口高度的比例表示（0.8 = 80%）。 */
	maxHeightRatio: number;
}

/**
 * 纯函数：决定图表的初始显示缩放。
 * - "width"：按代码块宽度缩放（受 maxUpscale 与 maxHeightRatio 夹取）。
 * - "viewport"：同时装进代码块宽度和最大高度。
 * - "raw"：保持自然尺寸（永不放大），只有超出上限时才缩小。
 */
export function computeFit(input: FitInput): number {
	const { naturalW, naturalH, containerW, viewportH, mode, maxUpscale, maxHeightRatio } = input;
	if (naturalW <= 0 || naturalH <= 0 || containerW <= 0) {
		return 1;
	}

	const maxHeight = Math.max(viewportH * maxHeightRatio, 120);

	let scale: number;
	switch (mode) {
		case "raw":
			scale = 1;
			break;
		case "viewport":
			scale = Math.min(containerW / naturalW, maxHeight / naturalH);
			break;
		case "width":
		default:
			scale = containerW / naturalW;
			break;
	}

	if (mode !== "raw") {
		scale = Math.min(scale, maxUpscale);
	}
	// 高度上限对所有模式都生效，免得巨大的图表把整篇笔记挤掉。
	scale = Math.min(scale, maxHeight / naturalH);

	return clamp(scale, MIN_SCALE, MAX_SCALE);
}

export interface ViewerWindowSizeInput {
	/** 视口宽（px），通常取 `window.innerWidth`。 */
	viewportW: number;
	/** 视口高（px）。 */
	viewportH: number;
	/** 窗口最小宽（px）。 */
	minW: number;
	/** 窗口最小高（px）。 */
	minH: number;
	/** 窗口相对视口的宽向比例（0.92 = 92vw）。 */
	widthRatio: number;
	/** 窗口相对视口的高向比例。 */
	heightRatio: number;
}

/**
 * 纯函数：查看器打开时的默认窗口尺寸＝视口上限。
 * 窗口不再由图表尺寸决定 —— 反过来先铺开窗口，再由查看器的 `fit()` 把图缩放着装进去。
 * 视口极小时最小值优先（宁可窗口略溢出，也不能把工具栏挤到不可用）；窗口后续的
 * 拖拽缩放仍被 [min, 视口上限] 夹取。
 */
export function computeViewerWindowSize(input: ViewerWindowSizeInput): { width: number; height: number } {
	return {
		width: Math.max(input.minW, Math.round(input.viewportW * input.widthRatio)),
		height: Math.max(input.minH, Math.round(input.viewportH * input.heightRatio)),
	};
}