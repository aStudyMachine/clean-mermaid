import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { browserAdaptor } from "mathjax-full/js/adaptors/browserAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import type { PeleMath } from "./pele-types";

let convert: ((tex: string, fontSize: number) => PeleMath) | undefined;

/** 独立 MathJax 实例输出路径，不碰宿主的 CHTML 配置，也不依赖外部字体。 */
export function renderPeleMath(tex: string, fontSize: number): PeleMath {
	if (!convert) {
		RegisterHTMLHandler(browserAdaptor());
		const document_ = mathjax.document(document, {
			InputJax: new TeX({ packages: AllPackages }),
			OutputJax: new SVG({ fontCache: "none" }),
		});
		convert = (source, size) => {
			const container = document_.convert(source, { display: true }) as HTMLElement;
			const svg = container.querySelector("svg");
			if (!svg) throw new Error("Could not render math as SVG");
			const [, , width, height] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
			const scale = size / 1000;
			svg.setAttribute("width", String(width * scale));
			svg.setAttribute("height", String(height * scale));
			svg.removeAttribute("style");
			return { svg: svg.outerHTML, width: width * scale, height: height * scale };
		};
	}
	return convert(tex, fontSize);
}
