import { graphlib, layout as dagreLayout } from "@dagrejs/dagre";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkEdgeSection, ElkExtendedEdge, ElkNode, ElkPoint, LayoutOptions } from "elkjs/lib/elk-api";
import type { PeleLayoutEdge, PeleLayoutJob, PeleLayoutNode, PeleLayoutSize } from "./pele-layout-hooks";
import type { RenderRequest } from "./render-engine";

const elkDirections = { TB: "DOWN", BT: "UP", LR: "RIGHT", RL: "LEFT" };
let elk: InstanceType<typeof ELK> | undefined;

function coordinate(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) throw new Error("Invalid layout coordinate");
	return value;
}

function writeNode(node: PeleLayoutNode, x: number, y: number, w: number, h: number): void {
	if (node.isGroup && (w + 0.01 < node.minW || h + 0.01 < node.padTop + node.padBottom)) {
		throw new Error("Layout group is smaller than its title or padding");
	}
	Object.assign(node, { x: coordinate(x), y: coordinate(y), w: coordinate(w), h: coordinate(h) });
}

function writeEdge(edge: PeleLayoutEdge, points: ElkPoint[], labelX?: number, labelY?: number): void {
	const route: ElkPoint[] = [];
	for (const { x, y } of points) {
		const last = route[route.length - 1];
		if (!last || Math.hypot(x - last.x, y - last.y) > 0.005) route.push({ x: coordinate(x), y: coordinate(y) });
	}
	if (route.length < 2) throw new Error("Incomplete layout edge");
	edge.route = route.flatMap((point, index) => {
		const from = route[Math.max(0, index - 1)];
		const to = index ? point : route[1];
		return [point.x, point.y, Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? 1 : 0];
	});
	if (edge.labelW > 0 && edge.labelH > 0) {
		edge.labelX = coordinate(labelX);
		edge.labelY = coordinate(labelY);
	}
}

function elkRoute(sections: ElkEdgeSection[], offset: ElkPoint): ElkPoint[] {
	const byId = new Map(sections.map((section) => [section.id, section]));
	const points: ElkPoint[] = [];
	let section = sections.find((item) => !item.incomingSections?.length);
	for (let count = 0; section; count++) {
		const outgoing = section.outgoingSections ?? [];
		if (count >= sections.length || outgoing.length > 1) throw new Error("Invalid ELK edge sections");
		for (const p of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
			points.push({ x: p.x + offset.x, y: p.y + offset.y });
		}
		byId.delete(section.id);
		section = byId.get(outgoing[0]);
	}
	if (byId.size) throw new Error("Disconnected ELK edge sections");
	return points;
}

function parentGroups(nodes: PeleLayoutNode[], index: number): number[] {
	const parents: number[] = [];
	for (let parent = nodes[index].parent; parent >= 0; parent = nodes[parent].parent) {
		if (!nodes[parent]?.isGroup || parents.includes(parent)) throw new Error("Invalid Pele group hierarchy");
		parents.push(parent);
	}
	return parents;
}

