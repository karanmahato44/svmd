import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		csp: {
			mode: "auto",
			directives: {
				"default-src": ["self"],
				"script-src": ["self"],
				// Syntax highlighting and pane sizes use generated inline styles.
				"style-src": ["self", "unsafe-inline"],
				"img-src": ["self", "data:", "blob:", "https:"],
				"connect-src": ["self", ...(process.env.NODE_ENV === "production" ? [] : ["ws:", "wss:"])],
				"worker-src": ["self"],
				"object-src": ["none"],
				"base-uri": ["none"],
				"frame-src": ["none"],
				"frame-ancestors": ["none"],
				"form-action": ["self"]
			}
		},
		alias: {
			"@/*": "./path/to/lib/*"
		}
	}
};

export default config;
