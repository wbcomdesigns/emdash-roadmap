import { describe, expect, it } from "vitest";

import block from "../site-kit/blocks/plugin.ts?raw";
import page from "../site-kit/blocks/BoardBlock.astro?raw";
import manifest from "../emdash-plugin.jsonc?raw";

describe("in-text roadmap block", () => {
	it("shows the board for the current page, with no list and no server request", () => {
		expect(block).toContain('label: "Roadmap"');
		expect(block).toContain('label: "What to show"');
		expect(block).toContain('{ label: "The board", value: "board" }');
		expect(block).not.toContain("optionsRoute");
		expect(block).not.toContain("fetch(");
		expect(page).toContain("resolveEmDashPath");
		expect(page).toContain("replace(/\\/$/, \"\")");
		expect(page).toContain('id="roadmap"');
		expect(page).not.toContain("fetch(");
		expect(page).not.toContain("Astro.url.origin");
		expect(manifest).not.toContain("portableTextBlocks");
	});
});

describe("Block Kit check on every admin and panel answer", () => {
	it("refuses what EmDash refuses, so tests/site.ts catches it in every test", async () => {
		const { assertValidBlocks } = await import("./site");
		expect(() => assertValidBlocks("admin", { blocks: [{ type: "code", language: "text", code: "x" }] })).toThrow(/invalid Block Kit/);
		expect(() => assertValidBlocks("admin", { blocks: [{ type: "header", text: "Ideas" }] })).not.toThrow();
	});
});
