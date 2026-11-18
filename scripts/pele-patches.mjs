import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const hooks = fileURLToPath(new URL("../src/pele-layout-hooks.ts", import.meta.url));
const patches = [
	{
		name: "compound layout",
		chunk: /[\\/]pele[\\/]dist[\\/]esm[\\/]chunks[\\/]VBUCM3YD\.js$/,
		marker: "function je(s,m,S,v){",
		replacement: "import{resolvePeleLayout as cmLayout}from'cm-pele-layout-hooks';function je(s,m,S,v){const cmResult=cmLayout(s,m,S,v);if(cmResult)return cmResult;",
	},
	{
		name: "diamond sizing",
		chunk: /[\\/]pele[\\/]dist[\\/]esm[\\/]chunks[\\/]6PIGVMFT\.js$/,
		marker: "size:(n,t)=>{let e=n+16,s=t+8;return{w:e+1.6*s,h:e/1.6+s,dy:0}}",
		replacement: "size:(n,t)=>cmDiamond(n,t)??(()=>{let e=n+16,s=t+8;return{w:e+1.6*s,h:e/1.6+s,dy:0}})()",
		imports: "import{resolvePeleDiamond as cmDiamond}from'cm-pele-layout-hooks';",
	},
];

// 补丁只作用于参与构建的 Pele npm 模块，宿主与 node_modules 文件均不写入。
export const pelePatches = {
	name: "clean-mermaid-pele",
	setup(build) {
		const applied = new Set();
		build.onStart(() => applied.clear());
		build.onResolve({ filter: /^cm-pele-layout-hooks$/ }, () => ({ path: hooks }));
		for (const patch of patches) {
			build.onLoad({ filter: patch.chunk }, async ({ path }) => {
				const source = await readFile(path, "utf8");
				if (source.split(patch.marker).length !== 2) {
					throw new Error(`Pele 1.13.0 ${patch.name} patch does not uniquely match ${path}`);
				}
				applied.add(patch.name);
				return { contents: (patch.imports ?? "") + source.replace(patch.marker, patch.replacement), loader: "js" };
			});
		}
		build.onEnd(({ errors }) => {
			if (errors.length || patches.every(({ name }) => applied.has(name))) return;
			return { errors: [{ text: "Pele 1.13.0 layout or diamond patch was not applied; check the pinned chunks." }] };
		});
	},
};
