import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import ErrorPage from "./+error.svelte";

const state = vi.hoisted(() => ({ status: 404, error: { message: "private server details" } }));
vi.mock("$app/state", () => ({ page: state }));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));

describe("error pages", () => {
	it("offers a way back from missing routes", async () => {
		state.status = 404;
		await render(ErrorPage);
		await expect.element(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
		await expect.element(page.getByRole("link", { name: "Back to editor" })).toHaveAttribute("href", "/");
	});
	it("does not expose internal error messages", async () => {
		state.status = 500;
		const view = await render(ErrorPage);
		await expect.element(page.getByRole("heading", { name: "Unable to open this page" })).toBeVisible();
		expect(view.container.textContent).toContain("500");
		expect(view.container.textContent).not.toContain("private server details");
	});
});
