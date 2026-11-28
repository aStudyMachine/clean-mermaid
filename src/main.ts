import { getLanguage, MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import { CleanMermaidBlock } from "./block";
import { markViewerHintAnnounced, viewerHintAnnounced, viewerOpened } from "./hints";
import { pick, resolveLanguage, type Language } from "./i18n";
import { createLivePreviewExtension } from "./livepreview";
import { repairThemeReferences } from "./themes";
import { CleanMermaidSettingTab, DEFAULT_SETTINGS, migrateSettings, type CleanMermaidSettings } from "./settings";

/**
 * Clean Mermaid —— 把每个 ```mermaid 代码块渲染成一张干净的卡片：
 * ELK 布局、自适应、缩放平移、图片预览、PNG/SVG 导出与主题。
 */
export default class CleanMermaidPlugin extends Plugin {
	settings: CleanMermaidSettings = structuredClone(DEFAULT_SETTINGS);
	warnedAboutRenderFailure = false;
	warnedAboutRenderingConflict = false;
	/** 本次会话已经做过「双击展开」的一次性提示，避免同屏多张卡片各弹一次。 */
	private viewerHintShown = false;

	private readonly blocks = new Set<CleanMermaidBlock>();
	private commandsRegistered = false;
	/** 各编辑器视图的重扫入口；只有渲染开关真正切换时才统一通知。 */
	private readonly livePreviewRescans = new Set<() => void>();
	/** 当前开着「更多操作」菜单的卡片；同一时刻只允许一个。 */
	private openMenuCloser: (() => void) | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// 阅读视图：在 Obsidian 自带的 mermaid 后处理器之前接管 `mermaid` 代码块语言
		// （sortOrder -100）。
		try {
			this.registerMarkdownCodeBlockProcessor(
				"mermaid",
				(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
					ctx.addChild(new CleanMermaidBlock(el, source, ctx, this));
				},
				-100,
			);
		} catch (error) {
			// 已经有其它插件占用了这个语言。阅读视图继续用它的渲染器，但下面的
			// 实时预览接管仍然生效。
			console.warn("[clean-mermaid] could not register the mermaid code block processor", error);
		}

		// 实时预览：Obsidian 渲染 mermaid 用的是硬编码的核心渲染器，不看处理器注册表，
		// 所以改成把已渲染好的部件替换成我们的卡片。
		this.registerEditorExtension(createLivePreviewExtension(this));

		this.addSettingTab(new CleanMermaidSettingTab(this.app, this));

		this.registerCommands();

		// 外观切换（浅色/深色、主题变更）需要重渲染，因为
		// themeVariables 已经烘进 SVG 里了。
		this.registerEvent(this.app.workspace.on("css-change", () => this.refreshAll()));
	}

	onunload(): void {
		this.blocks.clear();
		this.livePreviewRescans.clear();
		this.openMenuCloser = null;
	}

	/** 命令面板条目的标签只在注册时定一次，所以切换语言时要重新注册。 */
	private registerCommands(): void {
		if (this.commandsRegistered) {
			this.removeCommand("redraw-diagrams");
		}
		this.commandsRegistered = true;
		this.addCommand({
			id: "redraw-diagrams",
			name: this.t("Redraw all diagrams in the current view", "重新绘制当前视图中的所有图表"),
			callback: () => this.redrawAll(),
		});
	}

	registerBlock(block: CleanMermaidBlock): void {
		this.blocks.add(block);
	}

	unregisterBlock(block: CleanMermaidBlock): void {
		this.blocks.delete(block);
	}

	/** 登记一个实时预览实例的重扫入口；返回的注销函数随视图销毁调用。 */
	registerLivePreviewRescan(rescan: () => void): () => void {
		this.livePreviewRescans.add(rescan);
		return () => {
			this.livePreviewRescans.delete(rescan);
		};
	}

	private rescanLivePreview(): void {
		for (const rescan of this.livePreviewRescans) {
			rescan();
		}
	}

	/** 打开一张卡片的菜单前先关掉上一张，避免同时开着两个。 */
	claimMenu(closer: () => void): void {
		if (this.openMenuCloser && this.openMenuCloser !== closer) {
			this.closeOpenMenu();
		}
		this.openMenuCloser = closer;
	}

	private closeOpenMenu(): void {
		this.openMenuCloser?.();
	}

	releaseMenu(closer: () => void): void {
		if (this.openMenuCloser === closer) {
			this.openMenuCloser = null;
		}
	}

	/** 隔离插件生成的图表图片与宿主或第三方图库的委托监听。 */
	suppressImagePreview(image: HTMLImageElement): void {
		image.addEventListener("click", (event) => {
			// Obsidian 检查 defaultPrevented，Image Toolkit 的委托监听则依赖事件冒泡。
			event.preventDefault();
			event.stopPropagation();
			// 单击不再冒泡到 document，仍需关闭卡片菜单。
			this.closeOpenMenu();
		});
		// Image Toolkit 也在 document 上委托悬浮事件，直接把光标设为 zoom-in。
		image.addEventListener("mouseover", (event) => event.stopPropagation());
		image.addEventListener("mouseout", (event) => event.stopPropagation());
	}

	isDark(): boolean {
		return document.body.classList.contains("theme-dark");
	}

	/** 本插件界面所用的语言。 */
	get language(): Language {
		return resolveLanguage(this.settings.language, this.uiLanguage());
	}

	/** Obsidian 自己的界面语言；取不到时交回 null，由 i18n 回落到浏览器语言。 */
	private uiLanguage(): string | null {
		try {
			return getLanguage() || null;
		} catch {
			return null;
		}
	}

	/** 当前语言下的用户可见文案。 */
	t(english: string, chinese: string): string {
		return pick(this.language, english, chinese);
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<CleanMermaidSettings> | null;
		this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), stored ?? {});
		// 旧版本写入的主题 id 与已删除的主题都可能在存档里留下悬空引用，统一换回内置默认。
		if (migrateSettings(this.settings) || repairThemeReferences(this.settings)) {
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async updateSettings(patch: Partial<CleanMermaidSettings>): Promise<void> {
		const renderingToggled =
			"enableRendering" in patch && patch.enableRendering !== this.settings.enableRendering;
		Object.assign(this.settings, patch);
		await this.saveSettings();
		if ("language" in patch) {
			this.registerCommands();
		}
		this.refreshAll();
		if (renderingToggled) {
			// 关闭渲染时实时预览会卸载卡片并清空登记，重新开启后没有块可刷；
			// 让编辑器实例自己重扫一遍，否则要等下一次滚动或编辑才恢复。
			this.rescanLivePreview();
		}
	}

	/** 重渲染所有图表（设置变更后）。实际没变化时开销很小。 */
	refreshAll(): void {
		for (const block of this.blocks) {
			void block.refresh(false);
		}
	}

	/** 强制重画，绕过「什么都没变」的短路。 */
	redrawAll(): void {
		for (const block of this.blocks) {
			void block.refresh(true);
		}
		new Notice(this.t("Clean Mermaid: diagrams redrawn", "Clean Mermaid：图表已重绘"));
	}

	/**
	 * 一次性告知「双击可展开查看」。只提示一次：每个会话最多一条，跨会话靠 hints 里的标记，
	 * 而且用户已经展开过图表就不再打扰。
	 */
	announceViewerHint(): void {
		if (this.viewerHintShown || this.settings.doubleClickAction === "off") {
			return;
		}
		this.viewerHintShown = true;
		if (viewerHintAnnounced(this.app) || viewerOpened(this.app)) {
			return;
		}
		markViewerHintAnnounced(this.app);
		new Notice(
			this.t(
				"Clean Mermaid: double-click a diagram to open it expanded.",
				"Clean Mermaid：双击图表即可展开查看。",
			),
		);
	}

	/** 展开过图表之后，把各张卡片上的「双击展开」标签一起撤掉。 */
	dismissViewerHints(): void {
		for (const block of this.blocks) {
			block.dismissViewerHint();
		}
	}

	warnAboutConflict(): void {
		if (this.warnedAboutRenderingConflict) {
			return;
		}
		this.warnedAboutRenderingConflict = true;
		console.warn("[clean-mermaid] An existing mermaid container was found in the block — another plugin may render mermaid too.");
		new Notice(
			this.t(
				"Clean Mermaid: another plugin appears to render mermaid blocks as well. Enable only one of them for predictable results.",
				"Clean Mermaid：检测到其它插件也在渲染 mermaid 代码块，只启用其中一个才能保证效果一致。",
			),
		);
	}
}
