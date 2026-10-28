import { MarkdownPostProcessorContext, MarkdownRenderChild, Notice, setIcon, setTooltip } from "obsidian";
import type CleanMermaidPlugin from "./main";
import { clamp, computeFit, MAX_SCALE, MIN_SCALE } from "./fit";
import { peekRendered, renderDiagram, type RenderRequest, type RenderedDiagram } from "./renderer";
import { svgToDataUrl } from "./svg-utils";
import { resolveActiveTheme, themeCanvasColor, themeIdentity, type ThemeDefinition } from "./themes";
import {
	copyDiagramPng,
	copyDiagramSource,
	exportDiagramPng,
	exportDiagramSvg,
	type ExportBundle,
} from "./export";
import { parseBlockDirectives } from "./directives";
import type { LayoutEngine } from "./settings";
import { DiagramViewerModal } from "./viewer";
import { markViewerOpened, viewerOpened } from "./hints";

/**
 * 一个已渲染的 ```mermaid 块：负责渲染图表、套上卡片，并持有全部交互
 * （自适应居中、缩放、平移、工具条、导出）。
 */
export class CleanMermaidBlock extends MarkdownRenderChild {
	private readonly plugin: CleanMermaidPlugin;
	private readonly source: string;

	private token = 0;
	private signature = "";
	private rendered: RenderedDiagram | null = null;
	private theme: ThemeDefinition | null = null;
	private plainMode = false;

	private cardEl: HTMLDivElement | null = null;
	private canvasEl: HTMLDivElement | null = null;
	private mediaEl: HTMLElement | SVGElement | null = null;
	private zoomBadgeEl: HTMLDivElement | null = null;
	private resizeObserver: ResizeObserver | null = null;

	private readonly zoomState = { manual: false, zoom: 1, tx: 0, ty: 0 };

	constructor(
		containerEl: HTMLElement,
		source: string,
		_context: MarkdownPostProcessorContext | undefined,
		plugin: CleanMermaidPlugin,
	) {
		super(containerEl);
		this.source = source;
		this.plugin = plugin;
	}

	onload(): void {
		this.containerEl.addClass("cm-host");
		if (this.containerEl.querySelector(".mermaid")) {
			// 容器里已经有一个 mermaid 容器：说明还有别的东西也在渲染它。
			this.plugin.warnAboutConflict();
		}
		this.plugin.registerBlock(this);
		void this.refresh(true);
	}

	onunload(): void {
		this.plugin.unregisterBlock(this);
		this.token++;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.containerEl.removeClass("cm-host");
		this.containerEl.empty();
	}

	/** 外观 / 主题变了才重渲染，否则只重新适配尺寸。 */
	async refresh(force = false): Promise<void> {
		const settings = this.plugin.settings;
		const { directives, code } = parseBlockDirectives(this.source, settings.enableDirectives);
		const isDark = this.plugin.isDark();

		const plain = !settings.enableRendering || directives.plain === true;
		const theme = plain ? null : resolveActiveTheme(settings, isDark, directives.themeId);
		const layout: LayoutEngine = plain ? "dagre" : directives.layout ?? settings.layoutEngine;

		const signature = [
			plain ? "plain" : themeIdentity(theme),
			layout,
			settings.elkMergeEdges,
			settings.elkNodePlacement,
			settings.decisionShape,
			settings.imageify ? "img" : "svg",
			isDark ? "dark" : "light",
			this.plugin.language,
		].join("|");

		if (!force && this.rendered && signature === this.signature) {
			this.cardEl?.toggleClass("cm-toolbar-always", settings.toolbarMode === "always");
			this.applyFit();
			return;
		}

		this.signature = signature;
		this.theme = theme;
		this.plainMode = plain;

		const token = ++this.token;
		const request: RenderRequest = {
			code,
			theme,
			layout,
			elkMergeEdges: settings.elkMergeEdges,
			elkNodePlacement: settings.elkNodePlacement,
			decisionShape: settings.decisionShape,
			plain,
		};

		// 命中缓存的图不 await，直接构建：块必须在出现的那一帧就落到最终高度，否则
		// CodeMirror 会围着它重新测量整篇笔记。
		const cached = peekRendered(request);
		if (cached) {
			this.build(cached, plain);
			return;
		}

		try {
			const rendered = await renderDiagram(request);
			if (token !== this.token || !this.containerEl.isConnected) {
				return;
			}
			this.build(rendered, plain);
		} catch (error) {
			if (token !== this.token) {
				return;
			}
			console.error("[clean-mermaid] failed to render a diagram", error);
			this.rendered = null;
			this.showError(error, code);
		}
	}

