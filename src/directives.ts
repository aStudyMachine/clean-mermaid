import type { LayoutEngine } from "./settings";

export interface BlockDirectives {
	themeId?: string;
	layout?: LayoutEngine;
	plain?: boolean;
}

const DIRECTIVE_PATTERN = /^\s*%%\s*cm\s*:\s*(.+?)\s*%%\s*$/;

/**
 * 读取开头的 `%% cm:... %%` 指令，并把它们从源码里剥掉。
 * 支持：`%% cm:theme=<id> %%`、`%% cm:layout=elk|dagre %%`、`%% cm:plain %%`。
 */
export function parseBlockDirectives(
	source: string,
	enabled: boolean,
): { directives: BlockDirectives; code: string } {
	if (!enabled) {
		return { directives: {}, code: source };
	}

	const lines = source.split(/\r?\n/);
	const directives: BlockDirectives = {};

	let first = 0;
	while (first < lines.length && lines[first].trim() === "") {
		first++;
	}

	let index = first;
	while (index < lines.length) {
		const match = lines[index].match(DIRECTIVE_PATTERN);
		if (!match) {
			break;
		}
		const body = match[1].trim();
		const separator = body.indexOf("=");
		const key = (separator === -1 ? body : body.slice(0, separator)).trim().toLowerCase();
		const value = separator === -1 ? "" : body.slice(separator + 1).trim();

		if (key === "theme" && value) {
			directives.themeId = value;
		} else if (key === "layout" && (value === "elk" || value === "dagre")) {
			directives.layout = value;
		} else if (key === "plain") {
			directives.plain = true;
		}
		index++;
	}

	const code = lines.slice(0, first).concat(lines.slice(index)).join("\n");
	return { directives, code };
}
