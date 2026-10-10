import { Notice } from "obsidian";
import { pick, type Language } from "./i18n";
import { svgToDataUrl, type RenderedDiagram } from "./mermaid-runtime";

/** 导出画布允许的最大像素面积（内存兜底）。 */
const MAX_CANVAS_PIXELS = 40_000_000;

export interface PngExportOptions {
	width: number;
	height: number;
	scale: number;
	/** `null` 表示背景保持透明。 */
	background: string | null;
	language: Language;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function loadImage(url: string, language: Language): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(new Error(pick(language, "Failed to decode the diagram image", "图表图片解码失败")));
		image.src = url;
	});
}

/** 把图表 SVG 栅格化成 PNG blob。 */
export async function svgToPngBlob(svg: string, options: PngExportOptions): Promise<Blob> {
	const image = await loadImage(svgToDataUrl(svg), options.language);

	let scale = Math.max(0.1, options.scale);
	while (options.width * scale * options.height * scale > MAX_CANVAS_PIXELS && scale > 0.25) {
		scale = scale / 2;
	}

	const canvas = createEl("canvas");
	canvas.width = Math.max(1, Math.round(options.width * scale));
	canvas.height = Math.max(1, Math.round(options.height * scale));
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error(
			pick(options.language, "Canvas 2D context is not available", "无法创建 Canvas 2D 上下文"),
		);
	}
	if (options.background) {
		context.fillStyle = options.background;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(image, 0, 0, canvas.width, canvas.height);

	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(
							new Error(pick(options.language, "Failed to encode the PNG", "PNG 编码失败")),
						),
			"image/png",
		);
	});
}

export function timestampName(extension: string): string {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	return `mermaid-${stamp}.${extension}`;
}

export function svgWithXmlHeader(svg: string): string {
	return svg.includes("<?xml") ? svg : `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = createEl("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyPngBlob(blob: Blob): Promise<void> {
	const clipboard = navigator.clipboard;
	if (!clipboard || typeof ClipboardItem === "undefined" || typeof clipboard.write !== "function") {
		throw new Error("Image clipboard is not available");
	}
	await clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function copyText(text: string): Promise<void> {
	await navigator.clipboard.writeText(text);
}

export interface ExportBundle {
	rendered: RenderedDiagram;
	background: string | null;
	source: string;
}

/** 内联工具条与全屏查看器共用。 */
export async function exportDiagramPng(
	bundle: ExportBundle,
	scale: number,
	language: Language,
): Promise<void> {
	try {
		const blob = await svgToPngBlob(bundle.rendered.svg, {
			width: bundle.rendered.width,
			height: bundle.rendered.height,
			scale,
			background: bundle.background,
			language,
		});
		downloadBlob(blob, timestampName("png"));
	} catch (error) {
		console.error("[clean-mermaid] PNG export failed", error);
		new Notice(
			pick(
				language,
				`Clean Mermaid: PNG export failed — ${errorMessage(error)}`,
				`Clean Mermaid：PNG 导出失败 — ${errorMessage(error)}`,
			),
		);
	}
}

export async function exportDiagramSvg(bundle: ExportBundle, language: Language): Promise<void> {
	try {
		downloadBlob(
			new Blob([svgWithXmlHeader(bundle.rendered.svg)], { type: "image/svg+xml" }),
			timestampName("svg"),
		);
	} catch (error) {
		console.error("[clean-mermaid] SVG export failed", error);
		new Notice(
			pick(
				language,
				`Clean Mermaid: SVG export failed — ${errorMessage(error)}`,
				`Clean Mermaid：SVG 导出失败 — ${errorMessage(error)}`,
			),
		);
	}
}

export async function copyDiagramPng(
	bundle: ExportBundle,
	scale: number,
	language: Language,
): Promise<void> {
	try {
		const blob = await svgToPngBlob(bundle.rendered.svg, {
			width: bundle.rendered.width,
			height: bundle.rendered.height,
			scale,
			background: bundle.background,
			language,
		});
		await copyPngBlob(blob);
		new Notice(
			pick(language, "Clean Mermaid: image copied to clipboard", "Clean Mermaid：图片已复制到剪贴板"),
		);
	} catch (error) {
		console.error("[clean-mermaid] copying the image failed", error);
		new Notice(
			pick(
				language,
				"Clean Mermaid: could not copy the image, copied the SVG source instead",
				"Clean Mermaid：无法复制图片，已改为复制 SVG 源码",
			),
		);
		await copyText(svgWithXmlHeader(bundle.rendered.svg));
	}
}

export async function copyDiagramSource(bundle: ExportBundle, language: Language): Promise<void> {
	try {
		await copyText(bundle.source);
		new Notice(
			pick(language, "Clean Mermaid: diagram source copied", "Clean Mermaid：图表源码已复制"),
		);
	} catch (error) {
		console.error("[clean-mermaid] copying the source failed", error);
		new Notice(
			pick(language, "Clean Mermaid: could not access the clipboard", "Clean Mermaid：无法访问剪贴板"),
		);
	}
}