	private build(rendered: RenderedDiagram, plain: boolean): void {
		this.rendered = rendered;
		if (plain) {
			this.buildPlainView(rendered);
		} else {
			this.buildCard(rendered);
		}
	}

	private buildPlainView(rendered: RenderedDiagram): void {
		this.containerEl.empty();
		this.cardEl = null;
		this.canvasEl = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		const wrap = this.containerEl.createDiv({ cls: "cm-block cm-plain" });
		const image = wrap.createEl("img", { cls: "cm-media-plain" });
		image.src = svgToDataUrl(rendered.svg);
		image.draggable = false;
		this.mediaEl = image;
	}

	private buildCard(rendered: RenderedDiagram): void {
		const settings = this.plugin.settings;
		this.containerEl.empty();

		const wrap = this.containerEl.createDiv({ cls: "cm-block" });
		const card = wrap.createDiv({ cls: "cm-card" });
		card.toggleClass("cm-toolbar-always", settings.toolbarMode === "always");
		card.style.setProperty("--cm-canvas-bg", themeCanvasColor(this.theme));

		const stage = card.createDiv({ cls: "cm-stage" });
		const canvas = stage.createDiv({ cls: "cm-canvas" });
		this.cardEl = card;
		this.canvasEl = canvas;

		if (settings.imageify) {
			const image = canvas.createEl("img", { cls: "cm-media-image" });
			image.src = svgToDataUrl(rendered.svg);
			image.draggable = false;
			this.mediaEl = image;
		} else {
			const document_ = new DOMParser().parseFromString(rendered.svg, "image/svg+xml");
			const svgEl = document.importNode(document_.documentElement, true) as unknown as SVGElement;
			svgEl.addClass("cm-media-image");
			canvas.appendChild(svgEl);
			this.mediaEl = svgEl;
		}

		this.buildToolbar(stage);
		this.bindInteractions(canvas);
		this.observeResize(card);
		this.removeStrayRenderers();
		// 首次渲染出一张卡片时做一次性告知；之后的发现靠工具条上的「双击展开」标签。
		this.plugin.announceViewerHint();
		// SVG 自带原始尺寸，所以适配必须在这一步同步做完 —— 先让 CodeMirror 量到原始大小、
		// 下一帧才改成适配后的大小，笔记就会跳两次。
		if (!this.applyFit()) {
			this.scheduleFit();
		}
	}

	private buildToolbar(stage: HTMLElement): void {
		const plugin = this.plugin;
		const toolbar = stage.createDiv({ cls: "cm-toolbar" });

		// 「双击展开」的教学标签：只在还没展开过任何图表、且双击确实绑在展开上时渲染。
		// 两个条件缺一不可 —— 双击被改成复位或不响应之后，这句话就成了假的。
		// 文案写全整句而不是「双击展开」四个字：这一行就是这两处入口唯一的解释，别让用户自己补主语。
		if (!viewerOpened(plugin.app) && plugin.settings.doubleClickAction === "viewer") {
			toolbar.createDiv({
				cls: "cm-toolbar-hint",
				text: plugin.t("Double-click the diagram to expand", "双击图表也能展开"),
			});
		}

		const moreLabel = plugin.t("More actions", "更多操作");
		const menuButton = toolbar.createEl("button", { cls: "cm-btn" });
		setTooltip(menuButton, moreLabel);
		setIcon(menuButton, "more-horizontal");

		// 悬浮提示只写动作名。**不要**再写 title —— Obsidian 的提示按 aria-label 渲染，
		// 两个属性同时写着会弹出两个叠在一起的气泡。双击提示归左边的教学标签，不在这里重复。
		const expandLabel = plugin.t("Expand diagram", "展开图表");
		const expandButton = toolbar.createEl("button", { cls: "cm-btn" });
		setTooltip(expandButton, expandLabel);
		setIcon(expandButton, "maximize-2");

		const menu = stage.createDiv({ cls: "cm-menu cm-hidden" });
		const addItem = (icon: string, label: string, action: () => void | Promise<void>): void => {
			const item = menu.createEl("button", { cls: "cm-menu-item" });
			const iconEl = item.createSpan({ cls: "cm-menu-icon" });
			setIcon(iconEl, icon);
			item.createSpan({ text: label });
			this.registerDomEvent(item, "click", (event) => {
				event.stopPropagation();
				this.hideMenu();
				void action();
			});
		};
		addItem("image", plugin.t("Download PNG", "下载 PNG"), () => this.exportPng());
		addItem("download", plugin.t("Download SVG", "下载 SVG"), () => this.exportSvg());
		addItem("copy", plugin.t("Copy image", "复制图片"), () => this.copyImage());
		addItem("code", plugin.t("Copy source", "复制源码"), () => this.copySource());
		addItem("rotate-ccw", plugin.t("Reset zoom", "复位缩放"), () => this.resetZoom());

		this.registerDomEvent(menuButton, "click", (event) => {
			event.stopPropagation();
			menu.toggleClass("cm-hidden", !menu.hasClass("cm-hidden"));
		});
		this.registerDomEvent(expandButton, "click", (event) => {
			event.stopPropagation();
			this.openViewer();
		});
		this.registerDomEvent(document, "click", () => this.hideMenu());

		const badge = stage.createDiv({ cls: "cm-zoom-badge cm-hidden" });
		setTooltip(badge, plugin.t("Reset zoom", "复位缩放"));
		this.registerDomEvent(badge, "click", (event) => {
			event.stopPropagation();
			this.resetZoom();
		});
		this.zoomBadgeEl = badge;
	}

