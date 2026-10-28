import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import {
	markViewerHintAnnounced,
	markViewerOpened,
	viewerHintAnnounced,
	viewerOpened,
} from "../src/hints";

function fakeApp(store = new Map<string, unknown>()) {
	const app = {
		loadLocalStorage: (key: string) => store.get(key) ?? null,
		saveLocalStorage: (key: string, data: unknown | null) => {
			if (data === null) {
				store.delete(key);
			} else {
				store.set(key, data);
			}
		},
	} as unknown as App;
	return { app, store };
}

describe("viewer hints", () => {
	it("starts unannounced and unopened", () => {
		const { app } = fakeApp();
		expect(viewerHintAnnounced(app)).toBe(false);
		expect(viewerOpened(app)).toBe(false);
	});

	it("keeps the two flags independent and persists them", () => {
		const { app, store } = fakeApp();
		markViewerHintAnnounced(app);
		expect(viewerHintAnnounced(app)).toBe(true);
		expect(viewerOpened(app)).toBe(false);

		markViewerOpened(app);
		expect(viewerOpened(app)).toBe(true);

		const restarted = fakeApp(store).app;
		expect(viewerHintAnnounced(restarted)).toBe(true);
		expect(viewerOpened(restarted)).toBe(true);
	});

	it("scopes keys to the plugin", () => {
		const { app, store } = fakeApp();
		markViewerHintAnnounced(app);
		markViewerOpened(app);
		expect([...store.keys()].every((key) => key.startsWith("clean-mermaid:"))).toBe(true);
	});

	it("falls back to prompting when storage is unavailable", () => {
		const app = {
			loadLocalStorage: () => {
				throw new Error("disabled");
			},
			saveLocalStorage: () => {
				throw new Error("disabled");
			},
		} as unknown as App;
		expect(viewerHintAnnounced(app)).toBe(false);
		expect(viewerOpened(app)).toBe(false);
		expect(() => markViewerHintAnnounced(app)).not.toThrow();
		expect(() => markViewerOpened(app)).not.toThrow();
	});
});
