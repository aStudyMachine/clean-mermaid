import { MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import { CleanMermaidBlock } from "./block";
import { pick, resolveLanguage, type Language } from "./i18n";
import { createLivePreviewExtension } from "./livepreview";
import { CleanMermaidSettingTab, DEFAULT_SETTINGS, migrateSettings, type CleanMermaidSettings } from "./settings";

/**
 * Clean Mermaid — renders every ```mermaid block with a clean, Codex-style card:
 * ELK layout, auto-fit, zoom & pan, image preview, PNG/SVG export and theming.
 */
export default class CleanMermaidPlugin extends Plugin {
	settings: CleanMermaidSettings = structuredClone(DEFAULT_SETTINGS);
	warnedAboutRenderFailure = false;
	warnedAboutRenderingConflict = false;

	private readonly blocks = new Set<CleanMermaidBlock>();
	private commandsRegistered = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Reading view: take over the `mermaid` code block language ahead of Obsidian's own
		// mermaid post processor (sortOrder -100).
		try {
			this.registerMarkdownCodeBlockProcessor(
				"mermaid",
				(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
					ctx.addChild(new CleanMermaidBlock(el, source, ctx, this));
				},
				-100,
			);
			console.info("[clean-mermaid] reading view processor registered");
		} catch (error) {
			// Another plugin already owns the language. Reading view keeps its renderer, but live
			// preview takeover below still works.
			console.warn("[clean-mermaid] could not register the mermaid code block processor", error);
		}

		// Live preview: Obsidian renders mermaid with a hard-coded core renderer that ignores the
		// processor registry, so the rendered widget is replaced by our card instead.
		this.registerEditorExtension(createLivePreviewExtension(this));

		this.addSettingTab(new CleanMermaidSettingTab(this.app, this));

		this.registerCommands();

		// Appearance switches (light/dark, theme changes) need a re-render because the
		// theme variables are baked into the SVG.
		this.registerEvent(this.app.workspace.on("css-change", () => this.refreshAll()));
	}

	onunload(): void {
		this.blocks.clear();
	}

	/** Command palette entries are labelled once at registration, so re-register them on a language switch. */
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

	/** The interface language this plugin renders in. */
	get language(): Language {
		return resolveLanguage(this.settings.language);
	}

	/** User-facing string for the active language. */
	t(english: string, chinese: string): string {
		return pick(this.language, english, chinese);
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<CleanMermaidSettings> | null;
		this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), stored ?? {});
		if (migrateSettings(this.settings)) {
			// Settings from an earlier build referenced the old built-in theme ids — persist the rewrite.
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

	/** Re-renders every diagram (settings changed). Cheap when nothing actually changed. */
	refreshAll(): void {
		for (const block of this.blocks) {
			void block.refresh(false);
		}
	}

	/** Forces a fresh render, bypassing the "nothing changed" shortcut. */
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