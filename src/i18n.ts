/** `auto` 跟随 Obsidian 自身的界面语言。 */
export type LanguageSetting = "auto" | "zh" | "en";
export type Language = "zh" | "en";

/** 把 Obsidian 的界面语言标签（如 "zh-cn"、"en"）换算成本插件所用的语言。 */
export function detectObsidianLanguage(uiLanguage: string | null): Language {
	if (uiLanguage) {
		return uiLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
	}
	return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLanguage(setting: LanguageSetting, uiLanguage: string | null): Language {
	if (setting === "zh" || setting === "en") {
		return setting;
	}
	return detectObsidianLanguage(uiLanguage);
}

/** 取当前语言对应的文案。 */
export function pick(language: Language, english: string, chinese: string): string {
	return language === "zh" ? chinese : english;
}