	private hideMenu(): void {
		this.cardEl?.querySelector(".cm-menu")?.addClass("cm-hidden");
	}

	/**
	 * 兜底：若 Obsidian 内置渲染器（或其它插件）在同一个块里渲染过，删掉它留下的容器，
	 * 保证只显示一张图。
	 */
	private removeStrayRenderers(): void {
		const own = this.containerEl.querySelector(":scope > .cm-block");
		const strays = Array.from(this.containerEl.children).filter(
			(child) => child !== own && (child.classList.contains("mermaid") || child.classList.contains("mermaid-error")),
		);
		for (const stray of strays) {
			stray.remove();
			this.plugin.warnAboutConflict();
		}
	}

	private bindInteractions(canvas: HTMLDivElement): void {
		this.registerDomEvent(
			canvas,
			"wheel",
			(event: WheelEvent) => {
				if (!this.plugin.settings.wheelZoom || !(event.ctrlKey || event.metaKey)) {
					// 普通滚轮继续交给笔记正常滚动。
					return;
				}
				event.preventDefault();
				this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
			},
			{ passive: false },
		);

		let dragging = false;
		let dragStartX = 0;
		let dragStartY = 0;
		let dragOriginX = 0;
		let dragOriginY = 0;

		this.registerDomEvent(canvas, "pointerdown", (event: PointerEvent) => {
			if (!this.plugin.settings.dragPan || event.button !== 0 || !this.isOverflowing()) {
				return;
			}
			dragging = true;
			dragStartX = event.clientX;
			dragStartY = event.clientY;
			dragOriginX = this.zoomState.tx;
			dragOriginY = this.zoomState.ty;
			canvas.setPointerCapture(event.pointerId);
			canvas.addClass("cm-grabbing");
			event.preventDefault();
		});

		this.registerDomEvent(canvas, "pointermove", (event: PointerEvent) => {
			if (!dragging) {
				return;
			}
			this.zoomState.tx = dragOriginX + (event.clientX - dragStartX);
			this.zoomState.ty = dragOriginY + (event.clientY - dragStartY);
			this.applyTransform();
		});

		const endDrag = (event: PointerEvent) => {
			if (!dragging) {
				return;
			}
			dragging = false;
			canvas.removeClass("cm-grabbing");
			try {
				canvas.releasePointerCapture(event.pointerId);
			} catch {
				// 指针捕获可能已经释放了。
			}
		};
		this.registerDomEvent(canvas, "pointerup", endDrag);
		this.registerDomEvent(canvas, "pointercancel", endDrag);

		this.registerDomEvent(canvas, "dblclick", (event: MouseEvent) => {
			const action = this.plugin.settings.doubleClickAction;
			if (action === "off") {
				return;
			}
			// 拦住冒泡：实时预览里卡片是嵌在 CodeMirror 中的部件，别让双击顺带在源码里选词。
			event.stopPropagation();
			if (action === "reset") {
				this.resetZoom();
				return;
			}
			this.openViewer();
		});
	}

