<script lang="ts">
	import * as ResizablePrimitive from "paneforge";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		api = $bindable(),
		class: className,
		...restProps
	}: ResizablePrimitive.PaneGroupProps & {
		api?: { getLayout: () => number[]; setLayout: (layout: number[]) => void; getId: () => string };
	} = $props();
</script>

<ResizablePrimitive.PaneGroup
	bind:this={api}
	bind:ref={ref}
	data-slot="resizable-pane-group"
	class={cn("flex h-full w-full data-[direction=vertical]:flex-col", className)}
	{...restProps}
/>
