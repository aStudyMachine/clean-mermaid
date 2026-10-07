import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectObsidianLanguage, pick, resolveLanguage } from "../src/i18n";

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, PropertyDescriptor | undefined> = {};

function stubEnvironment(stored: string | null, navigatorLanguage: string, storageThrows = false): void {
	Object.defineProperty(globals, "window", {
		value: {
			localStorage: {
				getItem: () => {
					if (storageThrows) {
						throw new Error("storage is blocked");
					}
					return stored;
				},
			},
		},
		configurable: true,
		writable: true,
	});
	Object.defineProperty(globals, "navigator", {
		value: { language: navigatorLanguage },
		configurable: true,
		writable: true,
	});
}

beforeEach(() => {
	saved.window = Object.getOwnPropertyDescriptor(globalThis, "window");
	saved.navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
});

afterEach(() => {
	for (const name of ["window", "navigator"]) {
		const descriptor = saved[name];
		if (descriptor) {
			Object.defineProperty(globalThis, name, descriptor);
		} else {
			delete globals[name];
		}
	}
});

describe("resolveLanguage", () => {
	it("honours an explicit choice whatever the environment says", () => {
		stubEnvironment("en", "en-US");
		expect(resolveLanguage("zh")).toBe("zh");
		expect(resolveLanguage("en")).toBe("en");
	});

	it("auto follows the language Obsidian stored, including regional variants", () => {
		stubEnvironment("zh-TW", "en-US");
		expect(resolveLanguage("auto")).toBe("zh");
		stubEnvironment("en", "de-DE");
		expect(resolveLanguage("auto")).toBe("en");
		stubEnvironment("ja", "en-US");
		expect(resolveLanguage("auto")).toBe("en");
	});

	it("auto falls back to the browser language when nothing is stored", () => {
		stubEnvironment(null, "zh-CN");
		expect(resolveLanguage("auto")).toBe("zh");
		stubEnvironment(null, "en-GB");
		expect(resolveLanguage("auto")).toBe("en");
	});

	it("auto survives a blocked local storage", () => {
		stubEnvironment("zh", "en-US", true);
		expect(resolveLanguage("auto")).toBe("en");
	});

	it("detectObsidianLanguage is what auto delegates to", () => {
		stubEnvironment("zh", "en-US");
		expect(detectObsidianLanguage()).toBe("zh");
	});
});

describe("pick", () => {
	it("selects by language", () => {
		expect(pick("en", "More actions", "更多操作")).toBe("More actions");
		expect(pick("zh", "More actions", "更多操作")).toBe("更多操作");
	});
});
