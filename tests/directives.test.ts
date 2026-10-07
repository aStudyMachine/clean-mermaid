import { describe, expect, it } from "vitest";
import { parseBlockDirectives } from "../src/directives";

describe("parseBlockDirectives", () => {
	it("reads a theme override and strips the directive line", () => {
		const { directives, code } = parseBlockDirectives("%% cm:theme=neutral %%\nflowchart LR\n  A-->B", true);
		expect(directives.themeId).toBe("neutral");
		expect(code).toBe("flowchart LR\n  A-->B");
	});

	it("accepts only elk and dagre for the layout override", () => {
		expect(parseBlockDirectives("%% cm:layout=elk %%\nflowchart LR", true).directives.layout).toBe("elk");
		expect(parseBlockDirectives("%% cm:layout=dagre %%\nflowchart LR", true).directives.layout).toBe("dagre");
		const bogus = parseBlockDirectives("%% cm:layout=dot %%\nflowchart LR", true);
		expect(bogus.directives.layout).toBeUndefined();
		// The line is still a directive line, so it never reaches mermaid.
		expect(bogus.code).toBe("flowchart LR");
	});

	it("flags plain mode", () => {
		expect(parseBlockDirectives("%% cm:plain %%\nflowchart LR", true).directives.plain).toBe(true);
	});

	it("reads several stacked directives", () => {
		const { directives, code } = parseBlockDirectives(
			"%% cm:theme=github-light %%\n%% cm:layout=dagre %%\n%% cm:plain %%\nflowchart LR",
			true,
		);
		expect(directives).toEqual({ themeId: "github-light", layout: "dagre", plain: true });
		expect(code).toBe("flowchart LR");
	});

	it("ignores unknown keys and valueless theme directives but still strips them", () => {
		const { directives, code } = parseBlockDirectives("%% cm:theme= %%\n%% cm:foo=bar %%\nflowchart LR", true);
		expect(directives).toEqual({});
		expect(code).toBe("flowchart LR");
	});

	it("only consumes directives at the top of the block", () => {
		const source = "flowchart LR\n%% cm:plain %%\n  A-->B";
		const { directives, code } = parseBlockDirectives(source, true);
		expect(directives.plain).toBeUndefined();
		expect(code).toBe(source);
	});

	it("keeps the blank lines that precede the directives", () => {
		expect(parseBlockDirectives("\n\n%% cm:plain %%\nflowchart LR", true).code).toBe("\n\nflowchart LR");
	});

	it("is case sensitive about the cm: namespace", () => {
		const source = "%% CM:theme=neutral %%\nflowchart LR";
		const { directives, code } = parseBlockDirectives(source, true);
		expect(directives.themeId).toBeUndefined();
		expect(code).toBe(source);
	});

	it("leaves the source untouched when directives are disabled", () => {
		const source = "%% cm:theme=neutral %%\n%% cm:plain %%\nflowchart LR";
		const { directives, code } = parseBlockDirectives(source, false);
		expect(directives).toEqual({});
		expect(code).toBe(source);
	});

	it("handles CRLF sources", () => {
		const { directives, code } = parseBlockDirectives("%% cm:plain %%\r\nflowchart LR\r\n  A-->B", true);
		expect(directives.plain).toBe(true);
		expect(code).toBe("flowchart LR\n  A-->B");
	});

	it("returns an empty source as-is when there is nothing to strip", () => {
		expect(parseBlockDirectives("", true)).toEqual({ directives: {}, code: "" });
	});
});
