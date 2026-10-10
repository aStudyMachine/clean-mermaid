import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type CleanMermaidPlugin from "./main";
import type { LanguageSetting } from "./i18n";
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

export interface CustomTheme {
	id: string;
	name: string;
	dark: boolean;
	variables: Record<string, unknown>;
}

export interface CleanMermaidSettings {
	/** 插件绘制的所有界面文案使用的语言。 */
	language: LanguageSetting;
	/** Obsidian 浅色外观下使用的主题。 */
	lightThemeId: string;
	/** Obsidian 深色外观下使用的主题。 */
	darkThemeId: string;
	/** 自动跟随 Obsidian 明暗；关闭则固定用某个主题。 */
	followAppearance: boolean;
	/** followAppearance 关闭时使用的主题。 */
	fixedThemeId: string;

	layoutEngine: LayoutEngine;
	elkMergeEdges: ElkMergeEdges;
	elkNodePlacement: ElkNodePlacement;

	fitMode: FitMode;
	/** 放大上限，单位是百分比（150 = 150%）。 */
	maxUpscale: number;
	/** 图表最大高度，占视口高度的百分比。 */
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

/** 内置主题改名为 Clean Light / Clean Dark 之前所使用的主题 id。 */
const LEGACY_THEME_IDS: Record<string, string> = {
	"codex-light": "clean-light",
	"codex-dark": "clean-dark",
};

/**
 * 把早期版本写入的配置映射到当前的主题 id，改名之后已保存的设置仍可继续使用。
 * 有内容被改写时返回 true。
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

/** 一次取值，参数顺序与 `plugin.t()` 一致：英文在前、中文在后。 */
type Translate = (english: string, chinese: string) => string;

export class CleanMermaidSettingTab extends PluginSettingTab {
	private readonly plugin: CleanMermaidPlugin;
	/** 「新增自定义主题」的模板选择只是界面临时状态，不入库。 */
	private themeTemplate = BUILTIN_THEMES[0].id;

	constructor(app: App, plugin: CleanMermaidPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		if (key === "pngScale") {
			return String(this.plugin.settings.pngScale);
		}
		return this.plugin.settings[key as keyof CleanMermaidSettings];
	}

