import type { CustomTheme, CleanMermaidSettings } from "./settings";

export const SYSTEM_FONT_STACK =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export interface ThemeDefinition {
	id: string;
	name: string;
	dark: boolean;
	builtin: boolean;
	variables: Record<string, unknown>;
}

/**
 * Clean Light — 对齐参考截图：白色画布、淡紫节点、灰色连线。
 * 连线标签底色为柔和的淡紫小块。
 */
const CLEAN_LIGHT: ThemeDefinition = {
	id: "clean-light",
	name: "Clean Light",
	dark: false,
	builtin: true,
	variables: {
		background: "#ffffff",
		fontFamily: SYSTEM_FONT_STACK,
		fontSize: "14px",
		// 节点
		primaryColor: "#f1effc",
		primaryBorderColor: "#c4b5fd",
		primaryTextColor: "#3f3f46",
		mainBkg: "#f1effc",
		nodeBorder: "#c4b5fd",
		nodeTextColor: "#3f3f46",
		// 次级 / 三级配色面
		secondaryColor: "#f4f2ff",
		secondaryBorderColor: "#d8d1f7",
		secondaryTextColor: "#3f3f46",
		tertiaryColor: "#fafaff",
		tertiaryBorderColor: "#e4e4e7",
		tertiaryTextColor: "#52525b",
		// 连线与标签
		lineColor: "#a1a1aa",
		textColor: "#3f3f46",
		titleColor: "#52525b",
		clusterBkg: "#fafafa",
		clusterBorder: "#e4e4e7",
		edgeLabelBackground: "#f4f2ff",
		// 时序图
		actorBkg: "#f1effc",
		actorBorder: "#c4b5fd",
		actorTextColor: "#3f3f46",
		actorLineColor: "#a1a1aa",
		signalColor: "#71717a",
		signalTextColor: "#52525b",
		labelBoxBkgColor: "#f4f2ff",
		labelBoxBorderColor: "#c4b5fd",
		labelTextColor: "#3f3f46",
		loopTextColor: "#52525b",
		noteBkgColor: "#fbfbfd",
		noteBorderColor: "#e4e4e7",
		noteTextColor: "#3f3f46",
		activationBkgColor: "#e9e4fb",
		activationBorderColor: "#c4b5fd",
		sequenceNumberColor: "#ffffff",
	},
};

/** Clean Dark —— Clean Light 的深色外观版本。 */
const CLEAN_DARK: ThemeDefinition = {
	id: "clean-dark",
	name: "Clean Dark",
	dark: true,
	builtin: true,
	variables: {
		background: "#1e1e24",
		fontFamily: SYSTEM_FONT_STACK,
		fontSize: "14px",
		primaryColor: "#2c2c38",
		primaryBorderColor: "#8b7de0",
		primaryTextColor: "#e4e4e7",
		mainBkg: "#2c2c38",
		nodeBorder: "#8b7de0",
		nodeTextColor: "#e4e4e7",
		secondaryColor: "#26262e",
		secondaryBorderColor: "#5b4fa8",
		secondaryTextColor: "#d4d4d8",
		tertiaryColor: "#232329",
		tertiaryBorderColor: "#3f3f46",
		tertiaryTextColor: "#a1a1aa",
		lineColor: "#71717a",
		textColor: "#d4d4d8",
		titleColor: "#a1a1aa",
		clusterBkg: "#26262e",
		clusterBorder: "#3f3f46",
		edgeLabelBackground: "#26262e",
		actorBkg: "#2c2c38",
		actorBorder: "#8b7de0",
		actorTextColor: "#e4e4e7",
		actorLineColor: "#71717a",
		signalColor: "#a1a1aa",
		signalTextColor: "#d4d4d8",
		labelBoxBkgColor: "#26262e",
		labelBoxBorderColor: "#5b4fa8",
		labelTextColor: "#d4d4d8",
		loopTextColor: "#a1a1aa",
		noteBkgColor: "#26262e",
		noteBorderColor: "#3f3f46",
		noteTextColor: "#d4d4d8",
		activationBkgColor: "#3a3159",
		activationBorderColor: "#8b7de0",
		sequenceNumberColor: "#1e1e24",
	},
};

