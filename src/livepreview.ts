import { EditorView, PluginValue, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type CleanMermaidPlugin from "./main";
import { CleanMermaidBlock } from "./block";

/**
 * Live Preview takeover.
 *
 * Obsidian's live preview renders ```mermaid blocks with a hard-coded core renderer
 * (`if (lang === "mermaid") { ... }` in the code block widget) that never consults the
 * `registerMarkdownCodeBlockProcessor` registry — so a plugin cannot take over mermaid in the
 * editor through the public processor API. Instead we watch the rendered widgets, read the
 * diagram source from the editor state and swap the core output for our card.
 */

const WIDGET_SELECTOR = ".cm-embed-block.cm-lang-mermaid";
const HOST_CLASS = "cm-live-host";
const HIDDEN_CLASS = "cm-core-hidden";

/** Opening fence with an optional info string, e.g. "```mermaid". */
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)/;
/** Closing fence: only the fence characters, nothing else on the line. */
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
				// Drop blocks whose widget has been recycled by CodeMirror.
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
				// Obsidian asks the user to trust the vault before rendering mermaid diagrams
				// (`mermaid-vault-trust` in local storage). Keep that guard intact: never render
				// behind it, in either of its two shapes.
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
					// Core may have re-rendered inside the same widget; keep it hidden.
					this.hideCoreOutput(widget);
					return;
				}
				if (current) {
					this.dispose(widget, current);
					this.managed.delete(widget);
				}

				const host = document.createElement("div");
				host.className = HOST_CLASS;
				widget.appendChild(host);

				const block = new CleanMermaidBlock(host, source, undefined, plugin);
				this.managed.set(widget, { source, block });
				block.load();
				this.hideCoreOutput(widget);
			}

			/** Mirrors Obsidian's own check (`true === loadLocalStorage("mermaid-vault-trust")`). */
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
				for (const child of Array.from(widget.children)) {
					child.removeClass(HIDDEN_CLASS);
				}
			}

			private hideCoreOutput(widget: HTMLElement): void {
				for (const child of Array.from(widget.children)) {
					if (!child.classList.contains(HOST_CLASS)) {
						child.addClass(HIDDEN_CLASS);
					}
				}
			}

			private dispose(widget: HTMLElement, entry: ManagedEntry): void {
				try {
					entry.block.unload();
				} catch (error) {
					console.warn("[clean-mermaid] failed to unload a live preview diagram", error);
				}
				widget.querySelector(`:scope > .${HOST_CLASS}`)?.remove();
			}

			/** Reads the fenced block that contains this widget straight from the editor state. */
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
					// Sanity check: the widget must really sit inside this block.
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