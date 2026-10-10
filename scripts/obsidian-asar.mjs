import { existsSync, readdirSync, readFileSync, realpathSync as fsRealpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Obsidian 的 asar 定位守卫。
 *
 * Windows 自动更新会把新包下载到用户数据目录（`obsidian-<版本>.asar`）并在启动时优先加载，
 * 安装目录里的 exe 与 `resources\obsidian.asar` 因此长期停在一个旧版本上。拿安装目录那份做逆向
 * 会得出「本机版本比实际低、某些 API 不存在」的错误结论 —— 这两个脚本都以用户数据目录那份为准。
 */

const PACKAGED = /^obsidian-(\d+)\.(\d+)\.(\d+)\.asar$/;

function userDataDir() {
	if (process.platform === "win32") {
		return process.env.APPDATA ? path.join(process.env.APPDATA, "obsidian") : null;
	}
	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Library", "Application Support", "obsidian");
	}
	return path.join(os.homedir(), ".config", "obsidian");
}

function compareVersions(a, b) {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) {
			return pa[i] - pb[i];
		}
	}
	return 0;
}

/** 用户数据目录里版本号最高的那份；没有就返回 null。 */
export function findLiveAsar() {
	const dir = userDataDir();
	if (!dir || !existsSync(dir)) {
		return null;
	}
	let best = null;
	for (const name of readdirSync(dir)) {
		const match = PACKAGED.exec(name);
		if (!match) {
			continue;
		}
		const candidate = { path: path.join(dir, name), version: match[0].slice(9, -5) };
		if (!best || compareVersions(candidate.version, best.version) > 0) {
			best = candidate;
		}
	}
	return best;
}

/** 文件名里带版本就用文件名，否则读包内的 `obsidian-dev` package.json。 */
export function readAsarVersion(buffer, asarPath) {
	const fromName = PACKAGED.exec(path.basename(asarPath));
	if (fromName) {
		return fromName[0].slice(9, -5);
	}
	// 包里有两处 `"obsidian-dev"`：一处是 lockfile（带 `lockfileVersion`，版本号是 lock 的），
	// 一处才是 app 自己的 package.json。只认后者。
	const text = buffer.toString("latin1");
	let best = null;
	let at = -1;
	while ((at = text.indexOf('"obsidian-dev"', at + 1)) !== -1) {
		const window = text.slice(at, at + 400);
		if (window.includes("lockfileVersion")) {
			continue;
		}
		const embedded = /"version"\s*:\s*"(\d+\.\d+\.\d+)"/.exec(window);
		if (embedded && (!best || compareVersions(embedded[1], best) > 0)) {
			best = embedded[1];
		}
	}
	return best;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

/**
 * 解析要用的 asar：不传路径时自动取用户数据目录那份；传了路径时核对它是不是本机实际运行的版本，
 * 停在旧版就报错退出（确有需要扫旧版时加 `--allow-stale`）。
 */
export function openAsar(given, { allowStale = false, usage } = {}) {
	const live = findLiveAsar();
	if (!given) {
		if (!live) {
			fail(
				`没给 asar 路径，用户数据目录里也没有 obsidian-<版本>.asar（Obsidian 从未自动更新过？）。\n` +
					`用法：${usage}`,
			);
		}
		return { ...live, buffer: readFileSync(live.path) };
	}

	const resolved = path.resolve(given);
	if (!existsSync(resolved)) {
		fail(`asar 不存在：${resolved}`);
	}
	const buffer = readFileSync(resolved);
	const version = readAsarVersion(buffer, resolved);
	if (
		live &&
		version &&
		compareVersions(version, live.version) < 0 &&
		!sameFile(resolved, live.path)
	) {
		if (!allowStale) {
			fail(
				`你给的是 Obsidian ${version}：${resolved}\n` +
					`但本机实际运行的是 ${live.version}：${live.path}\n\n` +
					`Windows 自动更新会把新包下到用户数据目录并优先加载，安装目录那份是旧的；\n` +
					`拿它做逆向会得出「版本更低、API 不存在」的错误结论。\n` +
					`确实要扫旧版（例如核对 minAppVersion 下调）时加 --allow-stale。`,
			);
		}
		console.warn(`注意：扫的是 Obsidian ${version}，本机实际运行的是 ${live.version}。`);
	}
	return { path: resolved, version: version ?? "未知", buffer };
}

function sameFile(a, b) {
	const normalize = (p) => {
		try {
			return fsRealpathSync(p).toLowerCase();
		} catch {
			return path.resolve(p).toLowerCase();
		}
	};
	return normalize(a) === normalize(b);
}

/** 从 argv 里剥掉 `--allow-stale`，返回 { allowStale, positional }。 */
export function parseFlags(argv) {
	const allowStale = argv.includes("--allow-stale");
	return { allowStale, positional: argv.filter((arg) => arg !== "--allow-stale") };
}
