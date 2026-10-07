import { describe, expect, it } from "vitest";
import { clamp, computeFit, MAX_SCALE, MIN_SCALE, type FitInput } from "../src/fit";

const input = (over: Partial<FitInput> = {}): FitInput => ({
	naturalW: 400,
	naturalH: 100,
	containerW: 800,
	viewportH: 1000,
	mode: "width",
	maxUpscale: 1.5,
	maxHeightRatio: 0.8,
	...over,
});

describe("clamp", () => {
	it("pins values to both ends", () => {
		expect(clamp(5, 1, 3)).toBe(3);
		expect(clamp(0, 1, 3)).toBe(1);
		expect(clamp(2, 1, 3)).toBe(2);
	});
});

describe("computeFit", () => {
	it("fits width but respects the upscale ceiling", () => {
		// 800 / 400 = 2, capped by maxUpscale 1.5.
		expect(computeFit(input())).toBeCloseTo(1.5, 10);
		expect(computeFit(input({ maxUpscale: 3 }))).toBeCloseTo(2, 10);
	});

	it("shrinks to fit the width when no upscaling is needed", () => {
		// 800 / 1600 = 0.5.
		expect(computeFit(input({ naturalW: 1600, naturalH: 400 }))).toBeCloseTo(0.5, 10);
	});

	it("caps tall diagrams at the max share of the viewport", () => {
		// maxHeight = 1000 * 0.8 = 800, so 800 / 2000 = 0.4 beats the width fit of 2.
		expect(computeFit(input({ naturalH: 2000 }))).toBeCloseTo(0.4, 10);
	});

	it("keeps natural size in raw mode and never upscales", () => {
		expect(computeFit(input({ mode: "raw" }))).toBe(1);
		// Raw still shrinks an over-tall diagram, because the height cap applies to every mode.
		expect(computeFit(input({ mode: "raw", naturalH: 5000 }))).toBeCloseTo(0.16, 10);
		// A diagram narrower than the pane is not enlarged.
		expect(computeFit(input({ mode: "raw", naturalW: 100, naturalH: 50, containerW: 800 }))).toBe(1);
	});

	it("fits both dimensions in viewport mode", () => {
		// min(800/400, 800/1200) = 0.6667.
		expect(computeFit(input({ mode: "viewport", naturalH: 1200 }))).toBeCloseTo(8 / 12, 10);
	});

	it("never uses less than 120px of height allowance", () => {
		// Tiny viewport: maxHeight floors at 120, so 120 / 300 = 0.4.
		expect(computeFit(input({ viewportH: 10, naturalH: 300 }))).toBeCloseTo(0.4, 10);
	});

	it("stays inside the zoom limits", () => {
		const smallest = computeFit(input({ naturalW: 100, naturalH: 100000, containerW: 100, viewportH: 100 }));
		expect(smallest).toBe(MIN_SCALE);
		const biggest = computeFit(input({ naturalW: 1, naturalH: 1, containerW: 800, maxUpscale: 99 }));
		expect(biggest).toBeLessThanOrEqual(MAX_SCALE);
		expect(biggest).toBe(MAX_SCALE);
	});

	it("falls back to 1 for inputs that cannot be measured", () => {
		expect(computeFit(input({ naturalW: 0 }))).toBe(1);
		expect(computeFit(input({ naturalH: 0 }))).toBe(1);
		expect(computeFit(input({ containerW: 0 }))).toBe(1);
	});
});
