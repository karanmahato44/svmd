<script lang="ts">
	import * as Resizable from "$lib/components/ui/resizable/index.js";
	import { getSourcePage, SOURCE_PAGE_SIZE } from "$lib/markdown/pagination";
	import type { MainMessage, WorkerMessage } from "$lib/types/types";
	import MarkdownWorker from "$lib/workers/markdown.worker?worker";
	import { get, set } from "idb-keyval";
	import { onMount, tick } from "svelte";

	const STORAGE_KEY = "svmd_source_v1";
	const DEFAULT_SOURCE =
		"Extremely fast, no-BS Markdown renderer.\n\n```py\nprint(chr(sum(range(ord(min(str(not())))))))\n```";
	let source = $state("");
	let pageIndex = $state(0);
	const sourcePage = $derived(getSourcePage(source, pageIndex));
	let renderedHtml = $state("");
	let loading = $state(true);
	let notice = $state("");
	let renderError = $state("");
	let simplified = $state(false);
	let editorRef: HTMLTextAreaElement;
	let previewRef: HTMLElement;
	let paneGroup: { getLayout: () => number[]; setLayout: (layout: number[]) => void; getId: () => string } | undefined =
		$state();
	let worker: Worker | null = null;
	let workerSource: string | null = null;
	let revision = 0;
	let edited = false;
	let disposed = false;
	let busy = false;
	let ready = false;
	let dirty = false;
	let renderTimer: ReturnType<typeof setTimeout>;
	let saveTimer: ReturnType<typeof setTimeout>;
	let watchdog: ReturnType<typeof setTimeout>;
	let scrollFrame = 0;

	function failRender() {
		worker?.terminate();
		worker = null;
		workerSource = null;
		busy = false;
		loading = false;
		renderError = "Preview could not finish. Your source is safe; retry or export it.";
		clearTimeout(watchdog);
	}

	function startWorker() {
		try {
			worker = new MarkdownWorker();
			worker.onerror = failRender;
			worker.onmessageerror = failRender;
			worker.onmessage = (event: MessageEvent<MainMessage>) => {
				clearTimeout(watchdog);
				busy = false;
				if (event.data.id === revision) {
					loading = false;
					if (event.data.type === "RESULT") {
						renderedHtml = event.data.html;
						simplified = event.data.simplified;
						renderError = "";
					} else {
						renderError = "Preview failed. Your source is safe; retry or export it.";
					}
				}
				if (ready) dispatchRender();
			};
		} catch {
			failRender();
		}
	}

	function dispatchRender() {
		if (disposed || busy || !ready) return;
		if (!worker) startWorker();
		if (!worker) return;
		ready = false;
		busy = true;
		loading = true;
		const request: WorkerMessage =
			workerSource === source
				? { type: "PAGE", id: revision, page: sourcePage.page }
				: { type: "RENDER", id: revision, content: source, page: sourcePage.page };
		workerSource = source;
		watchdog = setTimeout(failRender, 10000);
		try {
			worker.postMessage(request);
		} catch {
			failRender();
		}
	}

	function scheduleRender(immediate = false) {
		revision += 1;
		ready = false;
		loading = true;
		clearTimeout(renderTimer);
		if (immediate) {
			ready = true;
			dispatchRender();
		} else {
			renderTimer = setTimeout(() => {
				ready = true;
				dispatchRender();
			}, 150);
		}
	}

	let saving = false;
	let pendingSave: string | null = null;
	function saveSource() {
		if (!dirty) return;
		dirty = false;
		pendingSave = source;
		if (!saving) void persistPending();
	}

	async function persistPending() {
		saving = true;
		while (pendingSave !== null) {
			const snapshot = pendingSave;
			pendingSave = null;
			try {
				await set(STORAGE_KEY, snapshot);
			} catch {
				if (!disposed) {
					dirty = true;
					notice = "Local save failed. Export Markdown to keep a copy.";
				}
			}
		}
		saving = false;
	}

	function changed() {
		edited = true;
		dirty = true;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(saveSource, 1000);
		scheduleRender();
	}

	function onInput(event: Event) {
		const input = event.currentTarget as HTMLTextAreaElement;
		const { start, end } = sourcePage;
		source = source.slice(0, start) + input.value + source.slice(end);
		changed();
	}

	async function onPaste(event: ClipboardEvent) {
		if (!event.clipboardData?.types.includes("text/plain")) return;
		const text = event.clipboardData.getData("text/plain");
		const start = sourcePage.start + editorRef.selectionStart;
		const end = sourcePage.start + editorRef.selectionEnd;
		// Let normal documents keep the textarea's native paste/undo behavior.
		if (source.length - (end - start) + text.length <= SOURCE_PAGE_SIZE) return;
		event.preventDefault();
		source = source.slice(0, start) + text + source.slice(end);
		// Keep a large paste at its beginning so the inserted text stays visible.
		changed();
		await tick();
		editorRef.setSelectionRange(
			Math.min(start - sourcePage.start + text.length, sourcePage.content.length),
			Math.min(start - sourcePage.start + text.length, sourcePage.content.length)
		);
	}

	function changePage(next: number) {
		pageIndex = getSourcePage(source, next).page;
		scheduleRender(true);
		if (editorRef) editorRef.scrollTop = 0;
		if (previewRef) previewRef.scrollTop = 0;
	}

	function exportMarkdown() {
		const blob = new Blob([source], { type: "text/markdown;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "document.md";
		anchor.click();
		setTimeout(() => {
			URL.revokeObjectURL(url);
		}, 1000);
	}

	function handleScroll() {
		if (scrollFrame) return;
		scrollFrame = requestAnimationFrame(() => {
			scrollFrame = 0;
			const range = editorRef.scrollHeight - editorRef.clientHeight;
			if (range > 0 && previewRef) {
				previewRef.scrollTop = (editorRef.scrollTop / range) * (previewRef.scrollHeight - previewRef.clientHeight);
			}
		});
	}

	async function handlePreviewClick(event: MouseEvent) {
		const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".copy-btn") : null;
		if (!target || !previewRef.contains(target)) return;
		event.preventDefault();
		const code = target.closest(".svmd-code-block, .svmd-warn-block")?.querySelector("pre code");
		if (!code) return;
		try {
			await navigator.clipboard.writeText(code.textContent ?? "");
			target.dataset.copied = "true";
			target.setAttribute("aria-label", "Copied code");
			setTimeout(() => {
				delete target.dataset.copied;
				target.setAttribute("aria-label", "Copy code");
			}, 2000);
		} catch {
			notice = "Clipboard access failed. Select the code and copy it manually.";
		}
	}

	onMount(() => {
		startWorker();
		void get<unknown>(STORAGE_KEY)
			.then((cached) => {
				if (disposed || edited) return;
				source = typeof cached === "string" ? cached : DEFAULT_SOURCE;
				scheduleRender(true);
			})
			.catch(() => {
				if (disposed || edited) return;
				source = DEFAULT_SOURCE;
				notice = "Local storage is unavailable. Export Markdown to keep a copy.";
				scheduleRender(true);
			});
		const flush = () => {
			if (document.visibilityState === "hidden") saveSource();
		};
		const shortcuts = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat || event.isComposing || !(event.ctrlKey || event.metaKey)) return;
			if (!event.altKey && !event.shiftKey && event.key.toLowerCase() === "e") {
				event.preventDefault();
				exportMarkdown();
			} else if (event.altKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
				event.preventDefault();
				changePage(sourcePage.page + (event.key === "ArrowRight" ? 1 : -1));
			}
		};
		window.addEventListener("keydown", shortcuts);
		document.addEventListener("visibilitychange", flush);
		window.addEventListener("pagehide", saveSource);
		editorRef?.focus();
		return () => {
			disposed = true;
			saveSource();
			worker?.terminate();
			clearTimeout(renderTimer);
			clearTimeout(saveTimer);
			clearTimeout(watchdog);
			cancelAnimationFrame(scrollFrame);
			document.removeEventListener("visibilitychange", flush);
			window.removeEventListener("pagehide", saveSource);
			window.removeEventListener("keydown", shortcuts);
		};
	});
