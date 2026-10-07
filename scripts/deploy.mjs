/**
 * Deploy the built plugin into a local Obsidian vault for testing.
 *
 * Usage (no paths are hardcoded — never commit personal vault paths):
 *   VAULT=<path-to-vault> npm run deploy
 *   npm run deploy -- <path-to-vault>
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const vault = process.env.VAULT || process.argv[2];

if (!vault) {
	console.error(
		"Usage: VAULT=<path-to-vault> npm run deploy   (or: npm run deploy -- <path-to-vault>)",
	);
	process.exit(1);
}

if (!existsSync(path.join(vault, ".obsidian"))) {
	console.error(`Error: "${vault}" does not look like an Obsidian vault (.obsidian is missing).`);
	process.exit(1);
}

const artifacts = ["main.js", "manifest.json", "styles.css"];
for (const file of artifacts) {
	if (!existsSync(file)) {
		console.error(`Error: "${file}" not found. Run "npm run build" first.`);
		process.exit(1);
	}
}

const pluginDir = path.join(vault, ".obsidian", "plugins", "clean-mermaid");
mkdirSync(pluginDir, { recursive: true });

for (const file of artifacts) {
	cpSync(file, path.join(pluginDir, file));
}

console.log(`Deployed ${artifacts.join(", ")} -> ${pluginDir}`);
console.log("Reload the plugin in Obsidian (or restart it) to pick up the changes.");