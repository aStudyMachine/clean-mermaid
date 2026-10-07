// Provides a value for `import.meta.url` when bundling ESM dependencies
// (e.g. mermaid) into the CommonJS `main.js` that Obsidian loads.
export const importMetaUrlShim = "app://obsidian.md/plugin/clean-mermaid/";