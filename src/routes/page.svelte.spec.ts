import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-svelte";
import { tick } from "svelte";
import type { MainMessage, WorkerMessage } from "$lib/types/types";
import Page from "./+page.svelte";
import "./layout.css";

const harness = vi.hoisted(() => ({
	requests: [] as WorkerMessage[],
	respond: (data: MainMessage) => {
		void data;
	},
	get: vi.fn<() => Promise<unknown>>(),
	set: vi.fn(() => Promise.resolve())
}));
vi.mock("idb-keyval", () => ({ get: harness.get, set: harness.set }));
vi.mock("$lib/workers/markdown.worker?worker", () => ({
	default: class {
		onmessage: ((event: { data: MainMessage }) => void) | null = null;
		constructor() {
			harness.respond = (data) => this.onmessage?.({ data });
		}
		postMessage(message: WorkerMessage) {
			harness.requests.push(message);
		}
		terminate() {}
	}
}));

function result(id: number, html: string): MainMessage {
	return { type: "RESULT", id, html, page: 0, pageCount: 1, largeDocument: false, simplified: false };
}
async function mounted() {
	await render(Page);
	await expect.poll(() => harness.requests.length).toBe(1);
	return document.querySelector<HTMLTextAreaElement>("textarea")!;
}
function input(editor: HTMLTextAreaElement, value: string) {
	editor.value = value;
	editor.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
	harness.requests.length = 0;
	harness.get.mockResolvedValue("# Hello");
	harness.set.mockReset().mockResolvedValue();
	localStorage.clear();
});
afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
});

