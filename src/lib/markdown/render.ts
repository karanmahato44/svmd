import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import type { getSourcePage } from "./pagination";
import { normalizeLanguage, supportsLanguage } from "./languages";

const MAX_TOKENS = 4_000;
const MAX_HTML_LENGTH = 300_000;
const MAX_HIGHLIGHT_LENGTH = 8_000;
const MAX_HIGHLIGHT_TOTAL = 16_000;
const MAX_HIGHLIGHT_BLOCKS = 8;
// Keep repeat edits cheap without retaining an unbounded history of pasted code.
const MAX_HIGHLIGHT_CACHE_LENGTH = 1_000_000;
const MAX_HIGHLIGHT_CACHE_ENTRIES = 128;
const highlightCache = new Map<string, string>();
let highlightCacheLength = 0;
let cachedLanguages = "";
const parser = new MarkdownIt({ html: false, linkify: true, typographer: true, maxNesting: 20 });
const escape = parser.utils.escapeHtml;
type RenderEnvironment = { highlighted: Map<Token, string> };
const plainCode = (code: string) => `<pre class="shiki"><code>${escape(code)}</code></pre>`;

parser.renderer.rules.fence = (tokens, index, _options, environment) => {
	const token = tokens[index];
	const name = parser.utils.unescapeAll(token.info).trim().split(/\s+/)[0] || "text";
	const html = (environment as RenderEnvironment).highlighted.get(token) ?? plainCode(token.content);
	return `<div class="svmd-code-block my-2 w-full rounded">
<details class="group w-full" open><summary class="svmd-code-summary flex h-7 cursor-pointer items-center justify-between px-2.5 text-xs font-medium select-none">
<div class="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svmd-code-chevron h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"><path d="m9 18 6-6-6-6"/></svg><span class="uppercase text-[10px] font-bold tracking-widest">${escape(name.slice(0, 100))}</span></div>
<button type="button" class="copy-btn ml-2 inline-flex h-5 w-5 items-center justify-center rounded" aria-label="Copy code" title="Copy code"><svg class="icon-copy h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/></svg><svg class="icon-check h-3.5 w-3.5 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m20 6-11 11-5-5"/></svg></button>
</summary><div class="overflow-hidden"><div class="code-wrapper p-0 text-xs">${html}</div></div></details></div>\n`;
};
const defaultImage = parser.renderer.rules.image!;
parser.renderer.rules.image = (tokens, index, options, env, self) => {
	tokens[index].attrSet("loading", "lazy");
	tokens[index].attrSet("decoding", "async");
	tokens[index].attrSet("referrerpolicy", "no-referrer");
	return defaultImage(tokens, index, options, env, self);
};

function tokenCount(tokens: Token[]): number {
	let count = tokens.length;
	for (const token of tokens) {
		if (token.children) count += tokenCount(token.children);
		if (count > MAX_TOKENS) break;
	}
	return count;
}

export async function renderMarkdown(part: ReturnType<typeof getSourcePage>) {
	const env: RenderEnvironment = { highlighted: new Map() };
	const tokens = parser.parse(part.content, env);
	let simplified = tokenCount(tokens) > MAX_TOKENS;
	if (!simplified) {
		let remaining = MAX_HIGHLIGHT_TOTAL;
		const fences = tokens
			.filter((token) => {
				if (token.type !== "fence" || token.content.length > MAX_HIGHLIGHT_LENGTH || token.content.length > remaining)
					return false;
				remaining -= token.content.length;
				return true;
			})
			.slice(0, MAX_HIGHLIGHT_BLOCKS);
		if (fences.length) {
			try {
				const languageFor = (token: Token) =>
					normalizeLanguage(parser.utils.unescapeAll(token.info).trim().split(/\s+/)[0]);
				const supported = fences.filter((token) => supportsLanguage(languageFor(token)));
				if (supported.length) {
					const { prepareHighlighter } = await import("./highlighter");
					const highlighter = await prepareHighlighter([...new Set(supported.map(languageFor))]);
					const loadedLanguages = highlighter.getLoadedLanguages().sort().join("\0");
					if (loadedLanguages !== cachedLanguages) {
						// Newly loaded grammars can improve highlighting of embedded languages.
						highlightCache.clear();
						highlightCacheLength = 0;
						cachedLanguages = loadedLanguages;
					}
					for (const token of supported) {
						const language = languageFor(token);
						const key = `${language}\0${token.content}`;
						const cached = highlightCache.get(key);
						if (cached !== undefined) {
							highlightCache.delete(key);
							highlightCache.set(key, cached);
							env.highlighted.set(token, cached);
							continue;
						}
						const started = performance.now();
						const highlighted = highlighter.codeToHtml(token.content, {
							lang: language,
							defaultColor: false,
							themes: { dark: "vitesse-dark", light: "vitesse-light" },
							tokenizeMaxLineLength: 1_000,
							tokenizeTimeLimit: 20
						});
						if (highlighted.length < MAX_HTML_LENGTH / 2) {
							env.highlighted.set(token, highlighted);
							// Leave slow tokenization retryable: its 20ms limit can produce partial highlighting.
							if (performance.now() - started < 10) {
								highlightCache.set(key, highlighted);
								highlightCacheLength += key.length + highlighted.length;
								while (
									highlightCacheLength > MAX_HIGHLIGHT_CACHE_LENGTH ||
									highlightCache.size > MAX_HIGHLIGHT_CACHE_ENTRIES
								) {
									const oldest = highlightCache.keys().next().value!;
									highlightCacheLength -= oldest.length + highlightCache.get(oldest)!.length;
									highlightCache.delete(oldest);
								}
							}
						}
					}
				}
			} catch {
				// Failed grammar downloads or tokenization must not hide the document.
			}
		}
	}
	let html = simplified ? plainCode(part.content) : parser.renderer.render(tokens, parser.options, env);
	if (html.length > MAX_HTML_LENGTH) {
		html = plainCode(part.content);
		simplified = true;
	}
	return { html, page: part.page, pageCount: part.pageCount, largeDocument: part.pageCount > 1, simplified };
}
