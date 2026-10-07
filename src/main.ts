import { MarkdownPostProcessorContext, Notice, Plugin } from "obsidian";
import { CleanMermaidBlock } from "./block";
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

		this.addCommand({
			id: "redraw-diagrams",
			name: "Redraw all diagrams in the current view",
			callback: () => this.redrawAll(),
		});

		// Appearance switches (light/dark, theme changes) need a re-render because the
		// theme variables are baked into the SVG.
		this.registerEvent(this.app.workspace.on("css-change", () => this.refreshAll()));
	}

	onunload(): void {
		this.blocks.clear();
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
		new Notice("Clean Mermaid: diagrams redrawn");
	}

	warnAboutConflict(): void {
		if (this.warnedAboutRenderingConflict) {
			return;
		}
		this.warnedAboutRenderingConflict = true;
		console.warn("[clean-mermaid] An existing mermaid container was found in the block — another plugin may render mermaid too.");
		new Notice(
			"Clean Mermaid: another plugin appears to render mermaid blocks as well. Enable only one of them for predictable results.",
		);
	}
}