export type FitMode = "width" | "viewport" | "raw";

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export interface FitInput {
	/** Natural width of the diagram in px (from the SVG viewBox). */
	naturalW: number;
	/** Natural height of the diagram in px. */
	naturalH: number;
	/** Available width of the block in px. */
	containerW: number;
	/** Current viewport height in px. */
	viewportH: number;
	mode: FitMode;
	/** Hard cap for upscaling, as a ratio (1.5 = 150%). */
	maxUpscale: number;
	/** Hard cap for the rendered height, as a ratio of the viewport height (0.8 = 80%). */
	maxHeightRatio: number;
}

/**
 * Pure function that decides the initial display scale for a diagram.
 * - "width": scale to the block width (clamped by maxUpscale and maxHeightRatio).
 * - "viewport": fit into both the block width and the max height.
 * - "raw": keep the natural size (never upscale), only shrink if it is taller than the cap.
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
	// The height cap applies to every mode so a huge diagram never dominates the note.
	scale = Math.min(scale, maxHeight / naturalH);

	return clamp(scale, MIN_SCALE, MAX_SCALE);
}