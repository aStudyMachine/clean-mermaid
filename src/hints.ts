/**
 * 「双击展开图表」这项能力的发现性标记，存在 Obsidian 渲染进程的 localStorage 里。
 *
 * 不放进插件 data.json：那两个标记是纯粹的一次性教学状态，不是用户配置 ——
 * 混进 settings 会被「恢复默认设置」一起清掉，也会在设置面板里多出一个不属于设置的对象。
 * 读写一律吞掉异常：隐私模式或存储被禁用时，退回「每次都提示」也能用。
 */

const ANNOUNCED_KEY = "clean-mermaid:viewer-dblclick-announced";
const OPENED_KEY = "clean-mermaid:viewer-opened";

function readFlag(key: string): boolean {
	try {
		return window.localStorage.getItem(key) === "1";
	} catch {
		return false;
	}
}

function writeFlag(key: string): void {
	try {
		window.localStorage.setItem(key, "1");
	} catch {
		// 存储不可用：下次照旧提示一遍，不影响功能。
	}
}

/** 是否已经用一次性提示告知过「双击可展开」。 */
export function viewerHintAnnounced(): boolean {
	return readFlag(ANNOUNCED_KEY);
}

export function markViewerHintAnnounced(): void {
	writeFlag(ANNOUNCED_KEY);
}

/** 用户是否真的展开过图表；展开过就不再显示「双击展开」的教学标签。 */
export function viewerOpened(): boolean {
	return readFlag(OPENED_KEY);
}

export function markViewerOpened(): void {
	writeFlag(OPENED_KEY);
}
