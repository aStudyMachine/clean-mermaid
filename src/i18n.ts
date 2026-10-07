/** `auto` follows Obsidian's own interface language. */
export type LanguageSetting = "auto" | "zh" | "en";
export type Language = "zh" | "en";

/** Obsidian keeps its interface language in local storage (e.g. "zh", "zh-TW", "en"). */
export function detectObsidianLanguage(): Language {
	try {
		const stored = window.localStorage.getItem("language");
		if (stored) {
			return stored.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
	} catch {
		// Local storage unavailable — fall through to the browser language.
	}
	return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLanguage(setting: LanguageSetting): Language {
	if (setting === "zh" || setting === "en") {
		return setting;
	}
	return detectObsidianLanguage();
}

/** Picks the string for the active language. */
export function pick(language: Language, english: string, chinese: string): string {
	return language === "zh" ? chinese : english;
}
