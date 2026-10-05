<script lang="ts">
	import { onMount, type Snippet } from "svelte";

	let { editor, preview }: { editor: Snippet; preview: Snippet } = $props();
	const editorId = $props.id();
	// Retain the existing saved split when removing the former pane library.
	const storageKey = "paneforge:svmd-layout-v1";
	const layoutKey = '{"defaultSize":50,"minSize":20},{"defaultSize":50,"minSize":20}';
	let left = $state(50);
	let stacked = $state(false);
	let dragging = $state(false);
	let group: HTMLDivElement;
	let handle: HTMLDivElement;
	let drag: {
		pointer: number;
		position: number;
		left: number;
		span: number;
		vertical: boolean;
		reversed: boolean;
	} | null = null;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let changed = false;

	function save() {
		if (!changed) return;
		changed = false;
		try {
			let stored: unknown;
			try {
				stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
			} catch {
				stored = {};
			}
			const state = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
			localStorage.setItem(
				storageKey,
				JSON.stringify({ ...state, [layoutKey]: { expandToSizes: {}, layout: [left, 100 - left] } })
			);
		} catch {
			// Resizing remains available when local storage is unavailable.
		}
	}

	function resize(value: number) {
		const next = Math.min(80, Math.max(20, value));
		if (next === left) return;
		left = next;
		changed = true;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 100);
	}

	function start(event: PointerEvent) {
		if (event.button !== 0 || !event.isPrimary || drag) return;
		const bounds = group.getBoundingClientRect();
		const span = stacked ? bounds.height : bounds.width;
		if (!span) return;
		event.preventDefault();
		drag = {
			pointer: event.pointerId,
			position: stacked ? event.clientY : event.clientX,
			left,
			span,
			vertical: stacked,
			reversed: !stacked && getComputedStyle(group).direction === "rtl"
		};
		dragging = true;
		handle.setPointerCapture(event.pointerId);
	}

	function move(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		event.preventDefault();
		const position = drag.vertical ? event.clientY : event.clientX;
		resize(drag.left + ((position - drag.position) / drag.span) * (drag.reversed ? -100 : 100));
	}

	function stop(event?: PointerEvent) {
		if (!drag || (event && event.pointerId !== drag.pointer)) return;
		const pointer = drag.pointer;
		drag = null;
		dragging = false;
		if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
		handle.blur();
	}

	function keydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		const step = event.shiftKey ? 100 : 10;
		const direction = !stacked && getComputedStyle(group).direction === "rtl" ? -1 : 1;
		switch (event.key) {
			case "ArrowLeft":
				if (!stacked) resize(left - step * direction);
				break;
			case "ArrowRight":
				if (!stacked) resize(left + step * direction);
				break;
			case "Home":
				resize(50);
				break;
			case "End":
				resize(80);
				break;
			case "F6":
				handle.focus();
				break;
			case "ArrowUp":
				if (stacked) resize(left - step);
				break;
			case "ArrowDown":
				if (stacked) resize(left + step);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	onMount(() => {
		const mobile = window.matchMedia("(width < 48rem)");
		const updateOrientation = () => {
			stop();
			stacked = mobile.matches;
		};
		updateOrientation();
		mobile.addEventListener("change", updateOrientation);
		try {
			const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
			const layout: unknown = stored?.[layoutKey]?.layout;
			if (
				Array.isArray(layout) &&
				layout.length === 2 &&
				layout.every((size) => typeof size === "number" && Number.isFinite(size) && size >= 20 && size <= 80) &&
				Math.abs(layout[0] + layout[1] - 100) < 0.001
			) {
				left = layout[0];
			}
		} catch {
			// Keep the default split if a preference cannot be read.
		}
		return () => {
			mobile.removeEventListener("change", updateOrientation);
			clearTimeout(saveTimer);
			save();
		};
	});
</script>

<svelte:window onpointermove={move} onpointerup={stop} onpointercancel={stop} onblur={() => stop()} onpagehide={save} />

<div
	bind:this={group}
	data-pane-group
	data-dragging={dragging || undefined}
	class="split flex h-full w-full overflow-hidden"
>
	<div
		id={editorId}
		data-pane
		class="min-h-0 min-w-0 overflow-hidden"
		style:flex-basis="0"
		style:flex-grow={left.toPrecision(3)}
		style:flex-shrink="1"
		style:pointer-events={dragging ? "none" : undefined}
	>
		{@render editor()}
	</div>
	<!-- Adjustable separators are keyboard controls (WAI-ARIA Window Splitter pattern). -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={handle}
		data-pane-resizer
		role="separator"
		tabindex="0"
		aria-orientation={stacked ? "horizontal" : "vertical"}
		aria-controls={editorId}
		aria-valuemin="20"
		aria-valuemax="80"
		aria-valuenow={Math.round(left)}
		aria-label="Resize editor and preview. Double-click or press Home to reset."
		title="Double-click to reset split"
		class="relative flex shrink-0 items-center justify-center bg-(--pane-border) transition-colors hover:bg-(--pane-border-hover) focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-hidden"
		onpointerdown={start}
		onlostpointercapture={stop}
		oncontextmenu={() => stop()}
		ondblclick={() => resize(50)}
		onkeydown={keydown}
	></div>
	<div
		data-pane
		class="min-h-0 min-w-0 overflow-hidden"
		style:flex-basis="0"
		style:flex-grow={(100 - left).toPrecision(3)}
		style:flex-shrink="1"
		style:pointer-events={dragging ? "none" : undefined}
	>
		{@render preview()}
	</div>
</div>

<style>
	.split {
		--resize-cursor: ew-resize;
	}
	[data-pane-resizer] {
		width: 1px;
		cursor: var(--resize-cursor);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	[data-pane-resizer]::after {
		content: "";
		position: absolute;
		inset-block: 0;
		inset-inline-start: 50%;
		width: 4px;
		transform: translateX(-50%);
	}
	.split[data-dragging],
	.split[data-dragging] :global(*) {
		cursor: var(--resize-cursor) !important;
	}
	@media (width < 48rem) {
		.split {
			--resize-cursor: ns-resize;
			flex-direction: column;
		}
		[data-pane-resizer] {
			width: auto;
			height: 1px;
		}
		[data-pane-resizer]::after {
			inset: 50% 0 auto;
			width: auto;
			height: 4px;
			transform: translateY(-50%);
		}
	}
</style>
