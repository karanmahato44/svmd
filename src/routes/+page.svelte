<script lang="ts">
	import SplitPane from "#lib/components/SplitPane.svelte";
	import { getSourcePage, SOURCE_PAGE_SIZE } from "#lib/markdown/pagination.ts";
	import type { MainMessage, WorkerMessage } from "#lib/types/types.ts";
	import MarkdownWorker from "#lib/workers/markdown.worker.ts?worker";
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
	let worker: Worker | null = null;
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
		// Only copy the visible section across threads, regardless of document size.
		const request: WorkerMessage = { type: "RENDER", id: revision, page: sourcePage };
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

	async function onEditorKeydown(event: KeyboardEvent) {
		if (
			event.defaultPrevented ||
			event.isComposing ||
			event.key !== "Enter" ||
			!event.shiftKey ||
			event.altKey ||
			!(event.ctrlKey || event.metaKey)
		)
			return;
		event.preventDefault();
		const input = event.currentTarget as HTMLTextAreaElement;
		const { start, end, content } = sourcePage;
		const value = input.value;
		// Textareas normalize CRLF, so calculate offsets against the displayed text.
		const currentSource = content === value ? source : source.slice(0, start) + value + source.slice(end);
		const cursor = start + input.selectionStart;
		const lineStart = cursor === 0 ? 0 : currentSource.lastIndexOf("\n", cursor - 1) + 1;
		let indentEnd = lineStart;
		while (currentSource[indentEnd] === " " || currentSource[indentEnd] === "\t") indentEnd++;
		const insertion = currentSource.slice(lineStart, indentEnd) + "\n";
		let inserted = false;
		if (lineStart >= start && indentEnd <= start + value.length) {
			input.setSelectionRange(lineStart - start, lineStart - start);
			const previousRevision = revision;
			try {
				// Native insertion preserves the textarea's undo history where supported.
				inserted = document.execCommand("insertText", false, insertion);
			} catch {
				// Fall back to a source edit when native insertion is unavailable.
			}
			if (inserted && revision === previousRevision) input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		if (!inserted) {
			// A logical line can begin in the preceding section of a large document.
			source = currentSource.slice(0, lineStart) + insertion + currentSource.slice(lineStart);
			changed();
		}
		pageIndex = Math.floor(indentEnd / SOURCE_PAGE_SIZE);
		await tick();
		if (disposed) return;
		const caret = indentEnd - sourcePage.start;
		input.setSelectionRange(caret, caret);
	}

	async function onPaste(event: ClipboardEvent) {
		if (!event.clipboardData?.types.includes("text/plain")) return;
		const text = event.clipboardData.getData("text/plain");
		const { start: pageStart, end: pageEnd, content } = sourcePage;
		const { value, selectionStart, selectionEnd } = editorRef;
		// Let normal documents keep the textarea's native paste/undo behavior.
		if (
			source.length - content.length + value.length - (selectionEnd - selectionStart) + text.length <=
			SOURCE_PAGE_SIZE
		)
			return;
		event.preventDefault();
		// Selection offsets belong to the textarea's normalized newlines, not the raw source.
		source =
			source.slice(0, pageStart) +
			value.slice(0, selectionStart) +
			text +
			value.slice(selectionEnd) +
			source.slice(pageEnd);
		// Keep a large paste at its beginning so the inserted text stays visible.
		changed();
		await tick();
		if (disposed) return;
		const offset = Math.max(
			0,
			Math.min(pageStart + selectionStart + text.length - sourcePage.start, sourcePage.content.length)
		);
		const caret = sourcePage.content.slice(0, offset).replace(/\r\n?/g, "\n").length;
		editorRef.setSelectionRange(caret, caret);
	}

	function changePage(next: number) {
		pageIndex = getSourcePage(source, next).page;
		scheduleRender(true);
		if (editorRef) editorRef.scrollTop = 0;
		if (previewRef) previewRef.scrollTop = 0;
	}

	function exportMarkdown() {
		const now = new Date();
		const pad = (value: number) => String(value).padStart(2, "0");
		const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
		const blob = new Blob([source], { type: "text/markdown;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `document-${date}_${time}.md`;
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
			const text = code.textContent ?? "";
			let end = text.length;
			while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
			await navigator.clipboard.writeText(text.slice(0, end));
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
	class="flex h-dvh w-full flex-col overflow-hidden bg-(--app-bg) font-sans text-(--app-text) selection:bg-(--pane-border)"
>
	{#if notice}
		<p role="status" class="border-b border-border px-4 py-2 text-xs">{notice}</p>
	{/if}
	<div class="min-h-0 flex-1">
		<SplitPane>
			{#snippet editor()}
				<section class="relative h-full w-full" aria-label="Markdown editor">
					<textarea
						bind:this={editorRef}
						value={sourcePage.content}
						oninput={onInput}
						onkeydown={onEditorKeydown}
						onpaste={onPaste}
						onscroll={handleScroll}
						class="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-[13px] leading-6 text-(--editor-text) outline-none placeholder:text-(--placeholder) focus:ring-0"
						placeholder="Type markdown..."
						spellcheck="false"
						title={sourcePage.pageCount > 1
							? `Section ${sourcePage.page + 1} of ${sourcePage.pageCount}. Ctrl/Cmd+Alt+Left/Right changes section. Ctrl/Cmd+E exports the full document.`
							: undefined}
						aria-label="Markdown input"></textarea>
				</section>
			{/snippet}
			{#snippet preview()}
				<!-- Native buttons in the preview already emit keyboard clicks. -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
				<section
					bind:this={previewRef}
					id="preview-pane"
					class="h-full w-full overflow-y-auto bg-(--app-bg) p-4"
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
						{@html renderedHtml}
					</article>
				</section>
			{/snippet}
		</SplitPane>
	</div>
</main>

<style>
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
		/* Align its center with the 0.875rem collapse icon's inset. */
		margin-inline-end: calc((0.875rem - 1.25rem) / 2);
		flex-shrink: 0;
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