</script>

<main
	class="flex h-dvh w-full flex-col overflow-hidden bg-[var(--app-bg)] font-sans text-[var(--app-text)] selection:bg-[var(--pane-border)]"
>
	{#if notice}
		<p role="status" class="border-b border-border px-4 py-2 text-xs">{notice}</p>
	{/if}
	<div class="min-h-0 flex-1">
		<Resizable.PaneGroup bind:api={paneGroup} direction="horizontal" class="h-full w-full" autoSaveId="svmd-layout-v1">
			<Resizable.Pane defaultSize={50} minSize={20} class="h-full min-w-0">
				<section class="relative h-full w-full" aria-label="Markdown editor">
					<textarea
						bind:this={editorRef}
						value={sourcePage.content}
						oninput={onInput}
						onpaste={onPaste}
						onscroll={handleScroll}
						class="h-full w-full resize-none scrollbar-thin border-0 bg-transparent p-4 font-mono text-[13px] leading-6 text-[var(--editor-text)] outline-none placeholder:text-[var(--placeholder)] focus:ring-0"
						placeholder="Type markdown..."
						spellcheck="false"
						title={sourcePage.pageCount > 1
							? `Section ${sourcePage.page + 1} of ${sourcePage.pageCount}. Ctrl/Cmd+Alt+Left/Right changes section. Ctrl/Cmd+E exports the full document.`
							: undefined}
						aria-label="Markdown input"></textarea>
				</section>
			</Resizable.Pane>
			<Resizable.Handle
				class="w-px bg-[var(--pane-border)] transition-colors hover:bg-[var(--pane-border-hover)]"
				ondblclick={() => paneGroup?.setLayout([50, 50])}
				onkeydown={(event) => {
					if (event.key === "Home") {
						event.preventDefault();
						paneGroup?.setLayout([50, 50]);
					}
				}}
				aria-label="Resize editor and preview. Double-click or press Home to reset."
				title="Double-click to reset split"
			/>
			<Resizable.Pane defaultSize={50} minSize={20} class="h-full min-w-0">
				<!-- Native buttons in the preview already emit keyboard clicks. -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
				<section
					bind:this={previewRef}
					id="preview-pane"
					class="h-full w-full scrollbar-thin overflow-y-auto bg-[var(--app-bg)] p-4"
					onclick={handlePreviewClick}
					aria-label="Markdown preview"
					tabindex="-1"
				>
					{#if renderError}
						<p role="alert">
							{renderError} <button class="toolbar-button" onclick={() => scheduleRender(true)}>Retry</button>
						</p>
					{/if}
					{#if simplified}
						<p class="mb-3 text-xs">This section is shown as plain text to keep the preview responsive.</p>
					{/if}
					<article class="markdown-body" aria-busy={loading}>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderedHtml}
					</article>
				</section>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</div>
</main>

<style>
	.scrollbar-thin::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: var(--scrollbar-track);
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: var(--scrollbar-thumb);
		border-radius: 3px;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb:hover {
		background: var(--scrollbar-thumb-hover);
	}

	.markdown-body {
		width: 100%;
		max-width: 100%;
		overflow-x: hidden;
		word-wrap: break-word;
		overflow-wrap: break-word;
		line-height: 1.6;
		color: var(--preview-text);
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
		color: var(--preview-heading);
		letter-spacing: -0.025em;
	}

	:global(.markdown-body > *:first-child) {
		margin-top: 0;
	}

	:global(.markdown-body p) {
		margin-bottom: 0.75em;
		color: var(--preview-body);
	}

	:global(.markdown-body p:last-child) {
		margin-bottom: 0;
	}

	:global(.markdown-body a) {
		color: var(--preview-link);
		text-decoration: none;
	}

	:global(.markdown-body a:hover) {
		text-decoration: underline;
	}

	:global(.markdown-body strong) {
		color: var(--preview-strong);
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
		color: var(--preview-body);
	}

	:global(.markdown-body li::marker) {
		color: var(--preview-marker);
	}

	:global(.markdown-body code:not(pre code)) {
		background-color: var(--inline-code-bg);
		color: var(--preview-text);
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

	:global(.light .shiki),
	:global(.light .shiki span) {
		color: var(--shiki-light) !important;
		background-color: var(--shiki-light-bg) !important;
	}

	:global(:root:not(.light) .shiki),
	:global(:root:not(.light) .shiki span),
	:global(.dark .shiki),
	:global(.dark .shiki span) {
		color: var(--shiki-dark) !important;
		background-color: var(--shiki-dark-bg) !important;
	}

	:global(.svmd-code-block) {
		border: 1px solid var(--code-border);
		background: var(--code-bg);
	}

	:global(.svmd-code-summary) {
		border-bottom: 1px solid var(--code-border);
		background: var(--code-header-bg);
		color: var(--editor-text);
	}

	:global(.svmd-code-summary:hover) {
		background: var(--code-header-hover);
	}

	:global(.svmd-code-summary:focus) {
		box-shadow: 0 0 0 1px var(--code-focus-ring);
	}

	:global(.svmd-code-chevron) {
		color: var(--muted-text);
	}

	:global(.svmd-code-summary:hover .svmd-code-chevron) {
		color: var(--editor-text);
	}

	:global(.copy-btn) {
		color: var(--editor-text);
		background: transparent;
		border: 1px solid transparent;
		width: 1.25rem;
		height: 1.25rem;
		padding: 3px;
		cursor: pointer;
		opacity: 1;
	}

	:global(.copy-btn svg) {
		width: 0.75rem;
		height: 0.75rem;
		flex-shrink: 0;
	}

	:global(.copy-btn:focus-visible) {
		outline: 2px solid var(--foreground);
		outline-offset: 2px;
	}

	:global(.copy-btn[data-copied="true"] .icon-copy) {
		display: none;
	}
	:global(.copy-btn[data-copied="true"] .icon-check) {
		display: block;
	}

	.toolbar-button {
		border: 1px solid var(--border);
		border-radius: 0.3rem;
		background: var(--secondary);
		color: var(--foreground);
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}
	.toolbar-button:hover {
		background: var(--accent);
	}
	.toolbar-button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.toolbar-button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	:global(.markdown-body > *) {
		content-visibility: auto;
		contain-intrinsic-size: auto 100px;
	}
	:global(.markdown-body pre) {
		max-width: 100%;
		overflow: auto;
		padding: 0.75rem;
	}
	:global(.markdown-body table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
	}
	:global(.markdown-body img) {
		max-width: 100%;
		height: auto;
	}

	:global(.copy-btn:hover) {
		background: var(--code-copy-hover);
		border-color: var(--code-border);
		color: var(--preview-heading);
	}

	:global(.svmd-warn-block) {
		border: 1px solid var(--warn-border);
		background: var(--warn-bg);
	}

	:global(.svmd-warn-header) {
		border-bottom: 1px solid var(--warn-border);
		background: var(--warn-header-bg);
		color: var(--warn-text);
	}

	:global(.svmd-warn-copy) {
		color: var(--warn-text);
		opacity: 1;
	}

	:global(.svmd-warn-copy:hover) {
		background: var(--warn-copy-hover);
		color: var(--warn-text);
		opacity: 1;
	}

	:global(.svmd-warn-pre) {
		color: var(--warn-muted);
	}

	:global(code) {
		font-family: ui-monospace, monospace;
	}

	:global(.svmd-code-block details > div) {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.15s ease-out;
	}

	:global(.svmd-code-block details[open] > div) {
		grid-template-rows: 1fr;
	}

	:global(.svmd-code-block details > div > div) {
		overflow: hidden;
	}

	:global(.svmd-code-block details > summary) {
		list-style: none;
	}

	:global(.svmd-code-block details > summary::-webkit-details-marker) {
		display: none;
	}
</style>
