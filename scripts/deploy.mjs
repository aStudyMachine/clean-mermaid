/**
 * 一键部署：单测 → 构建 → 把三个产物拷进指定 vault → 提示重载。
 *
 * 用法（不硬编码任何路径 —— 切勿提交个人 vault 路径）：
 *   npm run deploy -- <库名|完整路径> [<库名|完整路径> …]
 *   npm run deploy -- <库名> --no-check      跳过测试与构建，只拷现有产物
 *   npm run deploy -- <库名> --restart       部署完重启 Obsidian（目前仅 Windows）
 *   VAULT=<完整路径> npm run deploy          逃生口：库还没在 Obsidian 里打开过时
 *
 * 库名到路径的换算走 Obsidian 自己的 vault 注册表（scripts/resolve-vault.mjs），本机不必再维护一份映射。
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
	listVaultNames,
	looksLikePath,
	matchVault,
	obsidianRegistryPath,
	readVaultPaths,
	vaultNameFromPath,
} from "./resolve-vault.mjs";

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const PLUGIN_ID = "clean-mermaid";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const queries = argv.filter((arg) => !arg.startsWith("--"));
if (process.env.VAULT) {
	queries.unshift(process.env.VAULT);
}

const registry = readVaultPaths(obsidianRegistryPath());

function die(message) {
	console.error(`\n${message}`);
	process.exit(1);
}

function usage() {
	console.error("用法: npm run deploy -- <库名|完整路径> [<库名|完整路径> …]");
	console.error("选项: --no-check 跳过测试与构建; --restart 部署完重启 Obsidian");
	if (registry.error) {
		console.error(`\n（${registry.error}，所以只能给完整路径）`);
	} else {
		console.error(`\nObsidian 里已注册的库: ${listVaultNames(registry.paths).join(", ") || "（空）"}`);
	}
}

/** 先把所有目标解析完再动手 —— 名字写错时不该已经跑完一遍构建，更不该只部署了一半。 */
function resolveTargets() {
	const targets = [];
	const problems = [];
	for (const query of queries) {
		if (looksLikePath(query) || existsSync(query)) {
			if (!existsSync(path.join(query, ".obsidian"))) {
				problems.push(`"${query}" 看起来不是 vault：旁边没有 .obsidian 目录`);
			} else {
				targets.push({ name: vaultNameFromPath(query) || query, path: query });
			}
			continue;
		}
		const result = matchVault(registry.paths, query);
		if (result.status === "ok") {
			targets.push({ name: vaultNameFromPath(result.path), path: result.path });
			continue;
		}
		if (result.status === "ambiguous") {
			const listing = result.matches.map((m) => `  ${m.name} → ${m.path}`).join("\n");
			problems.push(`库名 "${query}" 对应多个库，请改用完整路径：\n${listing}`);
			continue;
		}
		const available = result.names.length > 0 ? `；可用：${result.names.join(", ")}` : "；注册表里没有可用库";
		const hint = registry.error ? `（${registry.error}，可直接给完整路径）` : available;
		problems.push(`不认识库名 "${query}"${hint}`);
	}
	return { targets, problems };
}

function npmRun(script) {
	console.log(`\n> npm run ${script}`);
	// Windows 上 npm 是 .cmd，不经 shell 起不来；命令串是这里写死的常量，不掺任何入参，
	// 所以用 shell 只是为了能解析到 npm，没有拼接风险。
	const result = spawnSync(`npm run ${script}`, { stdio: "inherit", shell: true });
	if (result.status !== 0) {
		die(`npm run ${script} 失败（退出码 ${result.status}），没有部署任何文件。`);
	}
}

function restartObsidian(first) {
	if (process.platform !== "win32") {
		console.log(`\n--restart 目前只在 Windows 上实现（当前 ${process.platform}），请手动重载插件。`);
		return;
	}
	console.log("\n警告：即将关闭 Obsidian 打开的所有库，未保存的编辑可能丢失。");
	const killed = spawnSync("taskkill", ["/IM", "Obsidian.exe", "/F"], { stdio: "ignore" });
	if (killed.status !== 0) {
		console.log("Obsidian 本来没在运行，直接打开。");
	}
	const url = `obsidian://open?vault=${encodeURIComponent(first.name)}`;
	const opened = spawnSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
	if (opened.status !== 0) {
		console.warn(`自动唤起失败（${url}），请手动打开 Obsidian。`);
	} else {
		console.log(`已重新打开 "${first.name}"。`);
	}
}

if (queries.length === 0) {
	usage();
	process.exit(1);
}

const { targets, problems } = resolveTargets();
if (problems.length > 0) {
	usage();
	die(`\n目标解析失败：\n- ${problems.join("\n- ")}`);
}

for (const target of targets) {
	console.log(`目标: ${target.name} → ${target.path}`);
}

if (!flags.has("--no-check")) {
	npmRun("test");
	npmRun("build");
}

for (const file of ARTIFACTS) {
	if (!existsSync(file)) {
		die(`找不到产物 "${file}"，先跑 npm run build（或去掉 --no-check）。`);
	}
}

const version = JSON.parse(readFileSync("manifest.json", "utf8")).version ?? "?";
const done = [];
for (const target of targets) {
	const dir = path.join(target.path, ".obsidian", "plugins", PLUGIN_ID);
	try {
		mkdirSync(dir, { recursive: true });
		for (const file of ARTIFACTS) {
			cpSync(file, path.join(dir, file));
		}
		done.push(target);
		console.log(`已部署 ${PLUGIN_ID}@${version} → ${dir}`);
	} catch (error) {
		console.error(`部署到 "${target.path}" 失败：${error.message}`);
		if (done.length > 0) {
			console.error(`已经更新的库: ${done.map((t) => t.name).join(", ")} —— 这次是部分成功。`);
		}
		process.exit(1);
	}
}

if (flags.has("--restart")) {
	restartObsidian(targets[0]);
} else {
	console.log("\n在 Obsidian 里重载插件（Ctrl+P → Reload plugin without saving）或重启应用；插件不热更新。");
}
