/**
 * 把「库名」解析成本机 vault 路径。
 *
 * 名单取自 Obsidian 自己的 vault 注册表（库里只记 `path`，库名 = 路径最后一段，匹配时大小写不敏感），
 * 所以仓库里不需要出现任何本机路径。这里只放与文件系统无关的判定，读取单独由 readVaultPaths 承担。
 */

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 取路径最后一段作为库名；结尾的分隔符与盘符根都考虑到了，取不到时返回空串。 */
export function vaultNameFromPath(vaultPath) {
	if (typeof vaultPath !== "string" || vaultPath.length === 0) {
		return "";
	}
	const segments = vaultPath.split(/[/\\]+/).filter(Boolean);
	const last = segments[segments.length - 1] ?? "";
	// 只剩盘符根（如 "D:" / "C:"）时不算一个库名。
	return /^[A-Za-z]:$/.test(last) ? "" : last;
}

/** 参数看起来像路径而不是库名？像路径的走目录校验，像名字的走注册表匹配。 */
export function looksLikePath(query) {
	return /[/\\]/.test(query) || /^[A-Za-z]:/.test(query);
}

/** 去重并排序的库名清单，供报错时告诉用户可选哪些。 */
export function listVaultNames(vaultPaths) {
	const names = new Set();
	for (const vaultPath of vaultPaths) {
		const name = vaultNameFromPath(vaultPath);
		if (name) {
			names.add(name);
		}
	}
	return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * 按库名匹配注册表里的路径。
 *
 * @returns {{status:"ok",path:string}|{status:"ambiguous",matches:Array<{path:string,name:string}>}|{status:"unknown",names:string[]}}
 */
export function matchVault(vaultPaths, query) {
	const wanted = String(query).trim().toLowerCase();
	const matches = [];
	for (const vaultPath of vaultPaths) {
		const name = vaultNameFromPath(vaultPath);
		if (name && name.toLowerCase() === wanted) {
			matches.push({ path: vaultPath, name });
		}
	}
	if (matches.length === 1) {
		return { status: "ok", path: matches[0].path };
	}
	if (matches.length > 1) {
		return { status: "ambiguous", matches };
	}
	return { status: "unknown", names: listVaultNames(vaultPaths) };
}

/** Obsidian 存 vault 注册表的位置，按平台分支；参数可注入以便单测。 */
export function obsidianRegistryPath({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
	if (platform === "win32") {
		const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
		return path.join(appData, "obsidian", "obsidian.json");
	}
	if (platform === "darwin") {
		return path.join(home, "Library", "Application Support", "obsidian", "obsidian.json");
	}
	const config = env.XDG_CONFIG_HOME || path.join(home, ".config");
	return path.join(config, "obsidian", "obsidian.json");
}

/**
 * 读取注册表里的库路径。文件缺失或 JSON 坏了都不抛异常 —— 部署还有「直接给完整路径」这条逃生口，
 * 把一个可选的便利功能做成硬失败反而更难用。
 *
 * @returns {{paths:string[], error:string|null}}
 */
export function readVaultPaths(file) {
	let raw;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		return { paths: [], error: `读不到 vault 注册表（${error.code || error.message}）` };
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { paths: [], error: "vault 注册表不是合法 JSON" };
	}
	const vaults = parsed && typeof parsed === "object" ? parsed.vaults : null;
	if (!vaults || typeof vaults !== "object") {
		return { paths: [], error: "vault 注册表里没有 vaults 字段" };
	}
	const paths = [];
	for (const entry of Object.values(vaults)) {
		if (entry && typeof entry.path === "string" && entry.path.length > 0) {
			paths.push(entry.path);
		}
	}
	if (paths.length === 0) {
		return { paths: [], error: "vault 注册表里没有任何带路径的库" };
	}
	return { paths, error: null };
}
