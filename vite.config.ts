import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { languages } from "./src/lib/markdown/languages.ts";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			version: { pollInterval: 0 },
			csp: {
				mode: "auto",
				directives: {
					"default-src": ["self"],
					"script-src": ["self"],
					// Syntax highlighting and pane sizes use generated inline styles.
					"style-src": ["self", "unsafe-inline"],
					"img-src": ["self", "data:", "blob:", "https:"],
					"connect-src": ["self", ...(process.env.NODE_ENV === "production" ? [] : (["ws:", "wss:"] as const))],
					"worker-src": ["self"],
					"object-src": ["none"],
					"base-uri": ["none"],
					"frame-src": ["none"],
					"frame-ancestors": ["none"],
					"form-action": ["self"]
				}
			}
		})
	],
	// Discover worker-only imports before serving development pages to avoid reloads mid-render.
	optimizeDeps: {
		include: [
			"markdown-it",
			"shiki/core",
			"shiki/engine/oniguruma",
			"shiki/wasm",
			"shiki/themes/vitesse-dark.mjs",
			"shiki/themes/vitesse-light.mjs",
			...Object.keys(languages).map((language) => `shiki/langs/${language}.mjs`)
		]
	},

	worker: {
		format: "es"
	}
});
