// 仅开发期用：扫描 Obsidian 的 app.asar 里的代码块处理器实现，弄清 sortOrder /
// 内置 mermaid 处理的真实语义。结论写在 docs/obsidian-internals.md；
// 升级 Obsidian 后要重跑一次，再决定怎么改接管。
//
// 用法：node scripts/scan-asar.mjs "<path-to-obsidian.asar>" "<needle>" ["<needle>" ...]
import { readFileSync } from "node:fs";

const asar = process.argv[2];
const needles = process.argv.slice(3);

if (!asar || needles.length === 0) {
	console.error('Usage: node scripts/scan-asar.mjs "<asar path>" "<needle>" ["<needle>" ...]');
	process.exit(1);
}

const buffer = readFileSync(asar);
const text = buffer.toString("utf8");
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
