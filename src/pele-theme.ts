import JSON5 from "json5";
import { parseDocument } from "yaml";
import { isPlainObject, SYSTEM_FONT_STACK, type ThemeDefinition } from "./themes";

const COLOR_FIELDS: Record<string, string[]> = {
	bg: ["background"],
	fg: ["primaryTextColor", "nodeTextColor", "textColor"],
	muted: ["titleColor", "secondaryTextColor"],
	line: ["lineColor"],
	surface: ["primaryColor", "mainBkg"],
	"surface-alt": ["secondaryColor", "clusterBkg", "tertiaryColor"],
	border: ["primaryBorderColor", "nodeBorder", "clusterBorder"],
	accent: ["primaryBorderColor", "nodeBorder"],
	error: ["errorBkgColor"],
};

/** 只返回输入中实际指定的字段，让源码中的别名也能覆盖主题默认值。 */
export function peleThemeOverrides(variables: Record<string, unknown>, sequence = false): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, fields] of Object.entries(COLOR_FIELDS)) {
		const preferred = sequence ? ({ surface: ["actorBkg"], border: ["actorBorder"], fg: ["actorTextColor"], line: ["signalColor"] } as Record<string, string[]>)[key] ?? [] : [];
		const value = [...preferred, ...fields].map((field) => variables[field]).find((item) => typeof item === "string" && item.trim());
		if (typeof value === "string") result[`--pele-${key}`] = value;
	}
	if (typeof variables.fontFamily === "string") result["--pele-font"] = variables.fontFamily;
	return result;
}

/** 宿主 1.8 尚未兼容 Mermaid 的序列调色板，显式写成独立 SVG 的变量。 */
export function peleSeries(variables: Record<string, unknown>, source: string): Record<string, string> {
	const pie = /^\s*pie(?:\s|$)/m.test(source);
	const git = /^\s*gitGraph(?:\s|:|$)/m.test(source);
	const result: Record<string, string> = {};
	for (let i = 0; i < 8; i++) {
		const value = variables[pie ? `pie${i + 1}` : git ? `git${i}` : `cScale${i}`];
		if (typeof value === "string") result[`--pele-series-${i + 1}`] = value;
	}
	return result;
}

/** 只转换配色，不改写用户保存的 themeVariables。 */
export function peleTheme(theme: ThemeDefinition, sequence = false, overrides: Record<string, unknown> = {}): Record<string, string> {
	const fallback = theme.dark
		? { bg: "#1e1e24", fg: "#e4e4e7", surface: "#2c2c38", border: "#8b7de0", line: "#71717a", muted: "#a1a1aa", "surface-alt": "#26262e", accent: "#8b7de0", error: "#e45756" }
		: { bg: "#ffffff", fg: "#3f3f46", surface: "#f1effc", border: "#c4b5fd", line: "#a1a1aa", muted: "#52525b", "surface-alt": "#f4f2ff", accent: "#c4b5fd", error: "#e45756" };
	const palette = ["#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2", "#eeca3b", "#b279a2", "#9d755d"];
	return {
		...Object.fromEntries(Object.entries(fallback).map(([key, value]) => [`--pele-${key}`, value])),
		...Object.fromEntries(palette.map((value, i) => [`--pele-series-${i + 1}`, value])),
		"--pele-fg-on-light": "#1f1f1f", "--pele-fg-on-dark": "#ffffff", "--pele-critical": "#e45756",
		"--pele-font": SYSTEM_FONT_STACK, "--pele-font-mono": "monospace",
		"--pele-radius": "4px", "--pele-title-weight": "bold", "--pele-heading-weight": "bold", "--pele-bold-weight": "bold",
		...peleThemeOverrides(theme.variables, sequence), ...peleThemeOverrides(overrides, sequence),
	};
}

const supported = new Set([...Object.values(COLOR_FIELDS).flat(), "fontFamily", "fontSize", "actorBkg", "actorBorder", "actorTextColor", "signalColor"]);

export function unmappedThemeFields(variables: Record<string, unknown>): string[] {
	return Object.keys(variables).filter((key) => !supported.has(key) && !/^(?:pie[1-8]|git[0-7]|cScale[0-7])$/.test(key));
}

/** 与 Pele 的优先级一致：frontmatter 在前，多条 init 按出现顺序覆盖。 */
export function sourcePeleConfig(source: string): {
	themeVariables: Record<string, unknown>;
	elk: Record<string, unknown>;
	layout: unknown;
} {
	const result = { themeVariables: {}, elk: {}, layout: undefined as unknown };
	const add = (config: unknown): void => {
		if (!isPlainObject(config)) return;
		if (isPlainObject(config.themeVariables)) result.themeVariables = { ...result.themeVariables, ...config.themeVariables };
		if (isPlainObject(config.elk)) result.elk = { ...result.elk, ...config.elk };
		if ("layout" in config) result.layout = config.layout;
	};
	const header = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(source);
	if (header) {
		const doc = parseDocument(header[1]);
		if (doc.errors.length === 0) {
			const value: unknown = doc.toJS({ maxAliasCount: 100 });
			if (isPlainObject(value)) add(value.config);
		}
	}
	for (const match of source.matchAll(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}%%/gi)) {
		try { add(JSON5.parse(match[1])); } catch { /* 语法错误交给 Pele 统一报告。 */ }
	}
	return result;
}
