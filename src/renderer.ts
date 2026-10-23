/**
 * 组合根：决定「当前用哪个渲染引擎」。
 *
 * 上层（卡片 / 导出 / 查看器 / 浏览器验证页）一律从这里拿能力，不直接 import 任何引擎实现，
 * 也不 import `mermaid`。换引擎时只改这一个文件的 import 与 `engine` 常量。
 *
 * 当前实现：mermaid（`./mermaid-runtime`）。替换为 Pele 的方案与实测依据见
 * docs/pele-migration.md —— 那时这里换成 `./renderer-pele` 即可，上层一行不用动。
 */

import { mermaidEngine } from "./mermaid-runtime";
import type { RenderEngine, RenderRequest, RenderedDiagram } from "./render-engine";

export type { RenderEngine, RenderRequest, RenderedDiagram };

const engine: RenderEngine = mermaidEngine;

/** 同步查缓存；没有则返回 `null`，调用方应改用 `render`。 */
export function peekRendered(request: RenderRequest): RenderedDiagram | null {
	return engine.peek(request);
}

/** 渲染（命中缓存时立即返回）。 */
export function renderDiagram(request: RenderRequest): Promise<RenderedDiagram> {
	return engine.render(request);
}
