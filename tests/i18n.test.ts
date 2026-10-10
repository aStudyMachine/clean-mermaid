import { afterEach, describe, expect, it } from "vitest";
import { detectObsidianLanguage, pick, resolveLanguage } from "../src/i18n";

const globals = globalThis as unknown as Record<string, unknown>;
const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function stubBrowserLanguage(navigatorLanguage: string): void {
	Object.defineProperty(globals, "navigator", {
		value: { language: navigatorLanguage },
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	if (savedNavigator) {
		Object.defineProperty(globalThis, "navigator", savedNavigator);
	} else {
		delete globals.navigator;
	}
});

describe("resolveLanguage", () => {
	it("honours an explicit choice whatever Obsidian says", () => {
		expect(resolveLanguage("zh", "en")).toBe("zh");
		expect(resolveLanguage("en", "zh-cn")).toBe("en");
	});

	it("auto follows the Obsidian UI language, including regional variants", () => {
		expect(resolveLanguage("auto", "zh-cn")).toBe("zh");
		expect(resolveLanguage("auto", "zh-TW")).toBe("zh");
		expect(resolveLanguage("auto", "en")).toBe("en");
		expect(resolveLanguage("auto", "ja")).toBe("en");
	});

	it("auto falls back to the browser language when Obsidian reports nothing", () => {
		stubBrowserLanguage("zh-CN");
		expect(resolveLanguage("auto", null)).toBe("zh");
		expect(resolveLanguage("auto", "")).toBe("zh");
		stubBrowserLanguage("en-GB");
		expect(resolveLanguage("auto", null)).toBe("en");
	});

	it("a UI language Obsidian did resolve is never second-guessed by the browser one", () => {
		stubBrowserLanguage("zh-CN");
		expect(resolveLanguage("auto", "fr")).toBe("en");
	});

	it("detectObsidianLanguage is what auto delegates to", () => {
		stubBrowserLanguage("en-US");
		expect(detectObsidianLanguage("zh")).toBe("zh");
	});
});

describe("pick", () => {
	it("selects by language", () => {
		expect(pick("en", "More actions", "更多操作")).toBe("More actions");
		expect(pick("zh", "More actions", "更多操作")).toBe("更多操作");
	});
});
