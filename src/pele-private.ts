import { detectType, forgetTextWidths, parse, register, render, type RenderOptions } from "pele/core";
import classDiagram from "pele/diagrams/class";
import er from "pele/diagrams/er";
import flowchart from "pele/diagrams/flowchart";
import requirement from "pele/diagrams/requirement";
import state from "pele/diagrams/state";
import usecase from "pele/diagrams/usecase";
import { applyDagreLayout, applyElkLayout } from "./pele-layout";
import { withPeleLayout, type PeleLayoutJob, type PeleLayoutSize } from "./pele-layout-hooks";
import type { sourcePeleConfig } from "./pele-theme";
import type { PeleRuntime } from "./pele-types";
import type { RenderRequest } from "./render-engine";

const diagrams = [flowchart, state, classDiagram, er, requirement, usecase];
register(...diagrams);
const supported = new Set(diagrams.map((diagram) => diagram.type));
export { forgetTextWidths as forgetPrivatePeleTextWidths };

type Result = ReturnType<PeleRuntime["render"]>;
type Options = Parameters<PeleRuntime["render"]>[1];
type Plan = { job: PeleLayoutJob; size: PeleLayoutSize };

function applyPlan(target: PeleLayoutJob, { job, size }: Plan): PeleLayoutSize {
	job[0].forEach(({ x, y, w, h }, index) => Object.assign(target[0][index], { x, y, w, h }));
	job[1].forEach(({ route, labelX, labelY }, index) =>
		Object.assign(target[1][index], { route: [...route], labelX, labelY }),
	);
	return size;
}

async function drawWithElk(draw: () => Result, compact: boolean, request: RenderRequest): Promise<Result> {
	const plans = new Map<string, Plan>();
	const interrupted = new Error("ELK layout input captured");
	// 目前固定配置下一次即可。保留有限重放，兼容 Pele 的多轮布局。
	for (let pass = 0; pass < 5; pass++) {
		const capture: { key?: string; job?: PeleLayoutJob } = {};
		try {
			return withPeleLayout(compact, (...job) => {
				if (job[0].length === 0) return;
				const key = JSON.stringify(job);
				const plan = plans.get(key);
				if (plan) return applyPlan(job, plan);
				capture.key = key;
				capture.job = structuredClone(job);
				throw interrupted;
			}, draw);
		} catch (error) {
			// Pele 会包装布局中抛出的错误，使用同轮捕获结果识别正常中断。
			if (!capture.key || !capture.job) throw error;
			const size = await applyElkLayout(capture.job, request);
			plans.set(capture.key, { job: capture.job, size });
		}
	}
	throw new Error("Too many Pele layout passes");
}

export function renderPrivatePele(
	request: RenderRequest, options: Options, source: ReturnType<typeof sourcePeleConfig>,
): Result | Promise<Result> | undefined {
	if (request.plain) return;
	const type = detectType(request.code);
	if (!type || !supported.has(type)) return;
	const compact = type === "flowchart" && request.decisionShape === "compact";
	const explicitLayout = source.layout === "elk" || source.layout === "dagre" || source.layout === "pele"
		? source.layout : undefined;
	const selected = explicitLayout ?? request.layout;
	if (selected === "pele" && !compact && (type !== "flowchart" || !/^[\t ]*flowchart-elk\b/m.test(request.code))) return;
	// 配色来自内置主题或 Obsidian 保存的 JSON，都是 Pele 配置允许的数据值。
	const config = options.config as RenderOptions["config"];
	const model = parse(request.code, { config });
	const layout = explicitLayout ?? (model.mermaidType === "flowchart-elk" ? "elk" : selected);
	if (layout === "pele" && !compact) return;
	const draw = () => render(model, { ...options, config });
	if (layout === "elk") {
		const { mergeEdges, nodePlacementStrategy } = source.elk;
		return drawWithElk(draw, compact, {
			...request,
			elkMergeEdges: typeof mergeEdges === "boolean" ? mergeEdges ? "on" : "off" : request.elkMergeEdges,
			elkNodePlacement: nodePlacementStrategy === "NETWORK_SIMPLEX" || nodePlacementStrategy === "BRANDES_KOEPF" ||
				nodePlacementStrategy === "LINEAR_SEGMENTS" || nodePlacementStrategy === "SIMPLE"
				? nodePlacementStrategy : request.elkNodePlacement,
		}).catch((error: unknown) => {
			console.warn("[clean-mermaid] ELK could not lay out a diagram; using Pele layout", error);
			return withPeleLayout(compact, undefined, draw);
		});
	}
	if (layout === "dagre") {
		return withPeleLayout(compact, (...target) => {
			if (target[0].length === 0) return;
			const job = structuredClone(target);
			try {
				const size = applyDagreLayout(job);
				if (size) return applyPlan(target, { job, size });
			} catch (error) {
				console.warn("[clean-mermaid] Dagre could not lay out a diagram; using Pele layout", error);
			}
		}, draw);
	}
	return withPeleLayout(compact, undefined, draw);
}
