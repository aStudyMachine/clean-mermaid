import { App, Modal, setIcon } from "obsidian";
import type CleanMermaidPlugin from "./main";
import { clamp, MAX_SCALE, MIN_SCALE } from "./fit";
import { svgToDataUrl, type RenderedDiagram } from "./mermaid-runtime";
import { exportDiagramPng, exportDiagramSvg, type ExportBundle } from "./export";

export interface ViewerData {
	rendered: RenderedDiagram;
	background: string | null;
	source: string;
}

interface Point {
	x: number;
	y: number;
}

/** 由图表上的 ⤢ 按钮打开的全屏平移/缩放查看器。 */
export class DiagramViewerModal extends Modal {
	private readonly plugin: CleanMermaidPlugin;
	private readonly data: ViewerData;

	private stageEl!: HTMLDivElement;
	private mediaEl!: HTMLImageElement;
	private zoomLabelEl!: HTMLSpanElement;
	private readonly pointers = new Map<number, Point>();
	private pinch: { distance: number; zoom: number } | null = null;
	private dragging = false;
	private dragStart: Point = { x: 0, y: 0 };
	private dragOrigin: Point = { x: 0, y: 0 };

	private zoom = 1;
	private tx = 0;
	private ty = 0;

	constructor(app: App, plugin: CleanMermaidPlugin, data: ViewerData) {
		super(app);
		this.plugin = plugin;
		this.data = data;
	}

	onOpen(): void {
		this.modalEl.addClass("cm-modal");
		this.contentEl.empty();
		this.contentEl.addClass("cm-modal-content");
		this.titleEl.setText(this.plugin.t("Mermaid diagram", "Mermaid 图表"));

		this.buildToolbar();

		const stage = this.contentEl.createDiv({ cls: "cm-modal-stage" });
		stage.style.setProperty("--cm-modal-bg", this.data.background ?? "transparent");
		this.stageEl = stage;

		const media = stage.createEl("img", { cls: "cm-modal-media" });
		media.src = svgToDataUrl(this.data.rendered.svg);
		media.draggable = false;
		this.mediaEl = media;

		this.bindInteractions();

		this.scope.register([], "+", () => {
			this.zoomBy(1.25);
			return false;
		});
		this.scope.register(["Shift"], "=", () => {
			this.zoomBy(1.25);
			return false;
		});
		this.scope.register([], "-", () => {
			this.zoomBy(1 / 1.25);
			return false;
		});
		this.scope.register([], "0", () => {
			this.fit();
			return false;
		});

		window.requestAnimationFrame(() => this.fit());
	}

	onClose(): void {
		this.contentEl.empty();
		this.pointers.clear();
	}

	private buildToolbar(): void {
		const toolbar = this.contentEl.createDiv({ cls: "cm-modal-toolbar" });

		const addButton = (icon: string, label: string, action: () => void): HTMLButtonElement => {
			const button = toolbar.createEl("button", {
				cls: "cm-btn",
				attr: { "aria-label": label, title: label },
			});
			setIcon(button, icon);
			button.addEventListener("click", action);
			return button;
		};

		addButton("minus", this.plugin.t("Zoom out", "缩小"), () => this.zoomBy(1 / 1.25));

		this.zoomLabelEl = toolbar.createSpan({ cls: "cm-modal-zoom-label", text: "100%" });

		addButton("plus", this.plugin.t("Zoom in", "放大"), () => this.zoomBy(1.25));
		addButton("maximize", this.plugin.t("Fit to view", "适应窗口"), () => this.fit());

		const reset = toolbar.createEl("button", { cls: "cm-btn cm-btn-text", text: "100%" });
		reset.addEventListener("click", () => this.zoomTo(1));

		const spacer = toolbar.createDiv({ cls: "cm-toolbar-spacer" });
		spacer.setAttribute("aria-hidden", "true");

		const language = this.plugin.language;
		addButton("download", this.plugin.t("Download PNG", "下载 PNG"), () =>
			void exportDiagramPng(this.bundle(), this.plugin.settings.pngScale, language),
		);
		addButton("file-code", this.plugin.t("Download SVG", "下载 SVG"), () =>
			void exportDiagramSvg(this.bundle(), language),
		);
		addButton("x", this.plugin.t("Close", "关闭"), () => this.close());
	}

