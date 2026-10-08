import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 从 Obsidian 的 app.asar 里取出它**自带**的 mermaid 构建，供 `npm run shots` 的「原生」一侧使用。
 *
 * 为什么非要这一份：Obsidian 1.14.4 打包的是 mermaid 11.13.0，而插件自带 12.1.0 ——
 * 12 起 flowchart 的默认布局已经是 ELK，11 仍是 dagre。用 12.1.0 去「复现原生」会两张图
 * 布局一模一样，对比就成了假的。
 *
 * 用法：`node scripts/extract-obsidian-mermaid.mjs "<path-to-obsidian.asar>" [outfile]`
 * asar 一般在 `%APPDATA%/obsidian/obsidian-<版本>.asar`（macOS/Linux 在应用资源目录）。
 * 产物落在 tests/browser/ 下，已被 `.gitignore` 的 `tests/browser/*.js` 忽略，不要提交。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const TARGET = ["lib", "mermaid.min.js"];
const DEFAULT_OUT = path.join(repoRoot, "tests", "browser", "obsidian-mermaid.min.js");

function findFile(tree, segments) {
	let node = tree;
	for (const segment of segments) {
		node = node?.files?.[segment];
		if (!node) {
			return null;
		}
	}
	return node;
}

const asarPath = process.argv[2];
if (!asarPath) {
	console.error("用法：node scripts/extract-obsidian-mermaid.mjs \"<obsidian.asar>\" [outfile]");
	process.exit(1);
}
const out = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUT;

const asar = await readFile(asarPath);
// asar 头：[0]=4、[4]=头部块大小、[12]=JSON 长度，数据区从 8+头部块大小 开始。
const headerBlockSize = asar.readUInt32LE(4);
const jsonLength = asar.readUInt32LE(12);
const tree = JSON.parse(asar.subarray(16, 16 + jsonLength).toString("utf8"));
const dataBase = 8 + headerBlockSize;

const entry = findFile(tree, TARGET);
if (!entry?.offset || !entry.size) {
	console.error(`asar 里没找到 ${TARGET.join("/")} —— Obsidian 版本可能改了打包结构，先核对头部 JSON`);
	process.exit(1);
}

const start = dataBase + Number(entry.offset);
const bytes = asar.subarray(start, start + entry.size);
const banner = bytes.subarray(0, 200).toString("utf8").split("\n")[0];
if (!/mermaid/i.test(banner)) {
	console.error(`取出的内容开头不像 mermaid：${JSON.stringify(banner)}`);
	process.exit(1);
}

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, bytes);
console.log(`asar: ${asarPath}`);
console.log(`版本行: ${banner}`);
console.log(`写出: ${path.relative(repoRoot, out)}（${bytes.length} 字节）`);
