/**
 * 「双击展开图表」这项能力的发现性标记，通过 Obsidian 的本地存储接口持久化
 * （`app.loadLocalStorage` / `app.saveLocalStorage`）。
 *
 * 不放进插件 data.json：那两个标记是纯粹的一次性教学状态，不是用户配置 ——
 * 混进 settings 会被「恢复默认设置」一起清掉，也会在设置面板里多出一个不属于设置的对象。
 * 读写一律吞掉异常：隐私模式或存储被禁用时，退回「每次都提示」也能用。
 */

import type { App } from "obsidian";
import type { DoubleClickAction } from "./settings";

const ANNOUNCED_KEY = "clean-mermaid:viewer-dblclick-announced";
const OPENED_KEY = "clean-mermaid:viewer-opened";

function readFlag(app: App, key: string): boolean {
	try {
		return app.loadLocalStorage(key) === "1";
	} catch {
		return false;
	}
}

function writeFlag(app: App, key: string): void {
	try {
		app.saveLocalStorage(key, "1");
	} catch {
		// 存储不可用：下次照旧提示一遍，不影响功能。
	}
}

/** 是否已经用一次性提示告知过「双击可展开」。 */
export function viewerHintAnnounced(app: App): boolean {
	return readFlag(app, ANNOUNCED_KEY);
}

export function markViewerHintAnnounced(app: App): void {
	writeFlag(app, ANNOUNCED_KEY);
}

/** 用户是否真的展开过图表；展开过就不再显示「双击展开」的教学标签。 */
export function viewerOpened(app: App): boolean {
	return readFlag(app, OPENED_KEY);
}

/**
 * 「双击展开」教学标签的显示条件：还没展开过，且双击确实绑在展开上。
 * 两个条件缺一不可 —— 双击被改成复位或不响应之后，这句话就成了假的（ADR 0002）。
 */
export function shouldShowViewerHint(action: DoubleClickAction, opened: boolean): boolean {
	return action === "viewer" && !opened;
}

export function markViewerOpened(app: App): void {
	writeFlag(app, OPENED_KEY);
}