	private observeResize(element: HTMLElement): void {
		this.resizeObserver?.disconnect();
		let lastWidth = 0;
		this.resizeObserver = new ResizeObserver((entries) => {
			const width = Math.round(entries[0]?.contentRect.width ?? 0);
			if (!width || Math.abs(width - lastWidth) < 1) {
				return;
			}
			lastWidth = width;
			window.requestAnimationFrame(() => {
				if (!this.canvasEl?.isConnected) {
					return;
				}
				if (this.zoomState.manual) {
					this.applyTransform();
				} else {
					this.applyFit();
				}
			});
		});
		this.resizeObserver.observe(element);
	}

	private scheduleFit(): void {
		const attempt = (retries: number): void => {
			window.requestAnimationFrame(() => {
				if (!this.canvasEl?.isConnected) {
					return;
				}
				if (!this.canvasEl.clientWidth && retries > 0) {
					window.setTimeout(() => attempt(retries - 1), 50);
					return;
				}
				this.removeStrayRenderers();
				this.applyFit();
			});
		};
		attempt(3);
	}

	/** 按块宽给卡片定尺寸；宽度还量不出来时返回 false。 */
	private applyFit(): boolean {
		const canvas = this.canvasEl;
		if (!canvas || !this.rendered) {
			return false;
		}
		const settings = this.plugin.settings;
		const containerWidth = canvas.clientWidth || this.containerEl.clientWidth;
		if (!containerWidth) {
			return false;
		}
		this.zoomState.manual = false;
		this.zoomState.tx = 0;
		this.zoomState.ty = 0;
		this.zoomState.zoom = computeFit({
			naturalW: this.rendered.width,
			naturalH: this.rendered.height,
			containerW: containerWidth,
			viewportH: window.innerHeight,
			mode: settings.fitMode,
			maxUpscale: settings.maxUpscale / 100,
			maxHeightRatio: settings.maxHeightVh / 100,
		});
		this.applyTransform();
		return true;
	}

	private applyTransform(): void {
		const canvas = this.canvasEl;
		const media = this.mediaEl;
		if (!canvas || !media || !this.rendered) {
			return;
		}
		const settings = this.plugin.settings;
		const zoom = this.zoomState.zoom;
		const displayWidth = Math.max(1, Math.round(this.rendered.width * zoom));
		const displayHeight = Math.max(1, Math.round(this.rendered.height * zoom));
		const maxHeight = Math.max((window.innerHeight * settings.maxHeightVh) / 100, 120);

		canvas.style.height = `${Math.round(clamp(displayHeight, 60, maxHeight))}px`;
		this.clampPan();
		media.style.width = `${displayWidth}px`;
		media.style.height = `${displayHeight}px`;
		media.style.transform = `translate(${Math.round(this.zoomState.tx)}px, ${Math.round(this.zoomState.ty)}px)`;
		this.updateZoomBadge();
	}

	private clampPan(): void {
		const canvas = this.canvasEl;
		if (!canvas || !this.rendered) {
			return;
		}
		const displayWidth = this.rendered.width * this.zoomState.zoom;
		const displayHeight = this.rendered.height * this.zoomState.zoom;
		const maxX = Math.max(0, (displayWidth - canvas.clientWidth) / 2);
		const maxY = Math.max(0, (displayHeight - canvas.clientHeight) / 2);
		this.zoomState.tx = clamp(this.zoomState.tx, -maxX, maxX);
		this.zoomState.ty = clamp(this.zoomState.ty, -maxY, maxY);
	}

	private isOverflowing(): boolean {
		const canvas = this.canvasEl;
		if (!canvas || !this.rendered) {
			return false;
		}
		const displayWidth = this.rendered.width * this.zoomState.zoom;
		const displayHeight = this.rendered.height * this.zoomState.zoom;
		return displayWidth > canvas.clientWidth + 1 || displayHeight > canvas.clientHeight + 1;
	}

