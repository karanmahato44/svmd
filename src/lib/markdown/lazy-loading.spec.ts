import { describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "./render";

const highlighter = vi.hoisted(() => ({ imported: vi.fn() }));
vi.mock("./highlighter", () => {
	highlighter.imported();
	return { prepareHighlighter: vi.fn() };
});

describe("plain Markdown startup", () => {
	it("does not load the highlighting engine for plaintext or unknown fences", async () => {
		for (const language of ["", "text", "plaintext", "unknown-language", "constructor"]) {
			const { html } = await renderMarkdown("```" + language + "\nhello\n```");
			expect(html).toContain("hello\n</code>");
		}
		expect(highlighter.imported).not.toHaveBeenCalled();
	});
});
