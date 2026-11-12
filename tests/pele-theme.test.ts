import { describe, expect, it } from "vitest";
import { peleSeries, peleTheme, sourceThemeVariables, unmappedThemeFields } from "../src/pele-theme";
import { BUILTIN_THEMES } from "../src/themes";

describe("Pele theme compatibility", () => {
	it("converts the four themes without changing their original data", () => {
		for (const theme of BUILTIN_THEMES) {
			const original = JSON.stringify(theme);
			const mapped = peleTheme(theme);
			expect(mapped["--pele-bg"]).toBe(theme.variables.background);
			expect(mapped["--pele-surface"]).toBe(theme.variables.primaryColor);
			expect(JSON.stringify(theme)).toBe(original);
		}
	});
	it("reports unsupported fields while accepting supported series palettes", () => {
		expect(unmappedThemeFields({ primaryColor: "red", pie1: "green", signalTextColor: "blue", customKey: true })).toEqual(["signalTextColor", "customKey"]);
	});
	it("uses sequence-specific colours", () => {
		const theme = { ...BUILTIN_THEMES[0], variables: { primaryColor: "red", actorBkg: "blue" } };
		expect(peleTheme(theme, true)["--pele-surface"]).toBe("blue");
	});
	it("lets a source alias override the built-in primary colour", () => {
		expect(peleTheme(BUILTIN_THEMES[0], false, { mainBkg: "red" })["--pele-surface"]).toBe("red");
	});
	it("maps each diagram's sequence palette to Pele variables", () => {
		const variables = { pie1: "red", git0: "blue", cScale0: "green" };
		expect(peleSeries(variables, "pie\n\"A\":1")["--pele-series-1"]).toBe("red");
		expect(peleSeries(variables, "gitGraph\ncommit")["--pele-series-1"]).toBe("blue");
		expect(peleSeries(variables, "gitGraph:\ncommit")["--pele-series-1"]).toBe("blue");
		expect(peleSeries(variables, "timeline\n2026 : A")["--pele-series-1"]).toBe("green");
	});
	it("merges frontmatter and multiple JSON5 init directives in source order", () => {
		const source = `---\nconfig:\n  themeVariables:\n    primaryColor: red\n    lineColor: gray\n---\n%%{init: {themeVariables: {primaryColor: 'blue'}}}%%\n%%{init: {themeVariables: {primaryColor: 'green'}}}%%\nflowchart TD\nA-->B`;
		expect(sourceThemeVariables(source)).toEqual({ primaryColor: "green", lineColor: "gray" });
	});
});
