import { EditorView, PluginValue, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type CleanMermaidPlugin from "./main";
import { CleanMermaidBlock } from "./block";

/**
 * 实时预览的接管方案。
 *
 * Obsidian 的实时预览用写死的内置渲染器渲染 ```mermaid 块（代码块部件里的
 * `if (lang === "mermaid") { ... }`），它从不查
 * `registerMarkdownCodeBlockProcessor` 注册表 —— 所以插件不可能靠公开处理器 API
 * 在编辑器里接管 mermaid。只能反过来：监听已渲染的部件，从编辑器状态读出图表源码，
 * 把官方输出换成我们的卡片。
 */

const WIDGET_SELECTOR = ".cm-embed-block.cm-lang-mermaid";
const HOST_CLASS = "cm-live-host";
const HIDDEN_CLASS = "cm-core-hidden";
/** 卡片已经撑起内容时打在部件上，让 CSS 按类把官方输出按住，不用结构选择器。 */
const GUARD_CLASS = "cm-live-guard";

/** 起始围栏，可带 info string，如 "```mermaid"。 */
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)/;
/** 结束围栏：整行只有围栏字符，没有别的内容。 */
const CLOSING_FENCE_PATTERN = /^\s*(`{3,}|~{3,})\s*$/;

interface ManagedEntry {
	source: string;
	block: CleanMermaidBlock;
}

export function createLivePreviewExtension(plugin: CleanMermaidPlugin) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			private readonly managed = new Map<HTMLElement, ManagedEntry>();
			private readonly observer: MutationObserver;
			private scheduled = false;
			private destroyed = false;

			constructor(private readonly view: EditorView) {
				this.observer = new MutationObserver(() => this.schedule());
				this.observer.observe(view.dom, { childList: true, subtree: true });
				this.schedule();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged) {
					this.schedule();
				}
			}

			/**
			 * CodeMirror 重绘完 DOM、仍在同一次测量流程里时调我们（内部钩子，鸭子类型：有这个方法就调）。
			 * 接管必须发生在这一刻：滚动时复用的部件进场后官方内容还是旧高度、我们的卡片要在 CodeMirror
			 * 记录它之前就先摆好，否则它会先量到错的尺寸，下一帧再靠滚动锚点补偿 —— 表现就是抖一下。
			 * rAF 那条路径保留，作为拿不到这个钩子时的兜底。
			 */
			docViewUpdate(): void {
				this.scan();
			}

			destroy(): void {
				this.destroyed = true;
				this.observer.disconnect();
				for (const [widget, entry] of Array.from(this.managed)) {
					this.dispose(widget, entry);
				}
				this.managed.clear();
			}

			private schedule(): void {
				if (this.scheduled || this.destroyed) {
					return;
				}
				this.scheduled = true;
				window.requestAnimationFrame(() => {
					this.scheduled = false;
					if (!this.destroyed) {
						this.scan();
					}
				});
			}

			private scan(): void {
				// 清掉部件已被 CodeMirror 回收掉的块。
				for (const [widget, entry] of Array.from(this.managed)) {
					if (!widget.isConnected) {
						this.dispose(widget, entry);
						this.managed.delete(widget);
					}
				}

				const widgets = Array.from(this.view.dom.querySelectorAll<HTMLElement>(WIDGET_SELECTOR));
				for (const widget of widgets) {
					this.ensureCard(widget);
				}
			}

			private ensureCard(widget: HTMLElement): void {
				// Obsidian 渲染 mermaid 图之前会先让用户信任该 vault
				// （local storage 里的 `mermaid-vault-trust`）。这道闸门保持原样：两种形态下
				// 都不要绕过它去渲染。
				if (!this.isVaultTrusted() || widget.querySelector(".mermaid-wrapper.is-guarded")) {
					this.releaseWidget(widget);
					return;
				}

				if (!plugin.settings.enableRendering) {
					this.releaseWidget(widget);
					return;
				}

				const source = this.findSource(widget);
				if (source === null) {
					return;
				}

				const current = this.managed.get(widget);
				if (current && current.source === source && widget.querySelector(`:scope > .${HOST_CLASS}`)) {
					// 官方可能已在同一个部件里重渲染过，继续把它藏着。
					this.hideCoreOutput(widget);
					return;
				}
				if (current) {
					this.dispose(widget, current);
					this.managed.delete(widget);
				}

				const host = widget.createEl("div", { cls: HOST_CLASS });

				const block = new CleanMermaidBlock(host, source, undefined, plugin);
				this.managed.set(widget, { source, block });
				block.load();
				this.hideCoreOutput(widget);
			}

			/** 照搬 Obsidian 自己的判断（`true === loadLocalStorage("mermaid-vault-trust")`）。 */
			private isVaultTrusted(): boolean {
				try {
					return plugin.app.loadLocalStorage("mermaid-vault-trust") === true;
				} catch {
					return true;
				}
			}

			private releaseWidget(widget: HTMLElement): void {
				const entry = this.managed.get(widget);
				if (entry) {
					this.dispose(widget, entry);
					this.managed.delete(widget);
				}
				widget.querySelector(`:scope > .${HOST_CLASS}`)?.remove();
				widget.removeClass(GUARD_CLASS);
				for (const child of Array.from(widget.children)) {
					child.removeClass(HIDDEN_CLASS);
				}
			}

			private hideCoreOutput(widget: HTMLElement): void {
				// 只在卡片真正建好之后才做：首次渲染还在进行时，这个块的高度是靠官方输出撑着的，
				// 此时折叠它会让笔记跳两次而不是一次。
				if (!widget.querySelector(`:scope > .${HOST_CLASS} > .cm-block`)) {
					return;
				}
				// 守卫类同时交给 CSS：官方渲染器之后还会异步往这个部件里追加输出，
				// 只有父级上的类规则能持续按住它们。
				widget.addClass(GUARD_CLASS);
				for (const child of Array.from(widget.children)) {
					if (!child.classList.contains(HOST_CLASS)) {
						child.addClass(HIDDEN_CLASS);
					}
				}
			}

			private dispose(widget: HTMLElement, entry: ManagedEntry): void {
				// 隐藏类与守卫类要一起交还给官方：CodeMirror 复用过的 DOM 会带着它们回来，
				// 那时部件高度是 0，官方内容撑起来的高度被我们抹掉了。
				widget.removeClass(GUARD_CLASS);
				for (const child of Array.from(widget.children)) {
					child.removeClass(HIDDEN_CLASS);
				}
				try {
					entry.block.unload();
				} catch (error) {
					console.warn("[clean-mermaid] failed to unload a live preview diagram", error);
				}
				widget.querySelector(`:scope > .${HOST_CLASS}`)?.remove();
			}

			/** 直接从编辑器状态读出包含这个部件的围栏块源码。 */
			private findSource(widget: HTMLElement): string | null {
				let offset: number;
				try {
					offset = this.view.posAtDOM(widget, 0);
				} catch {
					return null;
				}

				const doc = this.view.state.doc;
				const line = doc.lineAt(Math.max(0, Math.min(offset, doc.length)));

				let openLine = -1;
				let fenceChar = "";
				let fenceLength = 0;
				for (let n = line.number; n >= 1; n--) {
					const match = doc.line(n).text.match(FENCE_PATTERN);
					if (!match) {
						continue;
					}
					if (match[2].toLowerCase() !== "mermaid") {
						return null;
					}
					openLine = n;
					fenceChar = match[1][0];
					fenceLength = match[1].length;
					break;
				}
				if (openLine === -1) {
					return null;
				}

				for (let n = openLine + 1; n <= doc.lines; n++) {
					const match = doc.line(n).text.match(CLOSING_FENCE_PATTERN);
					if (!match || match[1][0] !== fenceChar || match[1].length < fenceLength) {
						continue;
					}
					const start = doc.line(openLine).to;
					const end = doc.line(n).from;
					// 合理性校验：部件确实落在这个块里面。
					if (offset < doc.line(openLine).from - 1 || offset > doc.line(n).to + 1) {
						return null;
					}
					return doc.sliceString(start, end).replace(/\n$/, "");
				}
				return null;
			}
		},
	);
}