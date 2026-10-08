/**
 * 两个捕获入口共用的工具：把 SVG 定尺寸、栅格化成 PNG base64、POST 回本地服务。
 *
 * `rasteriseToPng` 是 `src/export.ts:32`（`svgToPngBlob`）的 harness 局部副本 —— 那边 import 了
 * `obsidian`（该包只有类型声明），浏览器 bundle 引不进来。改动导出逻辑时记得这里可能漂移。
 */

const XML_HEADER = /^<\?xml[^>]*\?>/;

export interface SizedSvg {
	svg: string;
	width: number;
	height: number;
}

/** 补上显式 width/height 与 xmlns，并去掉 max-width —— `<img>` 里的 SVG 需要自报尺寸。 */
export function sizeSvg(input: string): SizedSvg {
	const svg = XML_HEADER.test(input) ? input.replace(XML_HEADER, "") : input;
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	const el = doc.documentElement;
	if (!el || el.nodeName.toLowerCase() !== "svg") {
		throw new Error("渲染结果不是 SVG");
	}

	let width = Number.parseFloat(el.getAttribute("width") ?? "") || 0;
	let height = Number.parseFloat(el.getAttribute("height") ?? "") || 0;
	const viewBox = el.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox.trim().split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
			width = parts[2];
			height = parts[3];
		}
	}
	if (!width || !height) {
		throw new Error(`无法确定图表尺寸（viewBox=${viewBox ?? "无"}）`);
	}

	el.setAttribute("width", String(width));
	el.setAttribute("height", String(height));
	el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	const style = el.getAttribute("style");
	if (style && /max-width/i.test(style)) {
		el.setAttribute("style", style.replace(/max-width\s*:[^;]*;?/gi, "").trim());
	}

	return { svg: new XMLSerializer().serializeToString(el), width, height };
}

/** 在 SVG 根上定义一个 CSS 变量，让 `<img>` 里的 `var(--x)` 能解析。 */
export function defineCssVar(svg: SizedSvg, name: string, value: string): SizedSvg {
	const style = `:root{--${name}:${value};}`;
	return { ...svg, svg: svg.svg.replace(/^(<svg[^>]*>)/, `$1<style>${style}</style>`) };
}

function toDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("SVG 解码失败"));
		image.src = url;
	});
}

/** 2× 栅格化，返回不含 data: 前缀的 base64。 */
export async function rasteriseToPng(sized: SizedSvg, background: string, scale = 2): Promise<string> {
	const image = await loadImage(toDataUrl(sized.svg));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(sized.width * scale));
	canvas.height = Math.max(1, Math.round(sized.height * scale));
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("无法创建 Canvas 2D 上下文");
	}
	context.fillStyle = background;
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 0, 0, canvas.width, canvas.height);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("PNG 编码失败"))), "image/png");
	});
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("PNG 读取失败"));
		reader.readAsDataURL(blob);
	});
	return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export async function postJson(body: unknown): Promise<void> {
	const response = await fetch("/save", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`POST /save 失败：${response.status}`);
	}
}

export function showError(message: string): void {
	const out = document.getElementById("out");
	if (out) {
		out.textContent = message;
	}
}
