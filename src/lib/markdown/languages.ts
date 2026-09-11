// Static import targets let Vite split grammars; a plain document downloads none.
export const languages = {
	javascript: () => import("shiki/langs/javascript.mjs"),
	typescript: () => import("shiki/langs/typescript.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	svelte: () => import("shiki/langs/svelte.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	rust: () => import("shiki/langs/rust.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	bash: () => import("shiki/langs/bash.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	dotenv: () => import("shiki/langs/dotenv.mjs"),
	c: () => import("shiki/langs/c.mjs"),
	cpp: () => import("shiki/langs/cpp.mjs"),
	java: () => import("shiki/langs/java.mjs"),
	php: () => import("shiki/langs/php.mjs"),
	ruby: () => import("shiki/langs/ruby.mjs"),
	swift: () => import("shiki/langs/swift.mjs"),
	kotlin: () => import("shiki/langs/kotlin.mjs"),
	csharp: () => import("shiki/langs/csharp.mjs"),
	xml: () => import("shiki/langs/xml.mjs"),
	toml: () => import("shiki/langs/toml.mjs"),
	ini: () => import("shiki/langs/ini.mjs"),
	dockerfile: () => import("shiki/langs/dockerfile.mjs"),
	nginx: () => import("shiki/langs/nginx.mjs"),
	graphql: () => import("shiki/langs/graphql.mjs"),
	scala: () => import("shiki/langs/scala.mjs"),
	lua: () => import("shiki/langs/lua.mjs"),
	r: () => import("shiki/langs/r.mjs"),
	dart: () => import("shiki/langs/dart.mjs"),
	elixir: () => import("shiki/langs/elixir.mjs"),
	haskell: () => import("shiki/langs/haskell.mjs"),
	perl: () => import("shiki/langs/perl.mjs"),
	powershell: () => import("shiki/langs/powershell.mjs"),
	vue: () => import("shiki/langs/vue.mjs"),
	scss: () => import("shiki/langs/scss.mjs")
};
const aliases: Record<string, string> = {
	js: "javascript",
	ts: "typescript",
	py: "python",
	rs: "rust",
	rb: "ruby",
	kt: "kotlin",
	cs: "csharp",
	yml: "yaml",
	sh: "bash",
	shell: "bash",
	gql: "graphql"
};
export function normalizeLanguage(name: string): string {
	const lower = name.toLowerCase();
	return Object.hasOwn(aliases, lower) ? aliases[lower] : lower;
}
export function supportsLanguage(name: string): boolean {
	return Object.hasOwn(languages, name);
}
