import { fromHighlighter } from "@shikijs/markdown-it/core";
import MarkdownIt from "markdown-it";
import { createHighlighter, type BundledLanguage, type BundledTheme } from "shiki";
import type { MainMessage, WorkerMessage } from "../types/types";

let md: MarkdownIt | null = null;
let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

const init = async (): Promise<void> => {
	try {
		highlighter = await createHighlighter({
			themes: ["vitesse-dark"] satisfies BundledTheme[],
			langs: [
				"javascript",
				"typescript",
				"jsx",
				"tsx",
				"svelte",
				"python",
				"rust",
				"go",
				"bash",
				"sh",
				"shell",
				"json",
				"html",
				"css",
				"yaml",
				"sql",
				"markdown"
			] satisfies BundledLanguage[]
		});

		const parser = new MarkdownIt({
			html: true,
			linkify: true,
			typographer: true
		});

		parser.use(fromHighlighter(highlighter, { theme: "vitesse-dark" }));

		const defaultFence =
			parser.renderer.rules.fence || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

		parser.renderer.rules.fence = (tokens, idx, options, env, self) => {
			const token = tokens[idx];
			const info = token.info ? parser.utils.unescapeAll(token.info).trim() : "";
			const langName = info.split(/\s+/)[0] || "text";

			const highlightedCode = defaultFence(tokens, idx, options, env, self);
			const rawCode = token.content;
			const encodedRawCode = encodeURIComponent(rawCode);

			return `
				<div class="my-2 w-full rounded border border-zinc-800 bg-zinc-950/50">
					<details class="group w-full" open>
						<summary class="flex h-7 cursor-pointer items-center justify-between border-b border-zinc-800 bg-zinc-900/30 px-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900 select-none outline-none focus:ring-1 focus:ring-zinc-700">
							<div class="flex items-center gap-2">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open:rotate-90 text-zinc-600 group-hover:text-zinc-400">
									<path d="m9 18 6-6-6-6"/>
								</svg>
								<span class="uppercase text-[10px] font-bold tracking-widest opacity-80">${langName}</span>
							</div>
							<button 
								class="copy-btn ml-2 inline-flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-all"
								data-code="${encodedRawCode}"
								aria-label="Copy code"
								title="Copy code"
							>
								<svg class="icon-copy h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
								<svg class="icon-check h-3 w-3 hidden text-emerald-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
							</button>
						</summary>
						<div class="overflow-hidden">
							<div class="code-wrapper p-0 text-xs">
								${highlightedCode}
							</div>
						</div>
					</details>
				</div>
			`;
		};

		md = parser;
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error("Worker Init Error", e);
	}
};

self.onmessage = async (e: MessageEvent<WorkerMessage>): Promise<void> => {
	const { type, content } = e.data;
	if (type === "RENDER") {
		if (!md) await init();
		if (md) {
			try {
				const html = md.render(content);

				self.postMessage({ type: "RESULT", html: html } satisfies MainMessage);
			} catch (err) {
				self.postMessage({ type: "ERROR", message: String(err) } satisfies MainMessage);
			}
		}
	}
};
