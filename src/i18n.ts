/** `auto` 跟随 Obsidian 自身的界面语言。 */
export type LanguageSetting = "auto" | "zh" | "en";
export type Language = "zh" | "en";

/** Obsidian 把界面语言存在 local storage 里（如 "zh"、"zh-TW"、"en"）。 */
export function detectObsidianLanguage(): Language {
	try {
		const stored = window.localStorage.getItem("language");
		if (stored) {
			return stored.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
	} catch {
		// local storage 不可用 —— 继续回退到浏览器语言。
	}
	return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLanguage(setting: LanguageSetting): Language {
	if (setting === "zh" || setting === "en") {
		return setting;
	}
	return detectObsidianLanguage();
}

/** 取当前语言对应的文案。 */
export function pick(language: Language, english: string, chinese: string): string {
	return language === "zh" ? chinese : english;
}
