import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

import { languages, supportsLanguage } from "./languages";

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;
export async function prepareHighlighter(names: string[]) {
	// Cache the promise, not only the resolved instance, so initialization cannot race.
	highlighterPromise ??= createHighlighterCore({
		themes: [import("shiki/themes/vitesse-dark.mjs"), import("shiki/themes/vitesse-light.mjs")],
		langs: [],
		engine: createOnigurumaEngine(import("shiki/wasm"))
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
