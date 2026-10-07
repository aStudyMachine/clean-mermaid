import { App, Notice, Platform, normalizePath } from "obsidian";
import { svgToDataUrl, type RenderedDiagram } from "./mermaid-runtime";

/** Maximum pixel area we allow on the export canvas (memory guard). */
const MAX_CANVAS_PIXELS = 40_000_000;

export interface PngExportOptions {
	width: number;
	height: number;
	scale: number;
	/** `null` keeps the background transparent. */
	background: string | null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to decode the diagram image"));
		image.src = url;
	});
}

/** Rasterises the diagram SVG into a PNG blob. */
export async function svgToPngBlob(svg: string, options: PngExportOptions): Promise<Blob> {
	const image = await loadImage(svgToDataUrl(svg));

	let scale = Math.max(0.1, options.scale);
	while (options.width * scale * options.height * scale > MAX_CANVAS_PIXELS && scale > 0.25) {
		scale = scale / 2;
	}

	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(options.width * scale));
	canvas.height = Math.max(1, Math.round(options.height * scale));
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Canvas 2D context is not available");
	}
	if (options.background) {
		context.fillStyle = options.background;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(image, 0, 0, canvas.width, canvas.height);

	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode the PNG"))),
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
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function saveTextToVault(app: App, text: string, filename: string): Promise<string> {
	const directory = app.workspace.getActiveFile()?.parent?.path ?? "";
	const path = normalizePath(directory ? `${directory}/${filename}` : filename);
	await app.vault.create(path, text);
	return path;
}

async function saveBinaryToVault(app: App, blob: Blob, filename: string): Promise<string> {
	const directory = app.workspace.getActiveFile()?.parent?.path ?? "";
	const path = normalizePath(directory ? `${directory}/${filename}` : filename);
	await app.vault.createBinary(path, await blob.arrayBuffer());
	return path;
}

/**
 * Desktop downloads the file; mobile (where downloads are unreliable) saves it into the vault
 * next to the active note instead.
 */
export async function saveOrDownload(app: App, blob: Blob, filename: string): Promise<void> {
	if (Platform.isMobile) {
		const path = await saveBinaryToVault(app, blob, filename);
		new Notice(`Clean Mermaid: saved to ${path}`);
		return;
	}
	downloadBlob(blob, filename);
}

export async function saveTextOrDownload(app: App, text: string, filename: string): Promise<void> {
	if (Platform.isMobile) {
		const path = await saveTextToVault(app, text, filename);
		new Notice(`Clean Mermaid: saved to ${path}`);
		return;
	}
	downloadBlob(new Blob([text], { type: "image/svg+xml" }), filename);
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

/** Shared by the inline toolbar and the fullscreen viewer. */
export async function exportDiagramPng(
	app: App,
	bundle: ExportBundle,
	scale: number,
): Promise<void> {
	try {
		const blob = await svgToPngBlob(bundle.rendered.svg, {
			width: bundle.rendered.width,
			height: bundle.rendered.height,
			scale,
			background: bundle.background,
		});
		await saveOrDownload(app, blob, timestampName("png"));
	} catch (error) {
		console.error("[clean-mermaid] PNG export failed", error);
		new Notice(`Clean Mermaid: PNG export failed — ${errorMessage(error)}`);
	}
}

export async function exportDiagramSvg(app: App, bundle: ExportBundle): Promise<void> {
	try {
		await saveTextOrDownload(app, svgWithXmlHeader(bundle.rendered.svg), timestampName("svg"));
	} catch (error) {
		console.error("[clean-mermaid] SVG export failed", error);
		new Notice(`Clean Mermaid: SVG export failed — ${errorMessage(error)}`);
	}
}

export async function copyDiagramPng(app: App, bundle: ExportBundle, scale: number): Promise<void> {
	try {
		const blob = await svgToPngBlob(bundle.rendered.svg, {
			width: bundle.rendered.width,
			height: bundle.rendered.height,
			scale,
			background: bundle.background,
		});
		await copyPngBlob(blob);
		new Notice("Clean Mermaid: image copied to clipboard");
	} catch (error) {
		console.error("[clean-mermaid] copying the image failed", error);
		new Notice("Clean Mermaid: could not copy the image, copied the SVG source instead");
		await copyText(svgWithXmlHeader(bundle.rendered.svg));
	}
}

export async function copyDiagramSource(bundle: ExportBundle): Promise<void> {
	try {
		await copyText(bundle.source);
		new Notice("Clean Mermaid: diagram source copied");
	} catch (error) {
		console.error("[clean-mermaid] copying the source failed", error);
		new Notice("Clean Mermaid: could not access the clipboard");
	}
}