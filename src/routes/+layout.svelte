<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import "./layout.css";

	let { children } = $props();

	const SITE_TITLE = "svmd";
	const SITE_DESC = "no bs markdown renderer";

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
	{@html `<script type="application/ld+json">${JSON.stringify(schemaOrg)}</script>`}
</svelte:head>

{@render children()}
