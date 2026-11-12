import { mkdirSync, writeFileSync } from "node:fs";
import { openAsar, parseFlags } from "./obsidian-asar.mjs";

// 只供本机验证，不打包、发布或改写宿主运行时。
const { allowStale, positional } = parseFlags(process.argv.slice(2));
const { buffer, version } = openAsar(positional[0], { allowStale });
const tree = JSON.parse(buffer.subarray(16, 16 + buffer.readUInt32LE(12)).toString("utf8"));
const entry = tree.files?.lib?.files?.["pele.min.js"];
if (!entry || entry.offset === undefined) throw new Error("No lib/pele.min.js in the selected Obsidian package");
const start = 8 + buffer.readUInt32LE(4) + Number(entry.offset);
const bytes = buffer.subarray(start, start + entry.size);
if (!bytes.subarray(0, 200).toString().includes("Pele")) throw new Error("Unexpected Pele bundle header");
mkdirSync("tests/browser", { recursive: true });
writeFileSync("tests/browser/obsidian-pele.min.js", bytes);
console.log(`Obsidian ${version}: ${bytes.subarray(0, 100).toString().split("\n")[0]}`);
