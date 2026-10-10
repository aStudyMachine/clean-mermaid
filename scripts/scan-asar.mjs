// 仅开发期用：扫描 Obsidian 的 asar 里的代码块处理器实现，弄清 sortOrder /
// 内置 mermaid 处理的真实语义。结论写在 docs/obsidian-internals.md；
// 升级 Obsidian 后要重跑一次，再决定怎么改接管。
//
// 用法：node scripts/scan-asar.mjs ["<obsidian.asar>"] "<needle>" ["<needle>" ...]
// 不传路径时自动取本机**实际运行**的那份；传了旧版会拦下来（`--allow-stale` 放行），
// 原因见 scripts/obsidian-asar.mjs。
import { openAsar, parseFlags } from "./obsidian-asar.mjs";

const USAGE = 'node scripts/scan-asar.mjs ["<obsidian.asar>"] "<needle>" ["<needle>" ...]';

const { allowStale, positional } = parseFlags(process.argv.slice(2));
// 第一个参数是 .asar 才算路径，否则整串都是 needle。
const given = positional[0]?.toLowerCase().endsWith(".asar") ? positional[0] : undefined;
const needles = given ? positional.slice(1) : positional;

if (needles.length === 0) {
	console.error(`Usage: ${USAGE}`);
	process.exit(1);
}

const { path: asarPath, version, buffer } = openAsar(given, { allowStale, usage: USAGE });
const text = buffer.toString("utf8");
console.log(`asar: ${asarPath}`);
console.log(`Obsidian 版本: ${version}`);
console.log(`asar bytes: ${buffer.length}, text length: ${text.length}\n`);

for (const needle of needles) {
	let index = -1;
	let count = 0;
	while ((index = text.indexOf(needle, index + 1)) !== -1) {
		count++;
		if (count > 4) break;
		const start = Math.max(0, index - 900);
		const end = Math.min(text.length, index + 900);
		console.log(`=== "${needle}" #${count} @${index} ===`);
		console.log(text.slice(start, end).replace(/\s*\n\s*/g, "\n"));
		console.log("");
	}
	console.log(`--- total occurrences of "${needle}": ${count} (capped) ---\n`);
}
