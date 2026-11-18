import { decisionBox } from "./decision-shape";

export type PeleDirection = "TB" | "BT" | "LR" | "RL";

export interface PeleLayoutNode {
	w: number;
	h: number;
	x: number;
	y: number;
	parent: number;
	isGroup: boolean;
	dir?: PeleDirection;
	padTop: number;
	padBottom: number;
	padX: number;
	minW: number;
}

export interface PeleLayoutEdge {
	src: number;
	dst: number;
	minlen: number;
	labelW: number;
	labelH: number;
	route: number[];
	labelX: number;
	labelY: number;
}

export interface PeleLayoutOptions {
	nodeSep?: number;
	rankSep?: number;
	edgeSep?: number;
	portSep?: number;
}

export type PeleLayoutJob = [
	nodes: PeleLayoutNode[],
	edges: PeleLayoutEdge[],
	direction: PeleDirection,
	options: PeleLayoutOptions,
];

export interface PeleLayoutSize { width: number; height: number }
export type PeleLayoutHook = (...job: PeleLayoutJob) => PeleLayoutSize | undefined;

let layout: PeleLayoutHook | undefined;
let compact = false;

// Pele 在同一个同步调用内测量并绘制。安装钩子的调用不跨 await。
export function withPeleLayout<T>(useCompact: boolean, hook: PeleLayoutHook | undefined, draw: () => T): T {
	const previousLayout = layout;
	const previousCompact = compact;
	layout = hook;
	compact = useCompact;
	try {
		return draw();
	} finally {
		layout = previousLayout;
		compact = previousCompact;
	}
}

export function resolvePeleLayout(...job: PeleLayoutJob): PeleLayoutSize | undefined {
	return layout?.(...job);
}

export function resolvePeleDiamond(width: number, height: number): { w: number; h: number; dy: number } | undefined {
	if (!compact) return;
	const box = decisionBox(width, height, 8);
	return { w: box.width, h: box.height, dy: 0 };
}
