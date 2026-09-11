import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { languages } from "./src/lib/markdown/languages.ts";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Discover worker-only imports before serving tests/dev pages to avoid reloads mid-render.
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
	},

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: "./vite.config.ts",

				test: {
					name: "client",

					browser: {
						enabled: true,
						provider: playwright({
							launchOptions: { channel: process.env.SVMD_TEST_BROWSER_CHANNEL || undefined }
						}),
						instances: [{ browser: "chromium", headless: true }]
					},

					include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
					exclude: ["src/lib/server/**"]
				}
			},

			{
				extends: "./vite.config.ts",

				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"]
				}
			}
		]
	}
});

// import tailwindcss from "@tailwindcss/vite";
// import { defineConfig } from "vitest/config";
// import { playwright } from "@vitest/browser-playwright";
// import { sveltekit } from "@sveltejs/kit/vite";

// export default defineConfig({
// 	plugins: [tailwindcss(), sveltekit()],

// 	test: {
// 		expect: { requireAssertions: true },

// 		projects: [
// 			{
// 				extends: "./vite.config.ts",

// 				test: {
// 					name: "client",

// 					browser: {
// 						enabled: true,
// 						provider: playwright(),
// 						instances: [{ browser: "chromium", headless: true }]
// 					},

// 					include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
// 					exclude: ["src/lib/server/**"]
// 				}
// 			},

// 			{
// 				extends: "./vite.config.ts",

// 				test: {
// 					name: "server",
// 					environment: "node",
// 					include: ["src/**/*.{test,spec}.{js,ts}"],
// 					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"]
// 				}
// 			}
// 		]
// 	}
// });