	private bindInteractions(): void {
		const stage = this.stageEl;

		stage.addEventListener(
			"wheel",
			(event: WheelEvent) => {
				// 查看器里没有别的可滚内容，普通滚轮也直接用来缩放。
				event.preventDefault();
				const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
				this.zoomAt(event.clientX, event.clientY, factor);
			},
			{ passive: false },
		);

		stage.addEventListener("pointerdown", (event: PointerEvent) => {
			if (event.button !== 0) {
				return;
			}
			stage.setPointerCapture(event.pointerId);
			this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (this.pointers.size === 1) {
				this.dragging = true;
				this.dragStart = { x: event.clientX, y: event.clientY };
				this.dragOrigin = { x: this.tx, y: this.ty };
				stage.addClass("cm-grabbing");
			} else if (this.pointers.size === 2) {
				this.dragging = false;
				this.pinch = { distance: this.pointerDistance(), zoom: this.zoom };
			}
		});

		stage.addEventListener("pointermove", (event: PointerEvent) => {
			if (!this.pointers.has(event.pointerId)) {
				return;
			}
			this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (this.pinch && this.pointers.size >= 2) {
				const distance = this.pointerDistance();
				if (this.pinch.distance > 0) {
					const factor = distance / this.pinch.distance;
					this.zoomTo(clamp(this.pinch.zoom * factor, MIN_SCALE, MAX_SCALE));
				}
				return;
			}

			if (this.dragging) {
				this.tx = this.dragOrigin.x + (event.clientX - this.dragStart.x);
				this.ty = this.dragOrigin.y + (event.clientY - this.dragStart.y);
				this.clampPan();
				this.applyTransform();
			}
		});

		const endPointer = (event: PointerEvent) => {
			this.pointers.delete(event.pointerId);
			if (this.pointers.size < 2) {
				this.pinch = null;
			}
			if (this.pointers.size === 0) {
				this.dragging = false;
				this.stageEl.removeClass("cm-grabbing");
			}
			try {
				stage.releasePointerCapture(event.pointerId);
			} catch {
				// 指针捕获可能已经被释放了。
			}
		};
		stage.addEventListener("pointerup", endPointer);
		stage.addEventListener("pointercancel", endPointer);

		stage.addEventListener("dblclick", () => this.fit());
	}

	private pointerDistance(): number {
		const points = [...this.pointers.values()];
		if (points.length < 2) {
			return 0;
		}
		return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
	}

	private zoomBy(factor: number): void {
		const rect = this.stageEl.getBoundingClientRect();
		this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
	}

	private zoomAt(clientX: number, clientY: number, factor: number): void {
		const rect = this.stageEl.getBoundingClientRect();
		const centerX = clientX - rect.left - rect.width / 2;
		const centerY = clientY - rect.top - rect.height / 2;

		const oldZoom = this.zoom;
		const newZoom = clamp(oldZoom * factor, MIN_SCALE, MAX_SCALE);
		if (newZoom === oldZoom) {
			return;
		}
		const ratio = newZoom / oldZoom;
		this.tx = centerX - (centerX - this.tx) * ratio;
		this.ty = centerY - (centerY - this.ty) * ratio;
		this.zoom = newZoom;
		this.clampPan();
		this.applyTransform();
	}

	private zoomTo(zoom: number): void {
		const oldZoom = this.zoom;
		const newZoom = clamp(zoom, MIN_SCALE, MAX_SCALE);
		if (newZoom === oldZoom) {
			return;
		}
		const ratio = newZoom / oldZoom;
		this.tx = this.tx * ratio;
		this.ty = this.ty * ratio;
		this.zoom = newZoom;
		this.clampPan();
		this.applyTransform();
	}

	private fit(): void {
		const rect = this.stageEl.getBoundingClientRect();
		const { width, height } = this.data.rendered;
		if (!width || !height || !rect.width || !rect.height) {
			return;
		}
		this.tx = 0;
		this.ty = 0;
		this.zoom = clamp(Math.min(rect.width / width, rect.height / height, 1), MIN_SCALE, MAX_SCALE);
		this.applyTransform();
	}

	private clampPan(): void {
		const rect = this.stageEl.getBoundingClientRect();
		const displayW = this.data.rendered.width * this.zoom;
		const displayH = this.data.rendered.height * this.zoom;
		const maxX = Math.max(0, (displayW - rect.width) / 2);
		const maxY = Math.max(0, (displayH - rect.height) / 2);
		this.tx = clamp(this.tx, -maxX, maxX);
		this.ty = clamp(this.ty, -maxY, maxY);
	}

	private applyTransform(): void {
		const displayW = Math.max(1, Math.round(this.data.rendered.width * this.zoom));
		const displayH = Math.max(1, Math.round(this.data.rendered.height * this.zoom));
		this.mediaEl.style.width = `${displayW}px`;
		this.mediaEl.style.height = `${displayH}px`;
		this.mediaEl.style.transform = `translate(${Math.round(this.tx)}px, ${Math.round(this.ty)}px)`;
		this.zoomLabelEl.setText(`${Math.round(this.zoom * 100)}%`);
	}

	private bundle(): ExportBundle {
		return {
			rendered: this.data.rendered,
			background: this.data.background,
			source: this.data.source,
		};
	}
}