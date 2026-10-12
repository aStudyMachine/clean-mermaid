import { describe, expect, it } from "vitest";
import {
	DECISION_MAX_ASPECT,
	DECISION_MIN_ASPECT,
	decisionBox,
	decisionPoints,
	legacyDecisionBox,
	type ShapeBox,
} from "../src/decision-shape";

/** 单行与两行的现实标签，加上几个边界值。 */
const CASES: Array<[number, number, number]> = [
	[1, 1, 0],
	[1, 1, 12],
	[24, 20, 12],
	[70, 20, 12],
	[140, 20, 12],
	[400, 20, 12],
	[400, 40, 12],
	[400, 400, 12],
	[800, 1, 0],
];

/** 文字框 w×h 中心对齐地落在包围盒为 width×height 的菱形内，当且仅当 w/宽 + h/高 <= 1。 */
function textFitsInside(labelWidth: number, labelHeight: number, box: ShapeBox): number {
	return labelWidth / box.width + labelHeight / box.height;
}

describe("decisionBox", () => {
	it("always keeps the whole label box inside the rhombus", () => {
		for (const [w, h, p] of CASES) {
			expect(textFitsInside(w, h, decisionBox(w, h, p)), `${w}x${h} p=${p}`).toBeLessThanOrEqual(
				1 + 1e-9,
			);
		}
	});

	it("stays inside the clamped aspect band", () => {
		for (const [w, h, p] of CASES) {
			const box = decisionBox(w, h, p);
			const aspect = box.width / box.height;
			expect(aspect).toBeGreaterThanOrEqual(DECISION_MIN_ASPECT - 1e-9);
			expect(aspect).toBeLessThanOrEqual(DECISION_MAX_ASPECT + 1e-9);
		}
	});

	it("is never taller than mermaid's square diamond", () => {
		for (const [w, h, p] of CASES) {
			expect(decisionBox(w, h, p).height).toBeLessThanOrEqual(
				legacyDecisionBox(w, h, p).height + 1e-9,
			);
		}
	});

	it("is markedly smaller than the square diamond for real flowchart labels", () => {
		// 空白倍数的理论下限是 2.0（文字四角正好顶到斜边）。
		// 只有宽高比夹取没生效的标签能贴着它：夹取是拿面积换观感统一。
		for (const [w, h] of [
			[70, 20],
			[140, 20],
		] as const) {
			const box = decisionBox(w, h, 12);
			expect((box.width * box.height) / 2 / (w * h)).toBeLessThan(2.4);
		}

		// 夹取生效的长标签仍然要明显好过 mermaid 的正方形。
		for (const [w, h] of [
			[400, 20],
			[400, 40],
		] as const) {
			const box = decisionBox(w, h, 12);
			const legacy = legacyDecisionBox(w, h, 12);
			expect((box.width * box.height) / 2).toBeLessThan((legacy.width * legacy.height) / 2 / 1.8);
		}
	});

	it("grows monotonically with the label in both axes", () => {
		let previous = decisionBox(140, 10, 12);
		for (const height of [20, 40, 60, 120]) {
			const box = decisionBox(140, height, 12);
			expect(box.height).toBeGreaterThan(previous.height);
			expect(box.width).toBeGreaterThanOrEqual(previous.width);
			previous = box;
		}
	});

	it("pins the geometry the maintainer signed off on", () => {
		const round = (box: ShapeBox) => [
			Number(box.width.toFixed(1)),
			Number(box.height.toFixed(1)),
		];

		// 团成功? / 拼团订单? / 业务仍可接受付款? —— 改公式时这里是观感的回归锚点。
		expect(round(decisionBox(70, 20, 12))).toEqual([112.7, 52.8]);
		expect(round(decisionBox(95, 20, 12))).toEqual([149.1, 55.1]);
		expect(round(decisionBox(140, 20, 12))).toEqual([214.5, 57.6]);
	});
});

describe("decisionPoints", () => {
	it("traces a rhombus whose bounding box is exactly the requested box", () => {
		const box = decisionBox(140, 20, 12);
		const points = decisionPoints(box);

		const xs = points.map((point) => point.x);
		const ys = points.map((point) => point.y);
		expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(box.width, 8);
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(box.height, 8);
	});

	it("keeps mermaid's local coordinate convention of 0..width x -height..0", () => {
		const box = decisionBox(140, 20, 12);
		const points = decisionPoints(box);

		expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(-box.height, 8);
		expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(0, 8);
		expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(0, 8);
	});
});
