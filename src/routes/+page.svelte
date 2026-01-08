<script lang="ts">
	import { browser } from "$app/environment";
	import * as Resizable from "$lib/components/ui/resizable/index.js";
	import type { MainMessage, WorkerMessage } from "$lib/types/types";
	import MarkdownWorker from "$lib/workers/markdown.worker?worker";
	import { get, set } from "idb-keyval";
	import { onDestroy, onMount } from "svelte";

	const STORAGE_KEY = "svmd_source_v1";
	const DEBOUNCE_RENDER_MS = 150;
	const DEBOUNCE_SAVE_MS = 1000;
	const MIN_PANE_SIZE = 20;

	let source = $state<string>("");
	let renderedHtml = $state<string>("");
	let editorRef: HTMLTextAreaElement;
	let worker: Worker | null = null;
	let renderTimer: ReturnType<typeof setTimeout>;
	let saveTimer: ReturnType<typeof setTimeout>;

	onMount(async () => {
		if (!browser) return;
		worker = new MarkdownWorker();
		worker.onmessage = (e: MessageEvent<MainMessage>) => {
			if (e.data.type === "RESULT") renderedHtml = e.data.html;
			else if (e.data.type === "ERROR") console.error("Worker Error:", e.data.message);
		};

		try {
			const cached = await get<string>(STORAGE_KEY);
			source =
				cached ??
				`An extremely fast, no-BS Markdown renderer.

\`\`\`py
print(chr(sum(range(ord(min(str(not())))))))
\`\`\``;

			triggerRender(source);
		} catch (err) {
			console.error("IDB Error", err);
		}
	});

	onDestroy(() => {
		worker?.terminate();
		clearTimeout(renderTimer);
		clearTimeout(saveTimer);
	});

	const onInput = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			set(STORAGE_KEY, source).catch(console.error);
		}, DEBOUNCE_SAVE_MS);

		clearTimeout(renderTimer);
		renderTimer = setTimeout(() => {
			triggerRender(source);
		}, DEBOUNCE_RENDER_MS);
	};

	const triggerRender = (content: string) => {
		worker?.postMessage({ type: "RENDER", content } satisfies WorkerMessage);
	};

	const handleScroll = (e: Event) => {
		const target = e.target as HTMLElement;
		const preview = document.getElementById("preview-pane");
		if (preview && target) {
			const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
			if (!isNaN(percentage)) {
				preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
			}
		}
	};

	const handlePreviewClick = async (e: MouseEvent) => {
		const target = (e.target as HTMLElement).closest(".copy-btn") as HTMLButtonElement;
		if (!target) return;
		e.preventDefault();
		const code = target.getAttribute("data-code");
		if (code) {
			await navigator.clipboard.writeText(decodeURIComponent(code));
			const iconCopy = target.querySelector(".icon-copy");
			const iconCheck = target.querySelector(".icon-check");
			if (iconCopy && iconCheck) {
				iconCopy.classList.add("hidden");
				iconCheck.classList.remove("hidden");
				setTimeout(() => {
					iconCopy.classList.remove("hidden");
					iconCheck.classList.add("hidden");
				}, 2000);
			}
		}
	};
</script>

<main class="h-screen w-screen overflow-hidden bg-black font-sans text-zinc-300 selection:bg-zinc-800">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full" autoSaveId="svmd-layout-v1">
		<Resizable.Pane defaultSize={50} minSize={MIN_PANE_SIZE} class="h-full">
			<section class="relative h-full w-full bg-black" aria-label="MarOkdown editor">
				<textarea
					bind:this={editorRef}
					bind:value={source}
					oninput={onInput}
					onscroll={handleScroll}
					class="scrollbar-thin h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-[13px] leading-6 text-zinc-400 outline-none placeholder:text-zinc-800 focus:ring-0"
					placeholder="Type markdown..."
					spellcheck="false"
					aria-label="Markdown input"
				></textarea>
			</section>
		</Resizable.Pane>

		<Resizable.Handle class="w-px bg-zinc-800 transition-colors hover:bg-zinc-700" />

		<Resizable.Pane defaultSize={50} minSize={MIN_PANE_SIZE} class="h-full">
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<section
				id="preview-pane"
				class="scrollbar-thin h-full w-full overflow-y-auto bg-black p-4"
				onclick={handlePreviewClick}
				onkeydown={(e) => e.key === "Enter" && handlePreviewClick(e as unknown as MouseEvent)}
				aria-label="Markdown preview"
				tabindex="-1"
			>
				<article class="markdown-body">
					{#if renderedHtml}
						{@html renderedHtml}
					{:else}
						<div class="flex h-[80vh] animate-pulse items-center justify-center font-mono text-xs text-zinc-700">
							...
						</div>
					{/if}
				</article>
			</section>
		</Resizable.Pane>
	</Resizable.PaneGroup>
</main>

<style>
	.scrollbar-thin::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: #000000;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: #27272a;
		border-radius: 3px;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb:hover {
		background: #3f3f46;
	}

	.markdown-body {
		width: 100%;
		max-width: 100%;
		overflow-x: hidden;
		word-wrap: break-word;
		overflow-wrap: break-word;
		line-height: 1.6;
		color: #d4d4d8;
		font-size: 0.875rem;
	}

	:global(.markdown-body h1),
	:global(.markdown-body h2),
	:global(.markdown-body h3),
	:global(.markdown-body h4),
	:global(.markdown-body h5),
	:global(.markdown-body h6) {
		margin-top: 1.5em;
		margin-bottom: 0.75em;
		line-height: 1.3;
		font-weight: 600;
		color: #f4f4f5;
		letter-spacing: -0.025em;
	}
	:global(.markdown-body > *:first-child) {
		margin-top: 0;
	}

	:global(.markdown-body p) {
		margin-bottom: 0.75em;
		color: #a1a1aa;
	}
	:global(.markdown-body p:last-child) {
		margin-bottom: 0;
	}

	:global(.markdown-body a) {
		color: #60a5fa;
		text-decoration: none;
	}
	:global(.markdown-body a:hover) {
		text-decoration: underline;
	}

	:global(.markdown-body strong) {
		color: #e4e4e7;
	}

	:global(.markdown-body ul) {
		margin: 0.5em 0;
		padding-left: 1.5em;
		list-style-type: disc;
	}
	:global(.markdown-body ol) {
		margin: 0.5em 0;
		padding-left: 1.5em;
		list-style-type: decimal;
	}
	:global(.markdown-body li) {
		margin: 0.25em 0;
		color: #a1a1aa;
	}
	:global(.markdown-body li::marker) {
		color: #52525b;
	}

	:global(.markdown-body code:not(pre code)) {
		background-color: rgba(39, 39, 42, 0.5);
		color: #d4d4d8;
		padding: 0.2em 0.4em;
		border-radius: 0.25rem;
		font-size: 0.85em;
		font-family: ui-monospace, monospace;
		white-space: pre-wrap;
		word-break: break-word;
	}

	:global(pre.shiki) {
		margin: 0 !important;
		padding: 0.75rem !important;
		background-color: transparent !important;
		font-size: 13px !important;
		line-height: 1.5;
		overflow-x: auto;
	}
	:global(code) {
		font-family: ui-monospace, monospace;
	}

	:global(details > div) {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.15s ease-out;
	}
	:global(details[open] > div) {
		grid-template-rows: 1fr;
	}
	:global(details > div > div) {
		overflow: hidden;
	}
	:global(details > summary) {
		list-style: none;
	}
	:global(details > summary::-webkit-details-marker) {
		display: none;
	}
</style>
