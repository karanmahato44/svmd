import { describe, expect, it } from "vitest";
import MarkdownWorker from "./markdown.worker?worker";
import type { MainMessage, WorkerMessage } from "../types/types";

function exchange(worker: Worker, request: WorkerMessage): Promise<Extract<MainMessage, { type: "RESULT" }>> {
	return new Promise((resolve, reject) => {
		const onMessage = (event: MessageEvent<MainMessage>) => {
			if (event.data.id !== request.id) return;
			worker.removeEventListener("message", onMessage);
			if (event.data.type === "ERROR") reject(new Error(event.data.message));
			else resolve(event.data);
		};
		worker.addEventListener("message", onMessage);
		worker.postMessage(request);
	});
}

describe("real Markdown worker", () => {
	it("renders untrusted content as inert DOM and correlates queued responses", async () => {
		const worker = new MarkdownWorker();
		try {
			const malicious = exchange(worker, {
				type: "RENDER",
				id: 101,
				content:
					"<img src=x onerror=alert(1)>\n\n```<img/src=x/onerror=alert(1)>\na < b & c\n```\n[x](javascript:alert%281%29)"
			});
			const highlighted = exchange(worker, { type: "RENDER", id: 102, content: "```js\nconst answer = 42;\n```" });
			const [first, second] = await Promise.all([malicious, highlighted]);
			const dom = new DOMParser().parseFromString(first.html, "text/html");
			expect(first.id).toBe(101);
			expect(second.id).toBe(102);
			expect(dom.querySelector("img,script,[onerror],a[href]")).toBeNull();
			expect(dom.querySelector("pre code")?.textContent).toBe("a < b & c\n");
			expect(dom.querySelector("button.copy-btn")?.textContent?.trim()).toBe("");
			const code = new DOMParser().parseFromString(second.html, "text/html").querySelector("pre code");
			expect(code?.textContent).toBe("const answer = 42;\n");
			expect(second.html).toContain("shiki-themes");
		} finally {
			worker.terminate();
		}
	});
	it.each([1_000_000, 10_000_000])("bounds preview output for a %i character document", async (size) => {
		const worker = new MarkdownWorker();
		try {
			const paragraph = "# Heading\n\nA paragraph with **bold** text.\n\n";
			const content = paragraph.repeat(Math.ceil(size / paragraph.length)).slice(0, size) + "\nLAST_PAGE";
			const start = performance.now();
			const first = await exchange(worker, { type: "RENDER", id: 1, content });
			const firstMs = performance.now() - start;
			const lastStart = performance.now();
			const last = await exchange(worker, { type: "PAGE", id: 2, page: first.pageCount - 1 });
			const dom = new DOMParser().parseFromString(first.html, "text/html");
			// Includes worker startup and message cloning; timing is evidence, not a flaky pass/fail limit.
			console.info(
				JSON.stringify({
					sourceCharacters: content.length,
					firstMs: Math.round(firstMs),
					lastMs: Math.round(performance.now() - lastStart),
					htmlCharacters: first.html.length,
					domElements: dom.querySelectorAll("*").length
				})
			);
			expect(first.pageCount).toBeGreaterThan(1);
			expect(first.html.length).toBeLessThan(300_100);
			expect(dom.querySelectorAll("*").length).toBeLessThan(4_100);
			expect(first.html).not.toContain("LAST_PAGE");
			expect(last.html).toContain("LAST_PAGE");
			expect(last.id).toBe(2);
		} finally {
			worker.terminate();
		}
	});
});