	private zoomAt(clientX: number, clientY: number, factor: number): void {
		const canvas = this.canvasEl;
		if (!canvas) {
			return;
		}
		const rect = canvas.getBoundingClientRect();
		const centerX = clientX - rect.left - rect.width / 2;
		const centerY = clientY - rect.top - rect.height / 2;

		const oldZoom = this.zoomState.zoom;
		const newZoom = clamp(oldZoom * factor, MIN_SCALE, MAX_SCALE);
		if (newZoom === oldZoom) {
			return;
		}
		const ratio = newZoom / oldZoom;
		this.zoomState.tx = centerX - (centerX - this.zoomState.tx) * ratio;
		this.zoomState.ty = centerY - (centerY - this.zoomState.ty) * ratio;
		this.zoomState.zoom = newZoom;
		this.zoomState.manual = true;
		this.applyTransform();
	}

	private resetZoom(): void {
		this.applyFit();
	}

	private updateZoomBadge(): void {
		const badge = this.zoomBadgeEl;
		if (!badge) {
			return;
		}
		if (!this.zoomState.manual) {
			badge.addClass("cm-hidden");
			return;
		}
		badge.removeClass("cm-hidden");
		badge.setText(`${Math.round(this.zoomState.zoom * 100)}%`);
	}

	private openViewer(): void {
		if (!this.rendered) {
			return;
		}
		// 展开过一次就算学会了：把各张卡片上的「双击展开」标签一起撤掉，之后只剩工具条按钮。
		markViewerOpened(this.plugin.app);
		this.plugin.dismissViewerHints();
		new DiagramViewerModal(this.plugin.app, this.plugin, {
			rendered: this.rendered,
			background: this.plugin.settings.pngBackground === "theme" ? themeCanvasColor(this.theme) : null,
			source: this.source,
		}).open();
	}

	/** 撤掉本卡片上的「双击展开」教学标签。 */
	dismissViewerHint(): void {
		this.cardEl?.querySelector(".cm-toolbar-hint")?.remove();
	}

	private bundle(): ExportBundle | null {
		if (!this.rendered) {
			return null;
		}
		return {
			rendered: this.rendered,
			background: this.plugin.settings.pngBackground === "theme" ? themeCanvasColor(this.theme) : null,
			source: this.source,
		};
	}

	private async exportPng(): Promise<void> {
		const bundle = this.bundle();
		if (!bundle) {
			return;
		}
		await exportDiagramPng(bundle, this.plugin.settings.pngScale, this.plugin.language);
	}

	private async exportSvg(): Promise<void> {
		const bundle = this.bundle();
		if (!bundle) {
			return;
		}
		await exportDiagramSvg(bundle, this.plugin.language);
	}

	private async copyImage(): Promise<void> {
		const bundle = this.bundle();
		if (!bundle) {
			return;
		}
		await copyDiagramPng(bundle, this.plugin.settings.pngScale, this.plugin.language);
	}

	private async copySource(): Promise<void> {
		const bundle = this.bundle();
		if (!bundle) {
			return;
		}
		await copyDiagramSource(bundle, this.plugin.language);
	}

	private showError(error: unknown, code: string): void {
		const message = error instanceof Error ? error.message : String(error);
		this.containerEl.empty();
		this.cardEl = null;
		this.canvasEl = null;
		this.mediaEl = null;

		const wrap = this.containerEl.createDiv({ cls: "cm-block" });
		const card = wrap.createDiv({ cls: "cm-card cm-error" });
		card.createDiv({
			cls: "cm-error-title",
			text: this.plugin.t("Mermaid render failed", "Mermaid 渲染失败"),
		});
		card.createDiv({ cls: "cm-error-message", text: message });
		card.createDiv({
			cls: "cm-error-hint",
			text: this.plugin.t(
				"Tip: add %% cm:layout=dagre %% at the top of the block to fall back to the classic layout engine.",
				"提示：在代码块开头加上 %% cm:layout=dagre %% 可回退到经典布局引擎。",
			),
		});
		const details = card.createEl("details", { cls: "cm-error-details" });
		details.createEl("summary", { text: this.plugin.t("Show source", "查看源码") });
		details.createEl("pre", { text: code });

		if (!this.plugin.warnedAboutRenderFailure) {
			this.plugin.warnedAboutRenderFailure = true;
			new Notice(
				this.plugin.t(
					"Clean Mermaid: a diagram failed to render — see the block for details.",
					"Clean Mermaid：有图表渲染失败，详见该图表。",
				),
			);
		}
	}
}