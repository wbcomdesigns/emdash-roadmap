import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection } from "../site-kit/seed/collection.mjs";
import { cellText } from "../src/admin";
import { openSite } from "./site";

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
	// Content hooks run without being awaited: let them end before the site goes away.
	await new Promise((resolve) => setTimeout(resolve, 200));
	await dispose?.();
	dispose = undefined;
});

type Site = Awaited<ReturnType<typeof openSite>>;
type Block = Record<string, unknown> & { type: string };
type Page = { blocks: Block[]; toast?: { type: string; message: string } };
type Menu = { type: "menu"; label: string; items: Array<{ label: string; value: string }> };
type Row = { title: { type: string; label: string; target: Record<string, unknown> }; description: string; from: string; action: Menu };

async function openRoadmap(): Promise<Site> {
	const site = await openSite();
	dispose = site.dispose;
	await site.rt.fixtures.collection(roadmapCollection as never);
	await site.rt.fixtures.collection(changelogCollection as never);
	await site.rt.transport.invokeHook("plugin:install", {});
	return site;
}

async function idea(site: Site, i: number, title: string, description = "d"): Promise<string> {
	const id = `idea${String(i).padStart(4, "0")}`;
	await site.rt.fixtures.plugin.storage("ideas", id, {
		member_id: "",
		title,
		description,
		status: "pending",
		rev: `r${i}`,
		createdAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
		visitor: "",
		guest: true,
		name: "Sam",
	});
	return id;
}

const adminCall = (site: Site, input: Record<string, unknown>) => site.call("admin", input) as Promise<Page>;
const table = (page: Page) => page.blocks.find((block) => block.type === "table") as unknown as { columns: Array<{ key: string }>; rows: Row[] } | undefined;
const titles = (page: Page) => (table(page)?.rows ?? []).map((row) => row.title.label);
const allButtons = (blocks: Block[]): Array<{ label: string; action_id: string; value?: unknown }> =>
	blocks.flatMap((block) => [
		...(block.type === "actions" ? (block.elements as Array<{ label: string; action_id: string; value?: unknown }>) : []),
		...(Array.isArray(block.blocks) ? allButtons(block.blocks as Block[]) : []),
	]);

describe("0.4.3 Ideas table fits the screen (#76) and names each menu (#80)", () => {
	it("cuts long words and long text with an ellipsis", () => {
		expect(cellText("short text", 100)).toBe("short text");
		const url = `https://example.com/${"a".repeat(120)}`;
		expect(cellText(`See ${url} now`, 100)).toBe(`See ${url.slice(0, 29)}… now`);
		const long = cellText("word ".repeat(100), 60);
		expect(long.length).toBe(60);
		expect(long.endsWith("…")).toBe(true);
	});

	it("keeps every cell short, puts Decision first, and names the idea on its Decide menu", async () => {
		const site = await openRoadmap();
		const word = "x".repeat(4000);
		const id = await idea(site, 1, `Calendar ${"y".repeat(200)}`, word);
		const page = await adminCall(site, { type: "page_load", page: "/ideas" });
		const shown = table(page);
		expect(shown?.columns.map((column) => column.key)).toEqual(["action", "title", "description", "from"]);
		const row = shown!.rows[0]!;
		expect(row.description.length).toBeLessThanOrEqual(100);
		expect(row.title.label.length).toBeLessThanOrEqual(60);
		for (const text of [row.description, row.title.label, row.action.label]) {
			for (const part of text.split(" ")) expect(part.length).toBeLessThanOrEqual(30);
		}
		// The title opens the full idea in the editor.
		expect(row.title).toMatchObject({ type: "link", target: { kind: "content", collection: "roadmap", id } });
		expect(row.action.label).toBe(`Decide: ${cellText(`Calendar ${"y".repeat(200)}`, 24)}`);
		expect(row.action.label.startsWith("Decide: Calendar ")).toBe(true);
	});
});