export async function applyElkLayout(
	[nodes, edges, direction, options]: PeleLayoutJob,
	{ elkMergeEdges, elkNodePlacement }: Pick<RenderRequest, "elkMergeEdges" | "elkNodePlacement">,
): Promise<PeleLayoutSize> {
	// ELK 的 INCLUDE_CHILDREN 统一使用根布局方向，交还 Pele 以保留组内显式方向。
	if (nodes.some((node) => node.dir && node.dir !== direction)) {
		throw new Error("ELK cannot preserve differing subgraph directions");
	}
	const spacing: LayoutOptions = {
		"elk.spacing.nodeNode": String(options.nodeSep ?? 24),
		"elk.layered.spacing.nodeNodeBetweenLayers": String(options.rankSep ?? 48),
		"elk.spacing.edgeEdge": String(options.edgeSep ?? 12),
		"elk.layered.spacing.edgeEdgeBetweenLayers": String(options.edgeSep ?? 12),
		"elk.spacing.portPort": String(options.portSep ?? 20),
	};
	const settings: LayoutOptions = {
		...spacing, "elk.algorithm": "layered", "elk.direction": elkDirections[direction],
		"elk.edgeRouting": "ORTHOGONAL", "elk.hierarchyHandling": "INCLUDE_CHILDREN",
		"elk.padding": "[top=0,left=0,bottom=0,right=0]",
	};
	if (elkMergeEdges !== "default") settings["elk.layered.mergeEdges"] = String(elkMergeEdges === "on");
	if (elkNodePlacement !== "default") settings["elk.layered.nodePlacement.strategy"] = elkNodePlacement;
	const root: ElkNode = { id: "root", children: [], edges: [], layoutOptions: settings };
	const groups = nodes.map((_, index) => parentGroups(nodes, index));
	const filledGroups = new Set(groups.map(([parent]) => parent));
	const vertical = direction === "TB" || direction === "BT";
	const children = nodes.map<ElkNode>((node, index) => {
		const child = { id: String(index), width: node.w, height: node.h };
		if (!node.isGroup) return child;
		if (!filledGroups.has(index)) {
			return { ...child, width: Math.max(node.w, node.minW), height: Math.max(node.h, node.padTop + node.padBottom) };
		}
		return {
			...child,
			children: [], edges: [],
			layoutOptions: {
				...spacing,
				"elk.padding": `[top=${node.padTop},left=${node.padX},bottom=${node.padBottom},right=${node.padX}]`,
				"elk.nodeSize.constraints": "[MINIMUM_SIZE]",
				// 分层算法沿水平方向计算尺寸，竖向出图时会交换组框的轴。
				"elk.nodeSize.minimum": vertical ? `(0, ${node.minW})` : `(${node.minW}, 0)`,
			},
		};
	});
	for (const [index, child] of children.entries()) {
		(children[groups[index][0]] ?? root).children!.push(child);
	}
	for (const [index, edge] of edges.entries()) {
		// Pele 在绘图层管理自环和预留空间，布局只负责其余边。
		if (edge.src === edge.dst) continue;
		const parent = groups[edge.src].find((group) => groups[edge.dst].includes(group));
		const item: ElkExtendedEdge = { id: String(index), sources: [String(edge.src)], targets: [String(edge.dst)] };
		// ELK 0.9.3 会忽略无文本标签的坐标，Pele 绘图时仍使用原文。
		if (edge.labelW > 0 && edge.labelH > 0) item.labels = [{
			text: "label", width: edge.labelW, height: edge.labelH,
			layoutOptions: { "elk.edgeLabels.inline": "true", "elk.edgeLabels.placement": "CENTER" },
		}];
		(parent === undefined ? root : children[parent]).edges!.push(item);
	}

	elk ??= new ELK({ algorithms: ["layered"] });
	const result = await elk.layout(root);
	let writtenNodes = 0;
	let writtenEdges = 0;
	function apply(node: ElkNode, x: number, y: number): void {
		if (node.id !== root.id) {
			const w = coordinate(node.width);
			const h = coordinate(node.height);
			writeNode(nodes[Number(node.id)], x + w / 2, y + h / 2, w, h);
			writtenNodes++;
		}
		for (const item of node.edges ?? []) {
			const edge = edges[Number(item.id)];
			const label = item.labels?.[0];
			writeEdge(edge, elkRoute(item.sections ?? [], { x, y }),
				label ? x + coordinate(label.x) + edge.labelW / 2 : undefined,
				label ? y + coordinate(label.y) + edge.labelH / 2 : undefined);
			writtenEdges++;
		}
		for (const child of node.children ?? []) apply(child, x + coordinate(child.x), y + coordinate(child.y));
	}
	apply(result, 0, 0);
	if (writtenNodes !== nodes.length || writtenEdges !== edges.filter((edge) => edge.src !== edge.dst).length) {
		throw new Error("ELK omitted part of the graph");
	}
	return { width: coordinate(result.width), height: coordinate(result.height) };
}

export function applyDagreLayout([nodes, edges, direction, options]: PeleLayoutJob): PeleLayoutSize | undefined {
	// Dagre 的复合图只提供一个方向，也不支持把组框直接作为边端点。
	if (nodes.some((node) => node.dir && node.dir !== direction) ||
		edges.some((edge) => nodes[edge.src].isGroup || nodes[edge.dst].isGroup)) return;
	const graph = new graphlib.Graph({ compound: true, multigraph: true }).setGraph({
		rankdir: direction, nodesep: options.nodeSep ?? 24, ranksep: options.rankSep ?? 48, edgesep: options.edgeSep ?? 12,
	});
	for (const [index, node] of nodes.entries()) {
		graph.setNode(String(index), {
			width: node.isGroup ? Math.max(node.w, node.minW) : node.w,
			height: node.isGroup ? Math.max(node.h, node.padTop + node.padBottom) : node.h,
		});
	}
	for (const [index, node] of nodes.entries()) {
		if (node.parent >= 0) graph.setParent(String(index), String(node.parent));
	}
	for (const [index, edge] of edges.entries()) {
		if (edge.src === edge.dst) continue;
		graph.setEdge(String(edge.src), String(edge.dst), {
			minlen: edge.minlen, width: edge.labelW, height: edge.labelH, labelpos: "c",
		}, String(index));
	}
	dagreLayout(graph);
	const { width, height } = graph.graph();
	for (const [index, node] of nodes.entries()) {
		const result = graph.node(String(index));
		writeNode(node, result.x, result.y, result.width, result.height);
	}
	for (const id of graph.edges()) {
		const result = graph.edge(id);
		writeEdge(edges[Number(id.name)], result.points, result.x, result.y);
	}
	return { width: coordinate(width), height: coordinate(height) };
}