describe("Markdown editor", () => {
	it("preserves the headerless layout and thin divider", async () => {
		await mounted();
		expect(document.querySelector("main header")).toBeNull();
		expect(document.querySelector("main")?.textContent).not.toContain("Export .md");
		const divider = document.querySelector<HTMLElement>("[data-pane-resizer]")!;
		expect(divider.getBoundingClientRect().width).toBe(1);
		expect(divider.querySelector("svg")).toBeNull();
	});

	it.each(["ctrlKey", "metaKey"])("exports with %s + E and cleans up the shortcut", async (modifier) => {
		const view = await render(Page);
		await expect.poll(() => harness.requests.length).toBe(1);
		const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		const event = new KeyboardEvent("keydown", { key: "e", [modifier]: true, cancelable: true });
		window.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(create).toHaveBeenCalledTimes(1);
		await view.unmount();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", [modifier]: true, cancelable: true }));
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("discards stale output and coalesces pending edits", async () => {
		const editor = await mounted();
		const first = harness.requests[0];
		input(editor, "# Second");
		await tick();
		input(editor, "# Latest");
		await new Promise((resolve) => setTimeout(resolve, 180));
		expect(harness.requests).toHaveLength(1);
		harness.respond(result(first.id, "<h1>Stale</h1>"));
		await tick();
		expect(document.querySelector("article")?.textContent).not.toContain("Stale");
		expect(harness.requests).toHaveLength(2);
		expect(harness.requests[1]).toMatchObject({ content: "# Latest" });
		harness.respond(result(harness.requests[1].id, "<h1>Latest</h1>"));
		await expect.element(page.getByRole("heading", { name: "Latest" })).toBeVisible();
	});

	it("exports the entire large paste and bounds the editor page", async () => {
		harness.get.mockResolvedValue("");
		const editor = await mounted();
		harness.respond(result(harness.requests[0].id, ""));
		const source = "# Large\n" + "hello 🦊\n".repeat(1_111_111);
		const clipboardData = new DataTransfer();
		clipboardData.setData("text/plain", source);
		const started = performance.now();
		editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
		await tick();
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		// eslint-disable-next-line no-console
		console.info(`10-million-character editor paste to paint: ${Math.round(performance.now() - started)}ms`);
		expect(editor.value.length).toBeLessThanOrEqual(50000);
		expect(editor.title).toContain("Section 1 of");
		let exported: Blob | undefined;
		vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
			exported = blob as Blob;
			return "blob:test";
		});
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true, cancelable: true }));
		expect(await exported!.text()).toBe(source);
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, altKey: true, cancelable: true })
		);
		await tick();
		await tick();
		expect(editor.value).toBe(source.slice(50000, 100000));
	});

	it("does not overwrite typing with a late IndexedDB load", async () => {
		let resolve!: (value: string) => void;
		harness.get.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			})
		);
		await render(Page);
		const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
		input(editor, "New work");
		resolve("Old work");
		await tick();
		await expect.element(page.getByRole("textbox", { name: "Markdown input" })).toHaveValue("New work");
	});

	it("coalesces slow local saves without losing the newest edit", async () => {
		const editor = await mounted();
		const finish: (() => void)[] = [];
		harness.set.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
		for (const content of ["First", "Second", "Latest"]) {
			input(editor, content);
			await tick();
			window.dispatchEvent(new Event("pagehide"));
		}
		expect(harness.set).toHaveBeenCalledTimes(1);
		finish[0]();
		await expect.poll(() => harness.set.mock.calls.length).toBe(2);
		expect(harness.set).toHaveBeenLastCalledWith("svmd_source_v1", "Latest");
		finish[1]();
	});

	it("preserves other pages when a visible page is edited", async () => {
		const original = "a".repeat(50000) + "b".repeat(50000) + "tail";
		harness.get.mockResolvedValue(original);
		const editor = await mounted();
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, altKey: true, cancelable: true })
		);
		await tick();
		input(editor, "edited page");
		await tick();
		window.dispatchEvent(new Event("pagehide"));
		expect(harness.set).toHaveBeenLastCalledWith("svmd_source_v1", "a".repeat(50000) + "edited pagetail");
	});

	it("resets a resized split with double click", async () => {
		await mounted();
		const handle = document.querySelector<HTMLElement>("[data-pane-resizer]")!;
		handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		await tick();
		const pane = document.querySelector<HTMLElement>("[data-pane]")!;
		expect(Number(pane.style.flexGrow)).not.toBe(50);
		handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		await tick();
		expect(Number(pane.style.flexGrow)).toBe(50);
	});

	it("copies code without its trailing newline or collapsing its details", async () => {
		await mounted();
		harness.respond(
			result(
				harness.requests[0].id,
				'<div class="svmd-code-block"><details open><summary>Text<button class="copy-btn" aria-label="Copy code">Copy</button></summary><pre><code>&lt;safe&gt;\n</code></pre></details></div>'
			)
		);
		const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		await page.getByRole("button", { name: "Copy code" }).click();
		expect(write).toHaveBeenCalledWith("<safe>");
		expect(document.querySelector("details")?.open).toBe(true);
	});

	it.each([
		["  first\n\n\tsecond  \n\n", "  first\n\n\tsecond  "],
		["first\r\nsecond\r\n\r\n", "first\r\nsecond"],
		["  command  ", "  command  "]
	])("preserves internal whitespace when copying %j", async (source, expected) => {
		await mounted();
		harness.respond(
			result(harness.requests[0].id, '<div class="svmd-code-block"><button class="copy-btn" aria-label="Copy code"></button><pre><code></code></pre></div>')
		);
		await tick();
		document.querySelector("pre code")!.textContent = source;
		const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		await page.getByRole("button", { name: "Copy code" }).click();
		expect(write).toHaveBeenCalledWith(expected);
	});

	it("keeps the copy icon visible in both themes", async () => {
		await mounted();
		harness.respond(
			result(harness.requests[0].id, '<div class="svmd-code-block"><details open><summary class="svmd-code-summary"><button class="copy-btn">Copy</button></summary></details></div>')
		);
		await tick();
		const button = document.querySelector<HTMLElement>(".copy-btn")!;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const context = canvas.getContext("2d")!;
		const luminance = (...colors: string[]) => {
			context.fillStyle = "white";
			context.fillRect(0, 0, 1, 1);
			for (const color of colors) {
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
			}
			const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
				.slice(0, 3)
				.map((value) => {
					const scaled = value / 255;
					return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
				});
			return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
		};
		for (const light of [false, true]) {
			document.documentElement.classList.toggle("light", light);
			const style = getComputedStyle(button);
			const foreground = luminance(style.color);
			const backgrounds: string[] = [];
			for (let element: HTMLElement | null = button; element; element = element.parentElement) {
				backgrounds.unshift(getComputedStyle(element).backgroundColor);
			}
			const background = luminance(...backgrounds);
			expect(
				(Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
			).toBeGreaterThanOrEqual(4.5);
		}
		document.documentElement.classList.remove("light");
	});
});