describe("0.4.3 a decision keeps the page (#71)", () => {
	it("redraws the page the owner decided on, not the first", async () => {
		const site = await openRoadmap();
		for (let i = 0; i < 30; i += 1) await idea(site, i, `Idea ${i}`);
		const first = await adminCall(site, { type: "page_load", page: "/ideas" });
		const next = allButtons(first.blocks).find((button) => button.action_id === "ideas_page" && button.label === "Next")!;
		const second = await adminCall(site, { type: "block_action", action_id: "ideas_page", page: "/ideas", value: next.value });
		expect(titles(second)).toEqual(["Idea 4", "Idea 3", "Idea 2", "Idea 1", "Idea 0"]);
		const reject = table(second)!.rows.find((row) => row.title.label === "Idea 3")!.action.items.find((item) => item.label === "Reject")!;
		const after = await adminCall(site, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: reject.value });
		expect(after.toast?.message).toBe("Idea rejected. It stays a draft.");
		expect(titles(after)).toEqual(["Idea 4", "Idea 2", "Idea 1", "Idea 0"]);
		// Previous still leads back to the first page.
		const previous = allButtons(after.blocks).find((button) => button.action_id === "ideas_page" && button.label === "Previous");
		expect(previous).toBeDefined();
		const back = await adminCall(site, { type: "block_action", action_id: "ideas_page", page: "/ideas", value: previous!.value });
		expect(titles(back)[0]).toBe("Idea 29");
	});

	it("still takes a decision value from a screen drawn before the update", async () => {
		const site = await openRoadmap();
		const id = await idea(site, 1, "Old screen");
		const after = await adminCall(site, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: `reject|r1|${id}` });
		expect(after.toast?.message).toBe("Idea rejected. It stays a draft.");
	});
});

describe("0.4.3 a stage with items offers no Remove (#77)", () => {
	it("shows Remove only on an empty stage, and says what to do on the others", async () => {
		const site = await openRoadmap();
		await site.rt.fixtures.content("roadmap", {
			data: { title: "Busy", description: "d", stage: "Planned" },
			slug: "busy",
			status: "published",
		} as never);
		const page = await adminCall(site, { type: "page_load", page: "/settings" });
		// Stage forms sit inside the Settings tabs: read every action id on the page.
		const removes = [...JSON.stringify(page.blocks).matchAll(/"action_id":"(stage_remove:[^"]+)"/g)].map((found) => found[1]);
		expect(removes).not.toContain("stage_remove:planned");
		expect(removes).toEqual(["stage_remove:under-review", "stage_remove:in-progress", "stage_remove:done"]);
		expect(JSON.stringify(page.blocks)).toContain("1 item is in this stage. Move it to another stage to remove this one.");
	});
});

describe("0.4.3 merge progress sits by the merge button (#78)", () => {
	it("opens Merge a duplicate with the step and Continue, needs at most four Continues for two votes, and says it finished", async () => {
		const site = await openRoadmap();
		const make = async (title: string) =>
			(
				await site.rt.fixtures.content("roadmap", {
					data: { title, description: "d", stage: "Under review" },
					slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
					status: "published",
				} as never)
			).id;
		const drop = await make("Drop me");
		const keep = await make("Keep me");
		for (const who of ["ana", "ben"]) {
			await site.rt.fixtures.plugin.storage("votes", `${drop}:${who}`, { item: drop, member_id: who, createdAt: "2026-10-01T00:00:00.000Z", visitor: "" });
		}
		const loaded = JSON.stringify((await adminCall(site, { type: "page_load", page: "/ideas" })).blocks);
		const source = loaded.match(new RegExp(`"value":"(item\\|${drop}\\|[^"]*)"`))![1]!;
		const started = await adminCall(site, { type: "form_submit", action_id: "merge_items", page: "/ideas", values: { source, keep } });
		const panel = started.blocks.find((block) => block.type === "accordion") as unknown as { default_open: boolean; blocks: Block[] };
		expect(panel.default_open).toBe(true);
		expect(JSON.stringify(panel.blocks)).toContain("Merging Drop me into Keep me");
		expect(allButtons(panel.blocks).map((button) => button.action_id)).toContain("bg_continue");
		// At the top only a pointer, no second Continue.
		const top = started.blocks.filter((block) => block.type !== "accordion");
		expect(allButtons(top).map((button) => button.action_id)).not.toContain("bg_continue");
		let presses = 0;
		let page: Page = started;
		while (JSON.stringify(page.blocks).includes("Merging ") && presses < 10) {
			presses += 1;
			page = await adminCall(site, { type: "block_action", action_id: "bg_continue", page: "/ideas" });
		}
		// Unpublish, the votes (straight on to the count), the count, the close: 0.4.2 needed five.
		expect(presses).toBeLessThanOrEqual(4);
		expect(page.toast).toEqual({ type: "success", message: "Merge finished. The kept item has the votes." });
		const board = (await site.call("board")) as { columns: Array<{ items: Array<{ id: string; votes: number }> }> };
		expect(board.columns.flatMap((column) => column.items).find((row) => row.id === keep)?.votes).toBe(2);
	});
});
