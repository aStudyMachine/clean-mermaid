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