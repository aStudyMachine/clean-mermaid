import esbuild from "esbuild";

const entries = [
	["tests/browser/render-entry.ts", "tests/browser/render.js"],
	["tests/browser/cache-entry.ts", "tests/browser/cache.js"],
];

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
