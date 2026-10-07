import { App, PluginSettingTab, Setting } from "obsidian";
import type CleanMermaidPlugin from "./main";
import {
	BUILTIN_THEMES,
	allThemes,
	findTheme,
	parseThemeVariables,
	stringifyThemeVariables,
} from "./themes";

export type FitMode = "width" | "viewport" | "raw";
export type LayoutEngine = "elk" | "dagre";
export type ElkMergeEdges = "default" | "on" | "off";
export type ElkNodePlacement =
	| "default"
	| "NETWORK_SIMPLEX"
	| "BRANDES_KOEPF"
	| "LINEAR_SEGMENTS"
	| "SIMPLE";
export type PngScale = 1 | 2 | 3;
export type PngBackground = "theme" | "transparent";
export type ToolbarMode = "hover" | "always";
/** `auto` follows Obsidian's own interface language. */
export type LanguageSetting = "auto" | "zh" | "en";
export type Language = "zh" | "en";

export interface CustomTheme {
	id: string;
	name: string;
	dark: boolean;
	variables: Record<string, unknown>;
}

export interface CleanMermaidSettings {
	/** Language used by this plugin's settings tab. */
	language: LanguageSetting;
	/** Theme used while Obsidian is in light appearance. */
	lightThemeId: string;
	/** Theme used while Obsidian is in dark appearance. */
	darkThemeId: string;
	/** Follow the Obsidian appearance automatically; disable to pin one theme. */
	followAppearance: boolean;
	/** Theme used when followAppearance is off. */
	fixedThemeId: string;

	layoutEngine: LayoutEngine;
	elkMergeEdges: ElkMergeEdges;
	elkNodePlacement: ElkNodePlacement;

	fitMode: FitMode;
	/** Max upscale in percent (150 = 150%). */
	maxUpscale: number;
	/** Max diagram height in percent of the viewport height. */
	maxHeightVh: number;

	wheelZoom: boolean;
	dragPan: boolean;
	toolbarMode: ToolbarMode;
	doubleClickReset: boolean;

	enableRendering: boolean;
	imageify: boolean;
	enableDirectives: boolean;

	pngScale: PngScale;
	pngBackground: PngBackground;

	customThemes: CustomTheme[];
}

export const DEFAULT_SETTINGS: CleanMermaidSettings = {
	language: "auto",

	lightThemeId: "clean-light",
	darkThemeId: "clean-dark",
	followAppearance: true,
	fixedThemeId: "clean-light",

	layoutEngine: "elk",
	elkMergeEdges: "default",
	elkNodePlacement: "default",

	fitMode: "width",
	maxUpscale: 150,
	maxHeightVh: 80,

	wheelZoom: true,
	dragPan: true,
	toolbarMode: "hover",
	doubleClickReset: true,

	enableRendering: true,
	imageify: true,
	enableDirectives: true,

	pngScale: 2,
	pngBackground: "theme",

	customThemes: [],
};

/** Theme ids used before the built-in themes were renamed to Clean Light / Clean Dark. */
const LEGACY_THEME_IDS: Record<string, string> = {
	"codex-light": "clean-light",
	"codex-dark": "clean-dark",
};

/**
 * Maps configuration written by earlier builds onto the current theme ids, so saved settings keep
 * working after the rename. Returns true when something had to be rewritten.
 */
export function migrateSettings(settings: CleanMermaidSettings): boolean {
	let changed = false;
	const keys = ["lightThemeId", "darkThemeId", "fixedThemeId"] as const;
	for (const key of keys) {
		const mapped = LEGACY_THEME_IDS[settings[key]];
		if (mapped) {
			settings[key] = mapped;
			changed = true;
		}
	}
	return changed;
}

