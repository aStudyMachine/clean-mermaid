/**
 * 组合根：决定「当前用哪个渲染引擎」。
 *
 * 上层（卡片 / 导出 / 查看器 / 浏览器验证页）一律从这里拿能力，不直接 import 任何引擎实现，
 * 也不 import `mermaid`。具体引擎与生命周期入口在此集中。
 *
 * 当前实验实现以 Pele 绘图；旧 Mermaid 实现只保留作基线，不进入生产依赖图。
 */

import { peleEngine } from "./pele-runtime";
import type { RenderEngine, RenderRequest, RenderedDiagram } from "./render-engine";

export type { RenderEngine, RenderRequest, RenderedDiagram };

export { initializePele, invalidatePele, peleRevision } from "./pele-runtime";

const engine: RenderEngine = peleEngine;

/** 同步查缓存；没有则返回 `null`，调用方应改用 `render`。 */
export function peekRendered(request: RenderRequest): RenderedDiagram | null {
	return engine.peek(request);
}

/** 渲染（命中缓存时立即返回）。 */
export function renderDiagram(request: RenderRequest): RenderedDiagram | Promise<RenderedDiagram> {
	return engine.render(request);
}