	/**
	 * 必须覆写：基类的实现是直接往 `plugin.settings` 上写再 `saveData`，绕开了
	 * `updateSettings()`，而落盘之后还要重绘所有已渲染的卡片。
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "pngScale") {
			await this.plugin.updateSettings({ pngScale: Number(value) as PngScale });
		} else {
			await this.plugin.updateSettings({ [key]: value } as Partial<CleanMermaidSettings>);
		}
		if (key === "language") {
			// 面板自己的文案也要跟着换，声明式定义得重建。
			this.update();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const t: Translate = (english, chinese) => this.plugin.t(english, chinese);
		const themeOptions = this.themeOptions(t);

		return [
			{
				name: t("Language", "语言"),
				desc: t(
					"Language used by every string this plugin draws — card toolbar, menus and notices. “Auto” follows Obsidian's interface language.",
					"本插件所有界面文案使用的语言，包括卡片工具条、菜单与提示；“自动”跟随 Obsidian 的界面语言。",
				),
				control: {
					type: "dropdown",
					key: "language",
					options: {
						auto: t("Auto (follow Obsidian)", "自动（跟随 Obsidian）"),
						zh: "中文",
						en: "English",
					},
				},
			},
			{
				type: "group",
				heading: t("Appearance", "外观"),
				items: [
					{
						name: t("Light appearance theme", "浅色模式主题"),
						desc: t("Theme used while Obsidian is in light mode.", "Obsidian 处于浅色模式时使用的主题。"),
						control: { type: "dropdown", key: "lightThemeId", options: themeOptions },
					},
					{
						name: t("Dark appearance theme", "深色模式主题"),
						desc: t("Theme used while Obsidian is in dark mode.", "Obsidian 处于深色模式时使用的主题。"),
						control: { type: "dropdown", key: "darkThemeId", options: themeOptions },
					},
					{
						name: t("Follow Obsidian appearance", "跟随 Obsidian 明暗"),
						desc: t(
							"Switch between the light and dark theme automatically. Turn off to pin one theme.",
							"随 Obsidian 明暗自动切换主题；关闭后固定使用下方指定的主题。",
						),
						control: { type: "toggle", key: "followAppearance" },
					},
					{
						name: t("Fixed theme", "固定主题"),
						desc: t(
							"Used when “Follow Obsidian appearance” is off.",
							"当「跟随 Obsidian 明暗」关闭时使用的主题。",
						),
						control: { type: "dropdown", key: "fixedThemeId", options: themeOptions },
					},
				],
			},
			{
				type: "group",
				heading: t("Layout", "布局"),
				items: [
					{
						name: t("Layout engine", "布局引擎"),
						desc: t(
							"ELK gives cleaner layouts for complex flowcharts. Dagre is the classic mermaid engine.",
							"ELK 对复杂流程图排布更清晰；Dagre 是 mermaid 的经典引擎。",
						),
						control: {
							type: "dropdown",
							key: "layoutEngine",
							options: { elk: t("ELK (default)", "ELK（默认）"), dagre: "Dagre" },
						},
					},
					{
						name: t("ELK: merge edges", "ELK：合并连线"),
						desc: t(
							"Merge edges that connect the same node pair. “Mermaid default” leaves the engine's own setting untouched.",
							"合并连接同一对节点的多条连线；选「Mermaid 默认」则不改动引擎自带设置。",
						),
						control: {
							type: "dropdown",
							key: "elkMergeEdges",
							options: {
								default: t("Mermaid default", "Mermaid 默认"),
								on: t("Merge edges", "合并"),
								off: t("Keep separate", "保持分开"),
							},
						},
					},
					{
						name: t("ELK: node placement strategy", "ELK：节点排布策略"),
						desc: t(
							"Node ordering strategy used by the layered ELK algorithm.",
							"ELK 分层算法使用的节点排序策略。",
						),
						control: {
							type: "dropdown",
							key: "elkNodePlacement",
							options: {
								default: t("Mermaid default", "Mermaid 默认"),
								NETWORK_SIMPLEX: t("Network simplex", "网络单纯形"),
								BRANDES_KOEPF: "Brandes–Koepf",
								LINEAR_SEGMENTS: t("Linear segments", "线性分段"),
								SIMPLE: t("Simple", "简单"),
							},
						},
					},
					{
						name: t("Auto-fit", "自适应方式"),
						desc: t(
							"How diagrams are scaled to the editor space. Zooming manually always overrides this.",
							"图表如何缩放到编辑器空间；手动缩放后以手动缩放为准。",
						),
						control: {
							type: "dropdown",
							key: "fitMode",
							options: {
								width: t("Fit width", "适应宽度"),
								viewport: t("Fit width and height", "适应宽高"),
								raw: t("Natural size", "原始尺寸"),
							},
						},
					},
					{
						name: t("Maximum upscale", "最大放大倍率"),
						desc: t(
							"Upper limit for auto-fit upscaling, so small diagrams stay readable but not oversized.",
							"自适应放大的上限，避免小图被放得过大。",
						),
						control: { type: "slider", key: "maxUpscale", min: 100, max: 300, step: 10 },
					},
					{
						name: t("Maximum height", "最大高度"),
						desc: t(
							"Tall diagrams are capped to this share of the viewport height.",
							"过高的图表最多占用视口高度的这个比例。",
						),
						control: { type: "slider", key: "maxHeightVh", min: 40, max: 100, step: 5 },
					},
				],
			},
			{
				type: "group",
				heading: t("Interaction", "交互"),
				items: [
					{
						name: t("Ctrl/Cmd + scroll to zoom", "Ctrl/Cmd + 滚轮缩放"),
						desc: t("Plain scrolling keeps scrolling the note.", "普通滚轮仍然照常滚动笔记。"),
						control: { type: "toggle", key: "wheelZoom" },
					},
					{
						name: t("Drag to pan", "拖拽平移"),
						desc: t(
							"Drag a zoomed-in diagram with the left mouse button or a finger.",
							"放大后可用鼠标左键或手指拖动画布平移。",
						),
						control: { type: "toggle", key: "dragPan" },
					},
					{
						name: t("Toolbar visibility", "工具条显示方式"),
						control: {
							type: "dropdown",
							key: "toolbarMode",
							options: {
								hover: t("On hover", "悬停显示"),
								always: t("Always visible", "常显"),
							},
						},
					},
					{
						name: t("Double-click to reset zoom", "双击复位缩放"),
						desc: t(
							"Double-clicking a diagram returns it to auto-fit.",
							"双击图表可恢复到自适应状态。",
						),
						control: { type: "toggle", key: "doubleClickReset" },
					},
				],
			},
			{
				type: "group",
				heading: t("Rendering", "渲染"),
				items: [
					{
						name: t("Enable Clean Mermaid rendering", "启用 Clean Mermaid 渲染"),
						desc: t(
							"When off, diagrams are rendered with mermaid's stock look instead of the clean card.",
							"关闭后图表改用 mermaid 原生外观渲染，不再套用卡片样式。",
						),
						control: { type: "toggle", key: "enableRendering" },
					},
					{
						name: t("Render as image", "图片化渲染"),
						desc: t(
							"Display the diagram as an <img> (SVG data URL) so Obsidian themes cannot restyle it. Turn off to keep the live SVG.",
							"以 <img>（SVG data URL）方式显示图表，避免被 Obsidian 主题样式影响；关闭则保留内联 SVG。",
						),
						control: { type: "toggle", key: "imageify" },
					},
					{
						name: t("Support %% cm: %% directives", "支持 %% cm: %% 指令"),
						desc: t(
							"Allow per-diagram overrides like %% cm:theme=neutral %%, %% cm:layout=dagre %% and %% cm:plain %%.",
							"允许按图覆盖设置，例如 %% cm:theme=neutral %%、%% cm:layout=dagre %%、%% cm:plain %%。",
						),
						control: { type: "toggle", key: "enableDirectives" },
					},
				],
			},
			{
				type: "group",
				heading: t("Export", "导出"),
				items: [
					{
						name: t("PNG resolution", "PNG 分辨率"),
						desc: t(
							"Export scale factor for downloaded and copied PNG images.",
							"下载或复制 PNG 时使用的放大倍率。",
						),
						control: {
							type: "dropdown",
							key: "pngScale",
							options: { "1": "1×", "2": t("2× (default)", "2×（默认）"), "3": "3×" },
						},
					},
					{
						name: t("PNG background", "PNG 背景"),
						desc: t(
							"Use the theme background colour for PNG exports, or keep the background transparent.",
							"导出 PNG 时使用主题背景色，或保持透明背景。",
						),
						control: {
							type: "dropdown",
							key: "pngBackground",
							options: {
								theme: t("Theme background", "主题背景"),
								transparent: t("Transparent", "透明"),
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: t("Custom themes", "自定义主题"),
				items: [
					{
						name: "",
						render: (setting: Setting) => {
							// 这一节有自己的 DOM 结构与配套样式，整段按原样画，不交给框架排版。
							setting.settingEl.empty();
							this.renderCustomThemes(setting.settingEl, t);
						},
					},
				],
			},
			{
				name: "",
				render: (setting: Setting) => {
					setting.addButton((button) =>
						button
							.setButtonText(t("Restore default settings", "恢复默认设置"))
							.onClick(async () => {
								await this.plugin.updateSettings(structuredClone(DEFAULT_SETTINGS));
								this.update();
							}),
					);
				},
			},
		];
	}

	private themeOptions(t: Translate): Record<string, string> {
		const options: Record<string, string> = {};
		for (const theme of allThemes(this.plugin.settings)) {
			options[theme.id] = theme.builtin ? theme.name : `${theme.name}${t(" (custom)", "（自定义）")}`;
		}
		return options;
	}

	private renderCustomThemes(containerEl: HTMLElement, t: Translate): void {
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: t(
				"A custom theme is a plain Mermaid themeVariables object. Start from a built-in theme, then adjust the colours. Invalid JSON is rejected and the last valid version stays in effect.",
				"自定义主题就是一份 Mermaid themeVariables JSON。可从内置主题复制后调整配色；非法 JSON 会被拒绝并保留上一版生效值。",
			),
		});

		const list = containerEl.createDiv({ cls: "cm-theme-list" });
		this.plugin.settings.customThemes.forEach((_theme, index) =>
			this.renderCustomTheme(list, index, t),
		);

		new Setting(containerEl)
			.setName(t("Add custom theme", "新增自定义主题"))
			.setDesc(
				t(
					"Creates a new theme seeded from the selected built-in theme.",
					"基于所选内置主题复制出一个新的自定义主题。",
				),
			)
			.addDropdown((dropdown) => {
				for (const builtin of BUILTIN_THEMES) {
					dropdown.addOption(builtin.id, builtin.name);
				}
				dropdown.setValue(this.themeTemplate).onChange((value) => {
					this.themeTemplate = value;
				});
			})
			.addButton((button) =>
				button
					.setButtonText(t("Add", "新增"))
					.setCta()
					.onClick(async () => {
						const base = findTheme(this.plugin.settings, this.themeTemplate) ?? BUILTIN_THEMES[0];
						this.plugin.settings.customThemes.push({
							id: this.uniqueCustomId(base.id),
							name: `${base.name} copy`,
							dark: base.dark,
							variables: structuredClone(base.variables),
						});
						await this.plugin.saveSettings();
						this.update();
						this.plugin.refreshAll();
					}),
			);
	}

	private renderCustomTheme(list: HTMLElement, index: number, t: Translate): void {
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
					.setPlaceholder(t("Theme name", "主题名称"))
					.setValue(theme.name)
					.onChange(async (value) => {
						theme.name = value.trim() || theme.id;
						await plugin.saveSettings();
						plugin.refreshAll();
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip(t("Dark theme", "深色主题"))
					.setValue(theme.dark)
					.onChange(async (value) => {
						theme.dark = value;
						await plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip(t("Delete theme", "删除主题"))
					.onClick(async () => {
						plugin.settings.customThemes.splice(index, 1);
						await plugin.saveSettings();
						this.update();
						plugin.refreshAll();
					}),
			);

		const textarea = block.createEl("textarea", { cls: "cm-theme-json" });
		textarea.value = stringifyThemeVariables(theme.variables);
		textarea.spellcheck = false;
		textarea.setAttribute("rows", "10");

		const status = block.createDiv({
			cls: "cm-theme-status",
			text: t("Valid themeVariables JSON", "themeVariables JSON 合法"),
		});

		let timer = 0;
		textarea.addEventListener("input", () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				const result = parseThemeVariables(textarea.value);
				if (!result.ok) {
					status.setText(
						`${t(
							"Invalid JSON — keeping the previous value.",
							"JSON 非法 — 保留上一版生效值。",
						)} ${result.error}`,
					);
					status.addClass("cm-invalid");
					textarea.addClass("cm-invalid");
					return;
				}
				status.setText(t("Valid themeVariables JSON", "themeVariables JSON 合法"));
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
}
