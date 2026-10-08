import esbuild from "esbuild";

const groups = {
	verify: [
		["tests/browser/render-entry.ts", "tests/browser/render.js"],
		["tests/browser/cache-entry.ts", "tests/browser/cache.js"],
	],
	capture: [
		["tests/browser/capture-plugin-entry.ts", "tests/browser/capture-plugin.js"],
		["tests/browser/capture-native-entry.ts", "tests/browser/capture-native.js"],
	],
};

const requested = process.argv[2] ?? "verify";
const entries = groups[requested];
if (!entries) {
	console.error(`未知分组 “${requested}”，可选：${Object.keys(groups).join(" / ")}`);
	process.exit(1);
}

for (const [entryPoint, outfile] of entries) {
	await esbuild.build({
		entryPoints: [entryPoint],
		bundle: true,
		outfile,
		format: "iife",
		platform: "browser",
		target: "es2018",
		define: { "import.meta.url": '"http://localhost/"' },
		logLevel: "warning",
	});
	console.log(`built ${outfile}`);
}