/** Neutral —— 近乎单色，适合打印。 */
const NEUTRAL: ThemeDefinition = {
	id: "neutral",
	name: "Neutral",
	dark: false,
	builtin: true,
	variables: {
		background: "#ffffff",
		fontFamily: SYSTEM_FONT_STACK,
		fontSize: "14px",
		primaryColor: "#fafafa",
		primaryBorderColor: "#d4d4d8",
		primaryTextColor: "#27272a",
		mainBkg: "#fafafa",
		nodeBorder: "#d4d4d8",
		nodeTextColor: "#27272a",
		secondaryColor: "#f4f4f5",
		tertiaryColor: "#fafafa",
		lineColor: "#a1a1aa",
		textColor: "#27272a",
		titleColor: "#52525b",
		clusterBkg: "#fafafa",
		clusterBorder: "#e4e4e7",
		edgeLabelBackground: "#f4f4f5",
		actorBkg: "#fafafa",
		actorBorder: "#d4d4d8",
		actorTextColor: "#27272a",
		actorLineColor: "#a1a1aa",
		signalColor: "#71717a",
		signalTextColor: "#52525b",
		noteBkgColor: "#fafafa",
		noteBorderColor: "#e4e4e7",
		noteTextColor: "#27272a",
	},
};

/** GitHub Light —— 大家熟悉的 mermaid 默认配色。 */
const GITHUB_LIGHT: ThemeDefinition = {
	id: "github-light",
	name: "GitHub Light",
	dark: false,
	builtin: true,
	variables: {
		background: "#ffffff",
		fontFamily: SYSTEM_FONT_STACK,
		fontSize: "14px",
		primaryColor: "#ececff",
		primaryBorderColor: "#9370db",
		primaryTextColor: "#333333",
		mainBkg: "#ececff",
		nodeBorder: "#9370db",
		nodeTextColor: "#333333",
		secondaryColor: "#ffffde",
		tertiaryColor: "#ffffde",
		lineColor: "#333333",
		textColor: "#333333",
		titleColor: "#333333",
		clusterBkg: "#ffffde",
		clusterBorder: "#aaaa33",
		edgeLabelBackground: "#ffffff",
		actorBkg: "#ececff",
		actorBorder: "#9370db",
		actorTextColor: "#333333",
		actorLineColor: "#cccccc",
		signalColor: "#333333",
		signalTextColor: "#333333",
		noteBkgColor: "#fff5ad",
		noteBorderColor: "#aaaa33",
		noteTextColor: "#333333",
	},
};

export const BUILTIN_THEMES: ThemeDefinition[] = [CLEAN_LIGHT, CLEAN_DARK, NEUTRAL, GITHUB_LIGHT];

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParseVariablesResult =
	| { ok: true; variables: Record<string, unknown> }
	| { ok: false; error: string };

/** 校验用户手改的 themeVariables JSON 字符串。 */
export function parseThemeVariables(text: string): ParseVariablesResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	if (!isPlainObject(parsed)) {
		return { ok: false, error: "The value must be a JSON object, e.g. { \"primaryColor\": \"#f1effc\" }" };
	}
	return { ok: true, variables: parsed };
}

export function stringifyThemeVariables(variables: Record<string, unknown>): string {
	return JSON.stringify(variables, null, 2);
}

export function customToDefinition(custom: CustomTheme): ThemeDefinition {
	return {
		id: custom.id,
		name: custom.name,
		dark: custom.dark,
		builtin: false,
		variables: custom.variables,
	};
}

export function allThemes(settings: CleanMermaidSettings): ThemeDefinition[] {
	return [...BUILTIN_THEMES, ...settings.customThemes.map(customToDefinition)];
}

export function findTheme(settings: CleanMermaidSettings, id: string): ThemeDefinition | undefined {
	return allThemes(settings).find((theme) => theme.id === id);
}

/** 用户没有设置单图覆盖时使用的主题。 */
export function resolveActiveTheme(
	settings: CleanMermaidSettings,
	isDark: boolean,
	overrideId?: string,
): ThemeDefinition {
	const fallback = findTheme(settings, isDark ? settings.darkThemeId : settings.lightThemeId);
	if (overrideId) {
		const override = findTheme(settings, overrideId);
		if (override) {
			return override;
		}
	}
	if (!settings.followAppearance) {
		const fixed = findTheme(settings, settings.fixedThemeId);
		if (fixed) {
			return fixed;
		}
	}
	return fallback ?? (isDark ? CLEAN_DARK : CLEAN_LIGHT);
}

/**
 * 主题实际用来着色的内容标识，这样「编辑已有自定义主题」能和「切换主题」区分开。
 * `dark` 也算进标识，是因为主题没有 `background` 变量时，卡片和 PNG 背景会回退到它。
 */
export function themeIdentity(theme: ThemeDefinition | null): string {
	if (!theme) {
		return "none";
	}
	return `${theme.id}|${theme.dark ? "dark" : "light"}|${JSON.stringify(theme.variables)}`;
}

/** 图表卡片的背景色 —— 同时用作 PNG 导出的背景色。 */
export function themeCanvasColor(theme: ThemeDefinition | null): string {
	const background = theme?.variables["background"];
	if (typeof background === "string" && background.trim() !== "") {
		return background;
	}
	return theme?.dark ? "#1e1e24" : "#ffffff";
}