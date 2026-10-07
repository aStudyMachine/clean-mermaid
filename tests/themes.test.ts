import { describe, expect, it } from "vitest";
import {
	BUILTIN_THEMES,
	allThemes,
	customToDefinition,
	findTheme,
	parseThemeVariables,
	resolveActiveTheme,
	stringifyThemeVariables,
	themeCanvasColor,
	themeIdentity,
	type ThemeDefinition,
} from "../src/themes";
import type { CleanMermaidSettings } from "../src/settings";

// Mirrors DEFAULT_SETTINGS, kept here so the tests never import settings.ts (which needs Obsidian).
const base: CleanMermaidSettings = {
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

const settings = (over: Partial<CleanMermaidSettings> = {}): CleanMermaidSettings => ({
	...base,
	...over,
});

const custom = (id: string, mainBkg: string, dark = false): ThemeDefinition => ({
	id,
	name: id,
	dark,
	builtin: false,
	variables: { mainBkg, background: "#ffffff" },
});

describe("themeIdentity", () => {
	it("has no theme collapse to the shared none marker", () => {
		expect(themeIdentity(null)).toBe("none");
	});

	it("separates same-id themes whose colours differ — the point of the whole function", () => {
		expect(themeIdentity(custom("t", "#111111"))).not.toBe(themeIdentity(custom("t", "#222222")));
	});

	it("is stable for equal content", () => {
		expect(themeIdentity(custom("t", "#111111"))).toBe(themeIdentity(custom("t", "#111111")));
	});

	it("counts the dark flag, which drives the background fallback", () => {
		expect(themeIdentity(custom("t", "#111111", false))).not.toBe(themeIdentity(custom("t", "#111111", true)));
	});

	it("carries the id, so different ids never share an identity", () => {
		expect(themeIdentity(custom("a", "#111111"))).not.toBe(themeIdentity(custom("b", "#111111")));
	});
});

describe("built-in themes", () => {
	it("keeps the four documented ids in order", () => {
		expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual([
			"clean-light",
			"clean-dark",
			"neutral",
			"github-light",
		]);
		expect(BUILTIN_THEMES.every((theme) => theme.builtin)).toBe(true);
	});

	it("sets mainBkg, not just primaryColor, because node fill comes from mainBkg", () => {
		for (const theme of BUILTIN_THEMES) {
			expect(theme.variables.mainBkg).toBeTruthy();
			expect(theme.variables.mainBkg).toBe(theme.variables.primaryColor);
		}
	});

	it("paints flowchart nodes and their border with different colours", () => {
		for (const theme of BUILTIN_THEMES) {
			expect(theme.variables.nodeBorder).toBeTruthy();
			expect(theme.variables.nodeBorder).not.toBe(theme.variables.mainBkg);
		}
	});
});

describe("custom themes", () => {
	it("appends custom themes after the built-ins and marks them as custom", () => {
		const list = allThemes(settings({ customThemes: [customToDefinition(custom("mine", "#abcdef"))] }));
		expect(list).toHaveLength(BUILTIN_THEMES.length + 1);
		expect(list[list.length - 1].builtin).toBe(false);
		expect(findTheme(settings({ customThemes: [customToDefinition(custom("mine", "#abcdef"))] }), "mine")?.id).toBe(
			"mine",
		);
	});

	it("returns undefined for an unknown id", () => {
		expect(findTheme(settings(), "nope")).toBeUndefined();
	});
});

describe("parseThemeVariables", () => {
	it("accepts a JSON object", () => {
		const parsed = parseThemeVariables('{ "mainBkg": "#abcdef" }');
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.variables.mainBkg).toBe("#abcdef");
		}
	});

	it("rejects malformed JSON with a message", () => {
		const parsed = parseThemeVariables("{ mainBkg: }");
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error.length).toBeGreaterThan(0);
		}
	});

	it("rejects anything that is not a plain object", () => {
		for (const text of ['[1,2]', '"string"', "null", "42", "true"]) {
			const parsed = parseThemeVariables(text);
			expect(parsed.ok).toBe(false);
			if (!parsed.ok) {
				expect(parsed.error).toContain("JSON object");
			}
		}
	});

	it("round-trips through stringify", () => {
		const variables = { mainBkg: "#abcdef", lineColor: "#123456", nested: { a: 1 } };
		const parsed = parseThemeVariables(stringifyThemeVariables(variables));
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.variables).toEqual(variables);
		}
	});
});

describe("resolveActiveTheme", () => {
	it("follows the appearance when asked to", () => {
		expect(resolveActiveTheme(settings(), true).id).toBe("clean-dark");
		expect(resolveActiveTheme(settings(), false).id).toBe("clean-light");
	});

	it("pins the fixed theme when not following the appearance", () => {
		const pinned = settings({ followAppearance: false, fixedThemeId: "neutral" });
		expect(resolveActiveTheme(pinned, true).id).toBe("neutral");
		expect(resolveActiveTheme(pinned, false).id).toBe("neutral");
	});

	it("lets a per-diagram override win over both", () => {
		expect(resolveActiveTheme(settings(), true, "neutral").id).toBe("neutral");
		expect(resolveActiveTheme(settings({ followAppearance: false, fixedThemeId: "neutral" }), false, "github-light").id).toBe(
			"github-light",
		);
	});

	it("ignores an override id that does not exist", () => {
		expect(resolveActiveTheme(settings(), false, "ghost").id).toBe("clean-light");
	});

	it("falls back to the clean pair when the configured id is gone", () => {
		const dangling = settings({ lightThemeId: "deleted-theme", followAppearance: true });
		expect(resolveActiveTheme(dangling, false).id).toBe("clean-light");
		expect(resolveActiveTheme(dangling, true).id).toBe("clean-dark");
	});

	it("resolves a custom theme by id", () => {
		const withCustom = settings({ customThemes: [customToDefinition(custom("mine", "#abcdef", true))] });
		expect(resolveActiveTheme(withCustom, true, "mine").id).toBe("mine");
	});
});

describe("themeCanvasColor", () => {
	it("prefers the theme background variable", () => {
		expect(themeCanvasColor({ ...custom("t", "#111111"), variables: { background: "#123123" } })).toBe("#123123");
	});

	it("ignores a blank background and falls back by appearance", () => {
		const light = { ...custom("t", "#111111"), variables: { background: "   " } };
		expect(themeCanvasColor(light)).toBe("#ffffff");
		expect(themeCanvasColor({ ...light, dark: true })).toBe("#1e1e24");
	});

	it("treats plain mode (no theme) as a light canvas", () => {
		expect(themeCanvasColor(null)).toBe("#ffffff");
	});
});
