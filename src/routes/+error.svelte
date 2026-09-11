<script lang="ts">
	import { page } from "$app/state";
	import { resolve } from "$app/paths";
	const missing = $derived(page.status === 404);
	const title = $derived(missing ? "Page not found" : "Unable to open this page");
</script>

<svelte:head>
	<title>{title} · svmd</title>
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
	<div class="flex w-full max-w-md flex-col items-start gap-5">
		<a href={resolve("/")} class="font-mono text-sm text-muted-foreground underline-offset-4 hover:underline">svmd</a>
		<p class="font-mono text-7xl font-medium tracking-tighter text-muted-foreground">{page.status}</p>
		<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
		<p class="text-sm leading-relaxed text-muted-foreground">
			{missing
				? "This address doesn't point to a page. Return to the editor to continue."
				: "Something went wrong while loading the page. Try returning to the editor."}
		</p>
		<a
			href={resolve("/")}
			class="mt-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
			>Back to editor</a
		>
	</div>
</main>
