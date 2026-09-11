import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render";
import { getSourcePage, SOURCE_PAGE_SIZE } from "./pagination";

describe("untrusted Markdown", () => {
	it("escapes raw HTML and malicious fence labels", async () => {
		const { html } = await renderMarkdown(
			"<img src=x onerror=alert(1)>\n\n```<img/src=x/onerror=alert(1)>\nhello\n```"
		);
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
		expect(html).not.toContain("data-code=");
	});
	it("rejects executable URL schemes including entity obfuscation", async () => {
		const { html } = await renderMarkdown(
			"[x](javascript:alert%281%29)\n[x](jav&#x61;script:alert%281%29)\n![x](data:image/svg+xml;base64,PHN2Zz4=)"
		);
		expect(html).not.toContain("href=");
		expect(html).not.toContain("src=");
	});
	it("keeps unknown and prototype-named languages readable", async () => {
		const { html } = await renderMarkdown("```constructor\na < b & c\n```\n```__proto__\nx\n```");
		expect(html).toContain("a &lt; b &amp; c\n</code>");
		expect(html).toContain('aria-label="Copy code"');
		expect(html).not.toContain("Copy</span>");
	});
	it("highlights supported code while preserving its trailing newline", async () => {
		const { html } = await renderMarkdown("```js\nconst answer = 42;\n```");
		expect(html).toContain("shiki-themes");
		expect(html).toContain("--shiki-light");
		const code = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)?.[1].replace(/<[^>]*>/g, "");
		expect(code).toBe("const answer = 42;\n");
	});
	it.each([
		["svelte", '<script lang="ts">let count: number = 1;</script>\n<button>{count}</button>'],
		[
			"vue",
			'<script setup lang="ts">const count: number = 1;</script>\n<template><button>{{ count }}</button></template>'
		],
		["tsx", "const Button = ({ count }: { count: number }) => <button>{count}</button>;"],
		["python", 'def greet(name):\n    return f"Hello {name}"'],
		["bash", 'for file in *.md; do echo "$file"; done']
	])("loads the %s grammar and its embedded languages", async (language, code) => {
		const { html } = await renderMarkdown("```" + language + "\n" + code + "\n```");
		expect(html).toContain("shiki-themes");
		expect(html).toContain("--shiki-dark");
		expect(html.match(/<span style=/g)?.length).toBeGreaterThan(2);
	});
});

describe("bounded large-document rendering", () => {
	it("keeps the complete source recoverable across UTF-16 page boundaries", () => {
		const source = "x".repeat(SOURCE_PAGE_SIZE - 1) + "😀" + "y".repeat(SOURCE_PAGE_SIZE) + "終";
		const pages = Array.from({ length: getSourcePage(source).pageCount }, (_, page) => getSourcePage(source, page));
		expect(pages.map((part) => part.content).join("")).toBe(source);
		expect(pages[0].end).toBe(pages[1].start);
		expect(pages[1].content.startsWith("😀")).toBe(true);
	});
	it("renders only the requested part of a 10 MB document", async () => {
		const source = "ordinary text\n\n".repeat(700_000) + "\nLAST_PAGE";
		const first = await renderMarkdown(source);
		const last = await renderMarkdown(source, first.pageCount - 1);
		expect(first.largeDocument).toBe(true);
		expect(first.html.length).toBeLessThan(300_100);
		expect(first.html).not.toContain("LAST_PAGE");
		expect(last.html).toContain("LAST_PAGE");
	});
	it("prevents tiny syntax tokens from expanding the preview DOM", async () => {
		const source = "*a* ".repeat(10_000);
		const { html, simplified } = await renderMarkdown(source);
		expect(simplified).toBe(true);
		expect(html).not.toContain("<em>");
		expect(html).toContain(source);
	});
	it("keeps oversized code readable without tokenizing it", async () => {
		const code = "const x = 1;\n".repeat(1_000);
		const { html } = await renderMarkdown("```js\n" + code + "```");
		expect(html).not.toContain("shiki-themes");
		expect(html).toContain(code);
	});
});
