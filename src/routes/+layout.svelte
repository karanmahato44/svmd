<script lang="ts">
	import { browser } from "$app/env";
	import favicon from "#lib/assets/favicon.svg";
	import { onMount } from "svelte";
	import "./layout.css";

	let { children } = $props();

	const SITE_TITLE = "svmd";
	const SITE_DESC = "Extremely fast, no-BS Markdown renderer";

	const SITE_URL = "https://md.mkaran.com.np/";
	const SITE_IMAGE = `${SITE_URL}/og-preview.png`;

	const schemaOrg = {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: SITE_TITLE,
		url: SITE_URL,
		description: SITE_DESC,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Any"
	};
	const schemaOrgJson = JSON.stringify(schemaOrg).replace(/</g, "\\u003c");

	const THEME_STORAGE_KEY = "svmd_theme_v1";

	type Theme = "dark" | "light";

	const applyTheme = (theme: Theme) => {
		if (!browser) return;

		document.documentElement.classList.toggle("light", theme === "light");
		document.documentElement.classList.toggle("dark", theme === "dark");
		document.documentElement.style.colorScheme = theme;
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute("content", theme === "light" ? "#f6f7f2" : "#000000");

		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch {
			// Theme still applies for the current session when storage is unavailable.
		}
	};

	onMount(() => {
		let storedTheme: string | null;
		try {
			storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
		} catch {
			storedTheme = null;
		}
		applyTheme(storedTheme === "light" ? "light" : "dark");

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return;
			if (!(event.ctrlKey || event.metaKey)) return;
			if (event.code !== "Slash" && event.key !== "/") return;

			event.preventDefault();
			const nextTheme = document.documentElement.classList.contains("light") ? "dark" : "light";
			applyTheme(nextTheme);
		};

		window.addEventListener("keydown", handleKeydown);

		return () => {
			window.removeEventListener("keydown", handleKeydown);
		};
	});
</script>

<svelte:head>
	<!-- essentials -->
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
	<link rel="icon" href={favicon} />
	<link rel="canonical" href={SITE_URL} />

	<!-- primary meta tags -->
	<title>{SITE_TITLE}</title>
	<meta name="title" content={SITE_TITLE} />
	<meta name="description" content={SITE_DESC} />
	<meta name="application-name" content={SITE_TITLE} />
	<meta name="theme-color" content="#000000" />

	<!-- open graph / facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={SITE_URL} />
	<meta property="og:title" content={SITE_TITLE} />
	<meta property="og:description" content={SITE_DESC} />
	<meta property="og:image" content={SITE_IMAGE} />
	<meta property="og:site_name" content={SITE_TITLE} />

	<!-- twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={SITE_URL} />
	<meta property="twitter:title" content={SITE_TITLE} />
	<meta property="twitter:description" content={SITE_DESC} />
	<meta property="twitter:image" content={SITE_IMAGE} />

	<!-- structured data (json-ld) -->
	{@html `<script type="application/ld+json">${schemaOrgJson}</scr` + `ipt>`}
</svelte:head>

{@render children()}
