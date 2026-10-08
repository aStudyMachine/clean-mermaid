import type { MermaidConfig } from "mermaid";

/**
 * Obsidian 1.14.4 自己渲染 mermaid 时用的初始化参数，逐字抄自 app.asar 里唯一的
 * `mermaid.initialize` 调用点（复核：`node scripts/scan-asar.mjs "<asar>" "mermaid.initialize"`）。
 *
 * 三个容易看错的点，改动前先核对：
 * - 官方**没有** `theme` 键，因此走 mermaid 自带的 `default` 主题；
 * - 官方**没有** `layout` 键，因此流程/类图/状态图/ER 走 mermaid 默认的 `dagre`；
 * - `fontFamily` 指向 CSS 变量 `--font-mermaid`，捕获脚本必须把它补进 SVG，否则字体会退化成
 *   mermaid 自己的默认栈，对比就不诚实了（值来自 app.css：`--font-mermaid: var(--font-text)`）。
 *
 * 类型写成 `MermaidConfig & Record<string, unknown>`：官方实参里有 mermaid 12.1.0 类型声明不再
 * 收录的旧键（`git`、gantt 的 `axisFormatter`），运行时仍生效 —— 逐字抄就不能替它们改名。
 */
export const NATIVE_CONFIG: MermaidConfig & Record<string, unknown> = {
	startOnLoad: false,
	securityLevel: "strict",
	themeVariables: { fontFamily: "var(--font-mermaid)" },
	flowchart: { useMaxWidth: false },
	sequence: { useMaxWidth: false },
	// gantt 的多余键要单独断言：交叉类型不会放宽嵌套对象字面量的多余属性检查。
	gantt: {
		useMaxWidth: true,
		axisFormatter: [["%Y-%m-%d", (d: Date) => d.getDay() === 1]],
	} as MermaidConfig["gantt"],
	journey: { useMaxWidth: true },
	class: { useMaxWidth: true },
	git: { useMaxWidth: false },
	state: { useMaxWidth: true },
	er: { useMaxWidth: false },
	pie: { useMaxWidth: true },
};

/**
 * 官方配置把字体写成 CSS 变量 `var(--font-mermaid)`，在 Obsidian 里它解析到
 * `--font-text` → `--font-default`（app.css 实测值，见下）。栅格化走 `<img>` 时 SVG 是独立
 * 文档、读不到外层页面的变量，所以捕获脚本要把这个变量注入 SVG 自身 —— 变量名与解析链保持
 * 和官方一致，只补上最终取值。
 */
export const NATIVE_FONT_STACK =
	'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", "Google Sans Flex", Roboto, "Inter Variable", "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif';
