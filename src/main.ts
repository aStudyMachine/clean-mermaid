import { getLanguage, MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import { CleanMermaidBlock } from "./block";
import { pick, resolveLanguage, type Language } from "./i18n";
import { createLivePreviewExtension } from "./livepreview";
import { CleanMermaidSettingTab, DEFAULT_SETTINGS, migrateSettings, type CleanMermaidSettings } from "./settings";

/**
 * Clean Mermaid —— 把每个 ```mermaid 代码块渲染成一张干净的卡片：
 * ELK 布局、自适应、缩放平移、图片预览、PNG/SVG 导出与主题。
 */
export default class CleanMermaidPlugin extends Plugin {
	settings: CleanMermaidSettings = structuredClone(DEFAULT_SETTINGS);
	warnedAboutRenderFailure = false;
	warnedAboutRenderingConflict = false;

	private readonly blocks = new Set<CleanMermaidBlock>();
	private commandsRegistered = false;

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
		if (migrateSettings(this.settings)) {
			// 早期构建的设置里引用的是旧的内置主题 id —— 把改写结果落盘。
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async updateSettings(patch: Partial<CleanMermaidSettings>): Promise<void> {
		Object.assign(this.settings, patch);
		await this.saveSettings();
		if ("language" in patch) {
			this.registerCommands();
		}
		this.refreshAll();
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