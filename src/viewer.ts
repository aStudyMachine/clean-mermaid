import { App, Modal, setIcon } from "obsidian";
import type CleanMermaidPlugin from "./main";
import { clamp, computeViewerWindowSize, MAX_SCALE, MIN_SCALE } from "./fit";
import type { RenderedDiagram } from "./render-engine";
import { svgToDataUrl } from "./svg-utils";
import { exportDiagramPng, exportDiagramSvg, type ExportBundle } from "./export";

/** 窗口允许的最小尺寸（px）；再小工具栏就不可用了。 */
const VIEWER_MIN_WIDTH = 480;
const VIEWER_MIN_HEIGHT = 360;
/** 打开时的默认窗口＝视口的上限；与 styles.css 里 .cm-modal 的 max-width / max-height 同一口径。 */
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
	/**
	 * 自适应开关，就是工具条上那颗按钮的两个状态：开启时图始终装进窗口，窗口尺寸一变就重算；
	 * 用户一旦手动缩放或平移就自动关闭，之后窗口变化不再覆盖他的缩放。
	 * 重新开启的入口是点按钮、双击图、按 `0` —— 三者都走 `fit()`。
	 */
	private autoFit = true;
	/** 自适应开关按钮，用来把两态如实画出来。 */
	private fitButtonEl!: HTMLButtonElement;

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

		// 默认窗口＝视口上限；图像随后由 fit() 缩放到刚好装进窗口。
		this.sizeToViewport();
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
			// 窗口尺寸不依赖布局，但 fit() 要量 stage，未入树时量不到，等一帧再自适应。
			this.sizeToViewport();
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
		// 自适应开关：点一下在开启 / 关闭之间切换，开启时立刻把图装进窗口。
		this.fitButtonEl = addButton("maximize", this.autoFitLabel(), () => this.toggleAutoFit());
		this.syncAutoFitButton();

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
				// 贴着边拖不动（图没溢出）时不算手动，别把自适应开关关掉。
				if (this.tx !== this.dragOrigin.x || this.ty !== this.dragOrigin.y) {
					this.leaveAutoFit();
				}
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
		const { width, height } = computeViewerWindowSize({
			viewportW: window.innerWidth,
			viewportH: window.innerHeight,
			minW: VIEWER_MIN_WIDTH,
			minH: VIEWER_MIN_HEIGHT,
			widthRatio: VIEWER_MAX_WIDTH_RATIO,
			heightRatio: VIEWER_MAX_HEIGHT_RATIO,
		});
		return { maxW: width, maxH: height };
	}

	/** 把窗口铺到视口上限；让图装进窗口是 `fit()` 的事。 */
	private sizeToViewport(): void {
		const { maxW, maxH } = this.viewportMaxSize();
		this.modalEl.style.width = `${maxW}px`;
		this.modalEl.style.height = `${maxH}px`;
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

		if (!this.autoFit) {
			// 用户手动缩放/平移过：缩放保持不动，只按新 stage 尺寸重算平移限位。
			this.clampPan();
			this.applyTransform();
			return;
		}
		// 仍在自适应状态：跟着新窗口尺寸重新装进窗口。
		this.fit();
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
		modal.setCssStyles({ left: "0px", top: "0px" });
		if (!this.autoFit) {
			this.clampPan();
			this.applyTransform();
			return;
		}
		// 仍在自适应状态：视口变小把窗口收窄了，图再装一次。
		this.fit();
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
		this.leaveAutoFit();
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
		this.leaveAutoFit();
		const ratio = newZoom / oldZoom;
		this.tx = this.tx * ratio;
		this.ty = this.ty * ratio;
		this.zoom = newZoom;
		this.clampPan();
		this.applyTransform();
	}

	/**
	 * 复位到自适应：缩放取「刚好装进窗口」的倍数（图小则放大，由 MIN/MAX_SCALE 兜底），
	 * 同时把自适应开关扳回开启 —— 之后窗口尺寸变化继续跟着重算。
	 */
	private fit(): void {
		const rect = this.stageEl.getBoundingClientRect();
		const { width, height } = this.data.rendered;
		if (!width || !height || !rect.width || !rect.height) {
			return;
		}
		this.autoFit = true;
		this.syncAutoFitButton();
		this.tx = 0;
		this.ty = 0;
		this.zoom = clamp(Math.min(rect.width / width, rect.height / height), MIN_SCALE, MAX_SCALE);
		this.applyTransform();
	}

	/** 自适应开关的两态文案；按钮只有图标，文案走 title 与 aria-label。 */
	private autoFitLabel(): string {
		return this.autoFit
			? this.plugin.t("Adaptive fit: on (click to turn off)", "自适应：已开启（点击关闭）")
			: this.plugin.t("Adaptive fit: off (click to turn on)", "自适应：已关闭（点击开启）");
	}

	/** 把按钮画成当前态：开启时高亮，关闭时与其它工具条按钮一致。 */
	private syncAutoFitButton(): void {
		const label = this.autoFitLabel();
		this.fitButtonEl.toggleClass("cm-btn-active", this.autoFit);
		this.fitButtonEl.setAttribute("aria-pressed", String(this.autoFit));
		this.fitButtonEl.setAttribute("aria-label", label);
		this.fitButtonEl.setAttribute("title", label);
	}

	/** 工具条按钮：关掉自适应保留当前缩放，或开启它并立刻装进窗口。 */
	private toggleAutoFit(): void {
		if (this.autoFit) {
			this.autoFit = false;
			this.syncAutoFitButton();
			return;
		}
		this.fit();
	}

	/** 手动缩放或平移之后自动退出自适应，并让按钮如实反映出来。 */
	private leaveAutoFit(): void {
		if (!this.autoFit) {
			return;
		}
		this.autoFit = false;
		this.syncAutoFitButton();
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