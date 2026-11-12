/** 宿主 Pele 的最小契约；以 Obsidian 1.15.0 内置的 1.8.0 验证。 */
export interface PeleMath {
	svg: string;
	width: number;
	height: number;
}

export interface PeleRuntime {
	render(source: string, options: {
		idPrefix: string;
		responsive: boolean;
		autoDirection: boolean;
		fontFamily: string;
		fontFamilyMono: string;
		fontSize: number;
		config: Record<string, unknown>;
		math: (tex: string, fontSize: number) => PeleMath;
	}): { svg: string; width: number; height: number };
	forgetTextWidths(): void;
}

declare global {
	interface Window {
		pele?: PeleRuntime;
	}
}
