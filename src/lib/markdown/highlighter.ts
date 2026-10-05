import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

import { languages, supportsLanguage } from "./languages";

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;
export async function prepareHighlighter(names: string[]) {
	// Cache the promise, not only the resolved instance, so initialization cannot race.
	highlighterPromise ??= createHighlighterCore({
		themes: [import("shiki/themes/vitesse-dark.mjs"), import("shiki/themes/vitesse-light.mjs")],
		// Fetch the first requested grammars alongside themes and WASM, not after them.
		langs: names.filter(supportsLanguage).map((name) => languages[name as keyof typeof languages]()),
		engine: createOnigurumaEngine(import("shiki/wasm"))
	}).catch((error) => {
		// A failed grammar/theme request must not permanently poison initialization.
		highlighterPromise = undefined;
		throw error;
	});
	const highlighter = await highlighterPromise;
	const loaded = new Set(highlighter.getLoadedLanguages());
	await Promise.all(
		names
			.filter((name) => !loaded.has(name) && supportsLanguage(name))
			.map((name) => highlighter.loadLanguage(languages[name as keyof typeof languages]()))
	);
	return highlighter;
}
