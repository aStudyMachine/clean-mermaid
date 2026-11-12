import DOMPurify from "dompurify";
import { initializePele } from "../../src/renderer";

/** 复刻 1.15 sanitizeHTMLToDom 的关键配置；实际桌面集成仍需独立验收。 */
export function initializeHostFixture(): void {
	if (!window.pele) throw new Error("Run npm run extract-pele first");
	initializePele(window.pele, (svg) => {
		const fragment = DOMPurify.sanitize(svg, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ["style"], ALLOW_UNKNOWN_PROTOCOLS: true });
		const root = fragment.querySelector("svg");
		if (!root) throw new Error("Invalid SVG after sanitization");
		return new XMLSerializer().serializeToString(root);
	});
}
