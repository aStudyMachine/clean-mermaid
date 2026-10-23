/**
 * SVG 字符串的通用处理：不依赖任何渲染引擎，也不依赖 `obsidian`。
 *
 * 放在这里而不是留在某个引擎实现里，是因为「SVG 字符串 → 可放进 `<img>` 的自包含文档」
 * 这一步换渲染器后依然要做（Pele 的根元素同样带 `max-width` 内联样式）。
 */

import type { RenderedDiagram } from "./render-engine";

/** 把 SVG 变成 `data:` URL —— 卡片走 `<img>` 展示与 PNG 导出都靠它。 */
export function svgToDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 给 SVG 根节点强制写上像素尺寸，放进 `<img>` 里表现才可预期。
 *
 * 三件事：① 从 `viewBox` 取自然尺寸并写成 `width`/`height` 属性（`<img>` 不认 `viewBox` 的自适应）；
 * ② 补 `xmlns` / `xmlns:xlink`，否则 data URL 里的 SVG 不算合法文档；
 * ③ 剥掉 `max-width` —— 那是「随容器缩」的语义，与本插件自己算 `computeFit` 缩放的做法冲突，
 * 留着会让 `<img>` 先被压一次、我们再缩一次。
 *
 * 解析失败（不是 `<svg>`）时原样返回、尺寸记 0，由调用方决定怎么降级。
 */
export function normalizeSvg(svg: string): RenderedDiagram {
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	const el = doc.documentElement;
	if (!el || el.nodeName.toLowerCase() !== "svg") {
		return { svg, width: 0, height: 0 };
	}

	let width = 0;
	let height = 0;
	const viewBox = el.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox.trim().split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
			width = parts[2];
			height = parts[3];
		}
	}
	if (!width || !height) {
		width = Number.parseFloat(el.getAttribute("width") ?? "") || 800;
		height = Number.parseFloat(el.getAttribute("height") ?? "") || 600;
	}

	el.setAttribute("width", String(width));
	el.setAttribute("height", String(height));
	el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	if (!el.getAttribute("xmlns:xlink")) {
		el.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
	}
	const style = el.getAttribute("style");
	if (style && /max-width/i.test(style)) {
		el.setAttribute("style", style.replace(/max-width\s*:[^;]*;?/gi, "").trim());
	}

	return { svg: new XMLSerializer().serializeToString(el), width, height };
}
