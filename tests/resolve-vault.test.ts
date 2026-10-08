import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	listVaultNames,
	matchVault,
	obsidianRegistryPath,
	readVaultPaths,
	looksLikePath,
	vaultNameFromPath,
} from "../scripts/resolve-vault.mjs";

const REGISTRY = ["D:\\vaults\\Alpha", "E:\\notes\\Beta"];
// 两个不同目录的末段撞成同一个名字（只是大小写不同）—— 只能靠完整路径区分。
const CASE_DUPES = ["D:\\vaults\\Alpha", "D:\\vaults\\alpha"];

describe("vaultNameFromPath", () => {
	it("takes the last segment with either separator", () => {
		expect(vaultNameFromPath("D:/vaults/Alpha")).toBe("Alpha");
		expect(vaultNameFromPath("D:\\vaults\\Alpha")).toBe("Alpha");
	});

	it("ignores trailing separators and rejects drive roots", () => {
		expect(vaultNameFromPath("E:/notes/Beta/")).toBe("Beta");
		expect(vaultNameFromPath("E:/notes/Beta\\\\")).toBe("Beta");
		expect(vaultNameFromPath("D:\\")).toBe("");
		expect(vaultNameFromPath("")).toBe("");
		expect(vaultNameFromPath(undefined)).toBe("");
	});
});

describe("looksLikePath", () => {
	it("separates path arguments from vault names", () => {
		expect(looksLikePath("Alpha")).toBe(false);
		expect(looksLikePath("D:/vaults/Alpha")).toBe(true);
		expect(looksLikePath("relative/dir")).toBe(true);
		expect(looksLikePath("\\\\server\\share")).toBe(true);
		expect(looksLikePath("C:short")).toBe(true);
	});
});

describe("listVaultNames", () => {
	it("dedupes and sorts the names", () => {
		expect(listVaultNames(REGISTRY)).toEqual(["Alpha", "Beta"]);
		// 末段撞名的两个目录都算可用库，清单里保留原样（大小写先后不是这里要断言的东西）。
		expect(new Set(listVaultNames(CASE_DUPES))).toEqual(new Set(["Alpha", "alpha"]));
		expect(listVaultNames([])).toEqual([]);
	});
});

describe("matchVault", () => {
	it("matches a unique name case-insensitively", () => {
		expect(matchVault(REGISTRY, "Beta")).toEqual({ status: "ok", path: "E:\\notes\\Beta" });
		expect(matchVault(REGISTRY, " beta ")).toEqual({ status: "ok", path: "E:\\notes\\Beta" });
	});

	it("reports ambiguity with the full paths to disambiguate", () => {
		const result = matchVault(CASE_DUPES, "Alpha");
		// expect(...).toBe() 不会替 TS 收窄联合类型，这里显式判一次。
		if (result.status !== "ambiguous") {
			throw new Error(`期望 ambiguous，实际得到 ${result.status}`);
		}
		expect(result.matches.map((m) => m.path)).toEqual(["D:\\vaults\\Alpha", "D:\\vaults\\alpha"]);
	});

	it("lists what is available when the name is unknown", () => {
		expect(matchVault(REGISTRY, "Gamma")).toEqual({ status: "unknown", names: ["Alpha", "Beta"] });
		expect(matchVault([], "Alpha")).toEqual({ status: "unknown", names: [] });
	});
});

describe("obsidianRegistryPath", () => {
	const home = "/home/marcus";

	it("uses APPDATA on Windows and falls back to the user profile", () => {
		expect(obsidianRegistryPath({ platform: "win32", env: { APPDATA: "C:\\AppData" }, home })).toBe(
			path.join("C:\\AppData", "obsidian", "obsidian.json"),
		);
		expect(obsidianRegistryPath({ platform: "win32", env: {}, home })).toBe(
			path.join(home, "AppData", "Roaming", "obsidian", "obsidian.json"),
		);
	});

	it("uses the library folder on macOS", () => {
		expect(obsidianRegistryPath({ platform: "darwin", env: {}, home })).toBe(
			path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
		);
	});

	it("honours XDG_CONFIG_HOME on other platforms", () => {
		expect(obsidianRegistryPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/cfg" }, home })).toBe(
			path.join("/cfg", "obsidian", "obsidian.json"),
		);
		expect(obsidianRegistryPath({ platform: "linux", env: {}, home })).toBe(
			path.join(home, ".config", "obsidian", "obsidian.json"),
		);
	});
});

describe("readVaultPaths", () => {
	let dir = "";

	beforeAll(() => {
		dir = mkdtempSync(path.join(tmpdir(), "clean-mermaid-deploy-"));
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const fixture = (name: string, contents: string) => {
		const file = path.join(dir, name);
		writeFileSync(file, contents, "utf8");
		return file;
	};

	it("collects the path of every vault entry", () => {
		const file = fixture(
			"good.json",
			JSON.stringify({ vaults: { a1: { path: "D:/vaults/Alpha", ts: 1 }, a2: { path: "E:/notes/Beta" } } }),
		);
		expect(readVaultPaths(file)).toEqual({ paths: ["D:/vaults/Alpha", "E:/notes/Beta"], error: null });
	});

	it("degrades to a reason instead of throwing when the registry is unusable", () => {
		expect(readVaultPaths(fixture("broken.json", "{ not json"))).toMatchObject({
			paths: [],
			error: "vault 注册表不是合法 JSON",
		});
		expect(readVaultPaths(fixture("novaults.json", JSON.stringify({})))).toMatchObject({
			paths: [],
			error: "vault 注册表里没有 vaults 字段",
		});
		expect(readVaultPaths(fixture("empty.json", JSON.stringify({ vaults: { a1: { ts: 1 } } })))).toMatchObject({
			paths: [],
			error: "vault 注册表里没有任何带路径的库",
		});
		const missing = readVaultPaths(path.join(dir, "does-not-exist.json"));
		expect(missing.paths).toEqual([]);
		expect(missing.error).toContain("读不到 vault 注册表");
	});
});
