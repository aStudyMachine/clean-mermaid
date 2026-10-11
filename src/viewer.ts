import { App, Modal, setIcon } from "obsidian";
import type CleanMermaidPlugin from "./main";
import { clamp, computeViewerWindowSize, MAX_SCALE, MIN_SCALE } from "./fit";
import { svgToDataUrl, type RenderedDiagram } from "./mermaid-runtime";
import { exportDiagramPng, exportDiagramSvg, type ExportBundle } from "./export";

/** 窗口允许的最小尺寸（px）；再小工具栏就不可用了。 */
const VIEWER_MIN_WIDTH = 480;
const VIEWER_MIN_HEIGHT = 360;
/** 窗口相对视口的上限，与 styles.css 里 .cm-modal 的 max-width / max-height 同一口径。 */
const VIEWER_MAX_WIDTH_RATIO = 0.92;
const VIEWER_MAX_HEIGHT_RATIO = 0.88;

export interface ViewerData {
	rendered: RenderedDiagram;
	background: string | null;
	source: string;
}

interface Point {
	x: number;
	y: number;
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface ResizeState {
	dir: ResizeDir;
	pointerId: number;
	startX: number;
	startY: number;
	startWidth: number;
	startHeight: number;
	startShiftX: number;
	startShiftY: number;
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
	private resizeState: ResizeState | null = null;

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

		// 默认窗口大小＝图表 100% 所需；此处若还量不到布局，rAF 里会重算一次。
		this.sizeToDiagram();
		this.buildResizeHandles();
		window.addEventListener("resize", this.onViewportResize);

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

		window.requestAnimationFrame(() => {
			this.sizeToDiagram();
			this.fit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		this.pointers.clear();
		this.resizeState = null;
		window.removeEventListener("resize", this.onViewportResize);
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

	/** 视口允许的窗口上限；用最小值兜底，避免极小视口时上限比下限还小。 */
	private viewportMaxSize(): { maxW: number; maxH: number } {
		return {
			maxW: Math.max(VIEWER_MIN_WIDTH, window.innerWidth * VIEWER_MAX_WIDTH_RATIO),
			maxH: Math.max(VIEWER_MIN_HEIGHT, window.innerHeight * VIEWER_MAX_HEIGHT_RATIO),
		};
	}

	/** 把窗口设为「图表 100% 所需 + 周边开销」，钳在最小尺寸与视口之间。 */
	private sizeToDiagram(): void {
		const { width, height } = this.data.rendered;
		if (!width || !height) {
			return;
		}
		const modal = this.modalEl;
		const stage = this.stageEl;
		// 未入树或还没布局时量不到 chrome，交给 rAF 里的重试。
		if (!modal.isConnected || !modal.offsetWidth || !stage.clientWidth) {
			return;
		}
		const { maxW, maxH } = this.viewportMaxSize();
		// chrome 用 clientWidth 差值来量：stage 的边框不计入图表空间，
		// 图表才能以 100% 恰好装满 stage 内容盒（fit 精确等于 1）。
		const { width: w, height: h } = computeViewerWindowSize({
			stageW: width,
			stageH: height,
			chromeW: modal.offsetWidth - stage.clientWidth,
			chromeH: modal.offsetHeight - stage.clientHeight,
			minW: VIEWER_MIN_WIDTH,
			minH: VIEWER_MIN_HEIGHT,
			maxW,
			maxH,
		});
		modal.style.width = `${w}px`;
		modal.style.height = `${h}px`;
	}

	private buildResizeHandles(): void {
		const dirs: ResizeDir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
		for (const dir of dirs) {
			const handle = this.modalEl.createDiv({ cls: `cm-modal-handle cm-modal-handle-${dir}` });
			handle.setAttribute("aria-hidden", "true");
			handle.addEventListener("pointerdown", (event: PointerEvent) => {
				if (event.button !== 0) {
					return;
				}
				event.preventDefault();
				const rect = this.modalEl.getBoundingClientRect();
				handle.setPointerCapture(event.pointerId);
				this.resizeState = {
					dir,
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					startWidth: rect.width,
					startHeight: rect.height,
					startShiftX: parseFloat(this.modalEl.style.left) || 0,
					startShiftY: parseFloat(this.modalEl.style.top) || 0,
				};
			});
			handle.addEventListener("pointermove", (event: PointerEvent) => {
				if (this.resizeState?.pointerId === event.pointerId) {
					this.resizeTo(event.clientX, event.clientY);
				}
			});
			const endResize = (event: PointerEvent) => {
				if (this.resizeState?.pointerId !== event.pointerId) {
					return;
				}
				this.resizeState = null;
				try {
					handle.releasePointerCapture(event.pointerId);
				} catch {
					// 指针捕获可能已经被释放了。
				}
			};
			handle.addEventListener("pointerup", endResize);
			handle.addEventListener("pointercancel", endResize);
		}
	}

	private resizeTo(clientX: number, clientY: number): void {
		const state = this.resizeState;
		if (!state) {
			return;
		}
		const { maxW, maxH } = this.viewportMaxSize();
		let width = state.startWidth;
		let height = state.startHeight;
		if (state.dir.includes("e")) {
			width += clientX - state.startX;
		}
		if (state.dir.includes("w")) {
			width -= clientX - state.startX;
		}
		if (state.dir.includes("s")) {
			height += clientY - state.startY;
		}
		if (state.dir.includes("n")) {
			height -= clientY - state.startY;
		}
		width = clamp(width, VIEWER_MIN_WIDTH, maxW);
		height = clamp(height, VIEWER_MIN_HEIGHT, maxH);

		const modal = this.modalEl;
		modal.style.width = `${Math.round(width)}px`;
		modal.style.height = `${Math.round(height)}px`;

		// 弹层被 flex 居中：宽高各变 Δ，两边就各让出 Δ/2。按拖拽方向用相对偏移补回 Δ/2，
		// 被锚定的对边就能保持原地不动（原生窗口手感）。偏移累计在 style.left/top 上。
		const dw = width - state.startWidth;
		const dh = height - state.startHeight;
		let shiftX = state.startShiftX;
		let shiftY = state.startShiftY;
		if (state.dir.includes("e")) {
			shiftX += dw / 2;
		}
		if (state.dir.includes("w")) {
			shiftX -= dw / 2;
		}
		if (state.dir.includes("s")) {
			shiftY += dh / 2;
		}
		if (state.dir.includes("n")) {
			shiftY -= dh / 2;
		}
		modal.style.left = `${Math.round(shiftX)}px`;
		modal.style.top = `${Math.round(shiftY)}px`;

		// 缩放保持不动，只按新 stage 尺寸重算平移限位。
		this.clampPan();
		this.applyTransform();
	}

	private onViewportResize = (): void => {
		const { maxW, maxH } = this.viewportMaxSize();
		const modal = this.modalEl;
		if (modal.offsetWidth > maxW) {
			modal.style.width = `${Math.round(maxW)}px`;
		}
		if (modal.offsetHeight > maxH) {
			modal.style.height = `${Math.round(maxH)}px`;
		}
		// 居中基准随视口变了，锚定偏移直接归零，窗口回到视口中央。
		modal.style.left = "0px";
		modal.style.top = "0px";
		this.clampPan();
		this.applyTransform();
	};

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