/** Obsidian keeps its interface language in local storage (e.g. "zh", "zh-TW", "en"). */
export function detectObsidianLanguage(): Language {
	try {
		const stored = window.localStorage.getItem("language");
		if (stored) {
			return stored.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
	} catch {
		// Local storage unavailable — fall through to the browser language.
	}
	return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLanguage(setting: LanguageSetting): Language {
	if (setting === "zh" || setting === "en") {
		return setting;
	}
	return detectObsidianLanguage();
}

/** Picks the string for the active language. */
function pick(language: Language, english: string, chinese: string): string {
	return language === "zh" ? chinese : english;
}

export class CleanMermaidSettingTab extends PluginSettingTab {
	private readonly plugin: CleanMermaidPlugin;

	constructor(app: App, plugin: CleanMermaidPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private get language(): Language {
		return resolveLanguage(this.plugin.settings.language);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("cm-settings");

		this.renderGeneral(containerEl);
		this.renderAppearance(containerEl);
		this.renderLayout(containerEl);
		this.renderInteraction(containerEl);
		this.renderRendering(containerEl);
		this.renderExport(containerEl);
		this.renderCustomThemes(containerEl);
		this.renderReset(containerEl);
	}

	private themeOptions(language: Language): Record<string, string> {
		const options: Record<string, string> = {};
		for (const theme of allThemes(this.plugin.settings)) {
			options[theme.id] = theme.builtin ? theme.name : `${theme.name}${pick(language, " (custom)", "（自定义）")}`;
		}
		return options;
	}

	private renderGeneral(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "General", "通用")).setHeading();

		new Setting(containerEl)
			.setName(pick(language, "Language", "语言"))
			.setDesc(
				pick(
					language,
					"Language used by this plugin's settings tab. “Auto” follows Obsidian's interface language.",
					"本插件设置面板使用的语言；“自动”跟随 Obsidian 的界面语言。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: pick(language, "Auto (follow Obsidian)", "自动（跟随 Obsidian）"),
						zh: "中文",
						en: "English",
					})
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as LanguageSetting;
						await this.plugin.saveSettings();
						this.display();
					}),
			);
	}

	private renderAppearance(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "Appearance", "外观")).setHeading();

		new Setting(containerEl)
			.setName(pick(language, "Light appearance theme", "浅色模式主题"))
			.setDesc(
				pick(
					language,
					"Theme used while Obsidian is in light mode.",
					"Obsidian 处于浅色模式时使用的主题。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(this.themeOptions(language))
					.setValue(this.plugin.settings.lightThemeId)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ lightThemeId: value });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Dark appearance theme", "深色模式主题"))
			.setDesc(
				pick(
					language,
					"Theme used while Obsidian is in dark mode.",
					"Obsidian 处于深色模式时使用的主题。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(this.themeOptions(language))
					.setValue(this.plugin.settings.darkThemeId)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ darkThemeId: value });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Follow Obsidian appearance", "跟随 Obsidian 明暗"))
			.setDesc(
				pick(
					language,
					"Switch between the light and dark theme automatically. Turn off to pin one theme.",
					"随 Obsidian 明暗自动切换主题；关闭后固定使用下方指定的主题。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.followAppearance).onChange(async (value) => {
					await this.plugin.updateSettings({ followAppearance: value });
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Fixed theme", "固定主题"))
			.setDesc(
				pick(
					language,
					"Used when “Follow Obsidian appearance” is off.",
					"当「跟随 Obsidian 明暗」关闭时使用的主题。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(this.themeOptions(language))
					.setValue(this.plugin.settings.fixedThemeId)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ fixedThemeId: value });
					}),
			);
	}

	private renderLayout(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "Layout", "布局")).setHeading();

		new Setting(containerEl)
			.setName(pick(language, "Layout engine", "布局引擎"))
			.setDesc(
				pick(
					language,
					"ELK gives cleaner layouts for complex flowcharts. Dagre is the classic mermaid engine.",
					"ELK 对复杂流程图排布更清晰；Dagre 是 mermaid 的经典引擎。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						elk: pick(language, "ELK (default)", "ELK（默认）"),
						dagre: "Dagre",
					})
					.setValue(this.plugin.settings.layoutEngine)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ layoutEngine: value as LayoutEngine });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "ELK: merge edges", "ELK：合并连线"))
			.setDesc(
				pick(
					language,
					"Merge edges that connect the same node pair. “Mermaid default” leaves the engine's own setting untouched.",
					"合并连接同一对节点的多条连线；选「Mermaid 默认」则不改动引擎自带设置。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						default: pick(language, "Mermaid default", "Mermaid 默认"),
						on: pick(language, "Merge edges", "合并"),
						off: pick(language, "Keep separate", "保持分开"),
					})
					.setValue(this.plugin.settings.elkMergeEdges)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ elkMergeEdges: value as ElkMergeEdges });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "ELK: node placement strategy", "ELK：节点排布策略"))
			.setDesc(
				pick(
					language,
					"Node ordering strategy used by the layered ELK algorithm.",
					"ELK 分层算法使用的节点排序策略。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						default: pick(language, "Mermaid default", "Mermaid 默认"),
						NETWORK_SIMPLEX: pick(language, "Network simplex", "网络单纯形"),
						BRANDES_KOEPF: "Brandes–Koepf",
						LINEAR_SEGMENTS: pick(language, "Linear segments", "线性分段"),
						SIMPLE: pick(language, "Simple", "简单"),
					})
					.setValue(this.plugin.settings.elkNodePlacement)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ elkNodePlacement: value as ElkNodePlacement });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Auto-fit", "自适应方式"))
			.setDesc(
				pick(
					language,
					"How diagrams are scaled to the editor space. Zooming manually always overrides this.",
					"图表如何缩放到编辑器空间；手动缩放后以手动缩放为准。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						width: pick(language, "Fit width", "适应宽度"),
						viewport: pick(language, "Fit width and height", "适应宽高"),
						raw: pick(language, "Natural size", "原始尺寸"),
					})
					.setValue(this.plugin.settings.fitMode)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ fitMode: value as FitMode });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Maximum upscale", "最大放大倍率"))
			.setDesc(
				pick(
					language,
					"Upper limit for auto-fit upscaling, so small diagrams stay readable but not oversized.",
					"自适应放大的上限，避免小图被放得过大。",
				),
			)
			.addSlider((slider) =>
				slider
					.setLimits(100, 300, 10)
					.setValue(this.plugin.settings.maxUpscale)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.updateSettings({ maxUpscale: value });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Maximum height", "最大高度"))
			.setDesc(
				pick(
					language,
					"Tall diagrams are capped to this share of the viewport height.",
					"过高的图表最多占用视口高度的这个比例。",
				),
			)
			.addSlider((slider) =>
				slider
					.setLimits(40, 100, 5)
					.setValue(this.plugin.settings.maxHeightVh)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.updateSettings({ maxHeightVh: value });
					}),
			);
	}

	private renderInteraction(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "Interaction", "交互")).setHeading();

		new Setting(containerEl)
			.setName(pick(language, "Ctrl/Cmd + scroll to zoom", "Ctrl/Cmd + 滚轮缩放"))
			.setDesc(
				pick(
					language,
					"Plain scrolling keeps scrolling the note.",
					"普通滚轮仍然照常滚动笔记。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.wheelZoom).onChange(async (value) => {
					await this.plugin.updateSettings({ wheelZoom: value });
				}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Drag to pan", "拖拽平移"))
			.setDesc(
				pick(
					language,
					"Drag a zoomed-in diagram with the left mouse button or a finger.",
					"放大后可用鼠标左键或手指拖动画布平移。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.dragPan).onChange(async (value) => {
					await this.plugin.updateSettings({ dragPan: value });
				}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Toolbar visibility", "工具条显示方式"))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						hover: pick(language, "On hover", "悬停显示"),
						always: pick(language, "Always visible", "常显"),
					})
					.setValue(this.plugin.settings.toolbarMode)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ toolbarMode: value as ToolbarMode });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Double-click to reset zoom", "双击复位缩放"))
			.setDesc(
				pick(
					language,
					"Double-clicking a diagram returns it to auto-fit.",
					"双击图表可恢复到自适应状态。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.doubleClickReset).onChange(async (value) => {
					await this.plugin.updateSettings({ doubleClickReset: value });
				}),
			);
	}

	private renderRendering(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "Rendering", "渲染")).setHeading();

		new Setting(containerEl)
			.setName(pick(language, "Enable Clean Mermaid rendering", "启用 Clean Mermaid 渲染"))
			.setDesc(
				pick(
					language,
					"When off, diagrams are rendered with mermaid's stock look instead of the Codex-style card.",
					"关闭后图表改用 mermaid 原生外观渲染，不再套用卡片样式。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableRendering).onChange(async (value) => {
					await this.plugin.updateSettings({ enableRendering: value });
				}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Render as image", "图片化渲染"))
			.setDesc(
				pick(
					language,
					"Display the diagram as an <img> (SVG data URL) so Obsidian themes cannot restyle it. Turn off to keep the live SVG.",
					"以 <img>（SVG data URL）方式显示图表，避免被 Obsidian 主题样式影响；关闭则保留内联 SVG。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.imageify).onChange(async (value) => {
					await this.plugin.updateSettings({ imageify: value });
				}),
			);

		new Setting(containerEl)
			.setName(pick(language, "Support %% cm: %% directives", "支持 %% cm: %% 指令"))
			.setDesc(
				pick(
					language,
					"Allow per-diagram overrides like %% cm:theme=neutral %%, %% cm:layout=dagre %% and %% cm:plain %%.",
					"允许按图覆盖设置，例如 %% cm:theme=neutral %%、%% cm:layout=dagre %%、%% cm:plain %%。",
				),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableDirectives).onChange(async (value) => {
					await this.plugin.updateSettings({ enableDirectives: value });
				}),
			);
	}

	private renderExport(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "Export", "导出")).setHeading();

		new Setting(containerEl)
			.setName(pick(language, "PNG resolution", "PNG 分辨率"))
			.setDesc(
				pick(
					language,
					"Export scale factor for downloaded and copied PNG images.",
					"下载或复制 PNG 时使用的放大倍率。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						"1": "1×",
						"2": pick(language, "2× (default)", "2×（默认）"),
						"3": "3×",
					})
					.setValue(String(this.plugin.settings.pngScale))
					.onChange(async (value) => {
						await this.plugin.updateSettings({ pngScale: Number(value) as PngScale });
					}),
			);

		new Setting(containerEl)
			.setName(pick(language, "PNG background", "PNG 背景"))
			.setDesc(
				pick(
					language,
					"Use the theme background colour for PNG exports, or keep the background transparent.",
					"导出 PNG 时使用主题背景色，或保持透明背景。",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						theme: pick(language, "Theme background", "主题背景"),
						transparent: pick(language, "Transparent", "透明"),
					})
					.setValue(this.plugin.settings.pngBackground)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ pngBackground: value as PngBackground });
					}),
			);
	}

	private renderCustomThemes(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).setName(pick(language, "Custom themes", "自定义主题")).setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: pick(
				language,
				"A custom theme is a plain Mermaid themeVariables object. Start from a built-in theme, then adjust the colours. Invalid JSON is rejected and the last valid version stays in effect.",
				"自定义主题就是一份 Mermaid themeVariables JSON。可从内置主题复制后调整配色；非法 JSON 会被拒绝并保留上一版生效值。",
			),
		});

		const list = containerEl.createDiv({ cls: "cm-theme-list" });
		this.plugin.settings.customThemes.forEach((_theme, index) =>
			this.renderCustomTheme(list, index, language),
		);

		let template = BUILTIN_THEMES[0].id;
		new Setting(containerEl)
			.setName(pick(language, "Add custom theme", "新增自定义主题"))
			.setDesc(
				pick(
					language,
					"Creates a new theme seeded from the selected built-in theme.",
					"基于所选内置主题复制出一个新的自定义主题。",
				),
			)
			.addDropdown((dropdown) => {
				for (const builtin of BUILTIN_THEMES) {
					dropdown.addOption(builtin.id, builtin.name);
				}
				dropdown.setValue(template);
				dropdown.onChange((value) => {
					template = value;
				});
			})
			.addButton((button) =>
				button
					.setButtonText(pick(language, "Add", "新增"))
					.setCta()
					.onClick(async () => {
						const base = findTheme(this.plugin.settings, template) ?? BUILTIN_THEMES[0];
						const id = this.uniqueCustomId(base.id);
						this.plugin.settings.customThemes.push({
							id,
							name: `${base.name} copy`,
							dark: base.dark,
							variables: structuredClone(base.variables),
						});
						await this.plugin.saveSettings();
						this.display();
						this.plugin.refreshAll();
					}),
			);
	}

	private renderCustomTheme(list: HTMLElement, index: number, language: Language): void {
		const plugin = this.plugin;
		const theme = plugin.settings.customThemes[index];
		if (!theme) {
			return;
		}

		const block = list.createDiv({ cls: "cm-theme-editor" });

		new Setting(block)
			.setName(theme.id)
			.addText((text) =>
				text
					.setPlaceholder(pick(language, "Theme name", "主题名称"))
					.setValue(theme.name)
					.onChange(async (value) => {
						theme.name = value.trim() || theme.id;
						await plugin.saveSettings();
						plugin.refreshAll();
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip(pick(language, "Dark theme", "深色主题"))
					.setValue(theme.dark)
					.onChange(async (value) => {
						theme.dark = value;
						await plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip(pick(language, "Delete theme", "删除主题"))
					.onClick(async () => {
						plugin.settings.customThemes.splice(index, 1);
						await plugin.saveSettings();
						this.display();
						plugin.refreshAll();
					}),
			);

		const textarea = block.createEl("textarea", { cls: "cm-theme-json" });
		textarea.value = stringifyThemeVariables(theme.variables);
		textarea.spellcheck = false;
		textarea.setAttribute("rows", "10");

		const status = block.createDiv({
			cls: "cm-theme-status",
			text: pick(language, "Valid themeVariables JSON", "themeVariables JSON 合法"),
		});

		let timer = 0;
		textarea.addEventListener("input", () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				const result = parseThemeVariables(textarea.value);
				if (!result.ok) {
					status.setText(
						`${pick(
							language,
							"Invalid JSON — keeping the previous value.",
							"JSON 非法 — 保留上一版生效值。",
						)} ${result.error}`,
					);
					status.addClass("cm-invalid");
					textarea.addClass("cm-invalid");
					return;
				}
				status.setText(pick(language, "Valid themeVariables JSON", "themeVariables JSON 合法"));
				status.removeClass("cm-invalid");
				textarea.removeClass("cm-invalid");
				theme.variables = result.variables;
				void plugin.saveSettings().then(() => plugin.refreshAll());
			}, 600);
		});
	}

	private uniqueCustomId(base: string): string {
		const existing = new Set(this.plugin.settings.customThemes.map((theme) => theme.id));
		let candidate = `${base}-custom`;
		let counter = 1;
		while (existing.has(candidate)) {
			counter++;
			candidate = `${base}-custom-${counter}`;
		}
		return candidate;
	}

	private renderReset(containerEl: HTMLElement): void {
		const language = this.language;
		new Setting(containerEl).addButton((button) =>
			button.setButtonText(pick(language, "Restore default settings", "恢复默认设置")).onClick(async () => {
				await this.plugin.updateSettings(structuredClone(DEFAULT_SETTINGS));
				this.display();
			}),
		);
	}
}