import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection } from "../site-kit/seed/collection.mjs";
import manifest from "../emdash-plugin.jsonc?raw";
import { stageKey } from "../src/content";
import plugin from "../src/plugin";
import { ITEM_ID_MAX } from "../src/vote";
import { ana, ben, member, openSite } from "./site";

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
	// Content hooks run without being awaited: let them end before the site goes away.
	await new Promise((resolve) => setTimeout(resolve, 200));
	await dispose?.();
	dispose = undefined;
});

type Site = Awaited<ReturnType<typeof openSite>>;
type Page = { blocks: Array<Record<string, unknown> & { type: string }>; toast?: { type: string; message: string } };

const editor = member("eddie", 40);
const author = member("auth", 30);
const contributor = member("cora", 20);
const subscriber = member("sub", 10);

async function openRoadmap(): Promise<Site> {
	const site = await openSite();
	dispose = site.dispose;
	await site.rt.fixtures.collection(roadmapCollection as never);
	await site.rt.fixtures.collection(changelogCollection as never);
	await site.rt.transport.invokeHook("plugin:install", {});
	return site;
}

async function item(site: Site, title: string, authorId?: string): Promise<string> {
	const made = await site.rt.fixtures.content("roadmap", {
		data: { title, description: "d", stage: "Under review" },
		slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		status: "published",
		...(authorId ? { authorId } : {}),
	} as never);
	return made.id;
}

/** `count` waiting ideas, oldest first: idea 0 is the oldest. */
async function waitingIdeas(site: Site, count: number, title = (i: number) => `Idea ${i}`): Promise<void> {
	for (let i = 0; i < count; i += 1) {
		await site.rt.fixtures.plugin.storage("ideas", `idea${String(i).padStart(4, "0")}`, {
			member_id: "",
			title: title(i),
			description: "d",
			status: "pending",
			rev: `r${i}`,
			createdAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
			visitor: "",
			guest: true,
			name: "Sam",
		});
	}
}

const adminCall = (site: Site, input: Record<string, unknown>) => site.call("admin", input) as Promise<Page>;
const titlesOn = (page: Page) =>
	((page.blocks.find((block) => block.type === "table") as { rows?: Array<{ title: string }> } | undefined)?.rows ?? []).map((row) => row.title);
const pagerButton = (page: Page, label: "Next" | "Previous") =>
	page.blocks
		.filter((block) => block.type === "actions")
		.flatMap((block) => (block as unknown as { elements: Array<{ label: string; action_id: string; value?: unknown }> }).elements)
		.find((element) => element.action_id === "ideas_page" && element.label === label);
const waitingStat = (page: Page) =>
	(page.blocks.find((block) => block.type === "stats") as unknown as { items: Array<{ label: string; value: string }> }).items.find(
		(stat) => stat.label === "Ideas waiting",
	)?.value;
const press = (site: Site, button: { value?: unknown }) => adminCall(site, { type: "block_action", action_id: "ideas_page", page: "/ideas", value: button.value });

describe("0.4.2 manifest and route permissions", () => {
	it("needs EmDash 1.2.0, opens the Stage panel to Authors and up, keeps the admin for site admins", () => {
		const routes = plugin.routes as Record<string, { permission?: string }>;
		expect(routes.editor_stage?.permission).toBe("content:edit_own");
		expect(routes.admin?.permission).toBe("plugins:manage");
		expect(manifest).toMatch(/"release":\s*\{\s*"requires":\s*\{\s*"env:emdash":\s*">=1\.2\.0"\s*\}/);
	});
});

describe("0.4.2 Stage panel for Editors and Authors", () => {
	it("lets an Editor move someone else's item", async () => {
		const site = await openRoadmap();
		const id = await item(site, "Theirs", author.id);
		const load = (await site.rt.admin.loadEditorPanel("stage", "roadmap", id, { user: editor } as never)) as Page;
		expect(JSON.stringify(load.blocks)).toContain("Move to Done");
		const moved = (await site.rt.admin.actEditorPanel("stage", "roadmap", id, "set_stage:done", { value: "done", user: editor } as never)) as Page;
		expect(moved.toast).toMatchObject({ type: "success", message: "Moved to Done." });
		expect((await site.rt.inspect.content.get("roadmap", id))?.data).toMatchObject({ stage: "Done" });
	});

	it("lets an Author move their own item", async () => {
		const site = await openRoadmap();
		const id = await item(site, "Mine", author.id);
		const load = (await site.rt.admin.loadEditorPanel("stage", "roadmap", id, { user: author } as never)) as Page;
		expect(JSON.stringify(load.blocks)).toContain("Move to Planned");
		const moved = (await site.rt.admin.actEditorPanel("stage", "roadmap", id, "set_stage:planned", { value: "planned", user: author } as never)) as Page;
		expect(moved.toast).toMatchObject({ type: "success" });
		expect((await site.rt.inspect.content.get("roadmap", id))?.data).toMatchObject({ stage: "Planned" });
	});

	it("refuses an Author on someone else's item, and Contributors and Subscribers on their own, without a change", async () => {
		const site = await openRoadmap();
		const theirs = await item(site, "Theirs", editor.id);
		const coras = await item(site, "Coras", contributor.id);
		const subs = await item(site, "Subs", subscriber.id);
		const tries: Array<[string, ReturnType<typeof member>]> = [
			[theirs, author],
			[coras, contributor],
			[subs, subscriber],
		];
		for (const [id, user] of tries) {
			await expect(site.rt.admin.loadEditorPanel("stage", "roadmap", id, { user } as never)).rejects.toThrow(/\(403\)/);
			await expect(site.rt.admin.actEditorPanel("stage", "roadmap", id, "set_stage:done", { value: "done", user } as never)).rejects.toThrow(/\(403\)/);
			expect((await site.rt.inspect.content.get("roadmap", id))?.data).toMatchObject({ stage: "Under review" });
		}
	});
});

describe("0.4.2 Ideas admin pages through every waiting idea", () => {
	it("shows 130 waiting ideas 25 at a time with Next and Previous, and counts all of them", async () => {
		const site = await openRoadmap();
		await waitingIdeas(site, 130);
		let page = await adminCall(site, { type: "page_load", page: "/ideas" });
		expect(waitingStat(page)).toBe("130");
		const first = titlesOn(page);
		expect(first).toHaveLength(25);
		expect(first[0]).toBe("Idea 129");
		expect(pagerButton(page, "Previous")).toBeUndefined();
		const seen = [...first];
		for (let step = 0; step < 10 && pagerButton(page, "Next"); step += 1) {
			page = await press(site, pagerButton(page, "Next")!);
			seen.push(...titlesOn(page));
		}
		expect(pagerButton(page, "Next")).toBeUndefined();
		expect(new Set(seen).size).toBe(130);
		expect(seen.at(-1)).toBe("Idea 0");
		// Previous walks back the same way.
		page = await press(site, pagerButton(page, "Previous")!);
		expect(titlesOn(page)[0]).toBe("Idea 29");
		page = await adminCall(site, { type: "page_load", page: "/ideas" });
		const second = await press(site, pagerButton(page, "Next")!);
		expect(titlesOn(await press(site, pagerButton(second, "Previous")!))).toEqual(first);
	});

	it("finds an idea older than the newest 100", async () => {
		const site = await openRoadmap();
		await waitingIdeas(site, 130, (i) => (i === 3 ? "Zebra crossing" : `Idea ${i}`));
		const found = await adminCall(site, { type: "form_submit", action_id: "ideas_find", page: "/ideas", values: { q: "zebra" } });
		expect(titlesOn(found)).toEqual([]);
		expect(JSON.stringify(found.blocks)).toContain("Next looks through older ones");
		const older = await press(site, pagerButton(found, "Next")!);
		expect(titlesOn(older)).toEqual(["Zebra crossing"]);
	});

	it("approves an idea from the second page", async () => {
		const site = await openRoadmap();
		await waitingIdeas(site, 40);
		const draft = await site.rt.fixtures.content("roadmap", { data: { title: "Idea 2", description: "d", stage: "Under review" }, slug: "idea-2" } as never);
		await site.rt.fixtures.plugin.storage("ideas", draft.id, {
			member_id: "", title: "Idea 2 draft", description: "d", status: "pending", rev: "rx", createdAt: "2026-09-01T00:00:00.000Z", visitor: "", guest: true, name: "Sam",
		});
		const second = await press(site, pagerButton(await adminCall(site, { type: "page_load", page: "/ideas" }), "Next")!);
		expect(titlesOn(second)).toContain("Idea 2 draft");
		const done = await adminCall(site, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: `approve|rx|${draft.id}` });
		expect(done.toast).toMatchObject({ type: "success" });
	});

	it("reviews a merge of a waiting idea that is not on the first page", async () => {
		const site = await openRoadmap();
		const keep = await item(site, "Keep me");
		await waitingIdeas(site, 40);
		const review = await adminCall(site, {
			type: "form_submit",
			action_id: "merge_review",
			page: "/ideas",
			values: { source: "idea|idea0001|r1", keep },
		});
		expect(review.toast).toBeUndefined();
		expect(JSON.stringify(review.blocks)).toContain("Merge Idea 1 into Keep me?");
	});

	it("starts again at the first page when a page value is not a real cursor", async () => {
		const site = await openRoadmap();
		await waitingIdeas(site, 30);
		const page = await adminCall(site, { type: "block_action", action_id: "ideas_page", page: "/ideas", value: { at: "not-a-cursor", back: [] } });
		expect(page.toast).toMatchObject({ type: "info" });
		expect(titlesOn(page)[0]).toBe("Idea 29");
	});
});

describe("0.4.2 a member's own ideas page past 50", () => {
	it("sends 50 ideas, then the rest from the cursor, and only the member's own", async () => {
		const site = await openRoadmap();
		for (let i = 0; i < 70; i += 1) {
			await site.rt.fixtures.plugin.storage("ideas", `ana${i}`, {
				member_id: ana.id, title: `Ana ${i}`, status: "pending", createdAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
			});
		}
		await site.rt.fixtures.plugin.storage("ideas", "ben0", { member_id: ben.id, title: "Ben's", status: "pending", createdAt: "2026-10-02T00:00:00.000Z" });
		type Mine = { ok: boolean; ideas: Array<{ title: string }>; ideasNext: string };
		const first = (await site.call("votes", {}, site.as(ana, "GET"))) as Mine;
		expect(first.ideas).toHaveLength(50);
		expect(first.ideas[0]?.title).toBe("Ana 69");
		expect(first.ideasNext).not.toBe("");
		const rest = (await site.call("votes", { ideas_after: first.ideasNext }, site.as(ana, "GET"))) as Mine;
		expect(rest).toMatchObject({ ok: true, ideasNext: "" });
		expect(rest.ideas).toHaveLength(20);
		const all = [...first.ideas, ...rest.ideas].map((idea) => idea.title);
		expect(new Set(all).size).toBe(70);
		expect(all).not.toContain("Ben's");
		expect(await site.call("votes", { ideas_after: "nope" }, site.as(ana, "GET"))).toMatchObject({ ok: false, error: { code: "INVALID" } });
	});
});

describe("0.4.2 vote item id length", () => {
	it("turns away an item id longer than the cap before touching storage", async () => {
		const site = await openRoadmap();
		const long = "x".repeat(ITEM_ID_MAX + 1);
		expect(await site.call("vote", { id: long }, site.as(ana))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await site.call("vote", { id: long }, site.as(ana, "DELETE"))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await site.rt.inspect.storage.list("votes")).toHaveLength(0);
		// An item id at the cap still gets an answer about the item itself.
		const id = await item(site, "Real");
		expect(await site.call("vote", { id }, site.as(ana))).toMatchObject({ ok: true, voted: true });
		expect(await site.call("vote", { id: "y".repeat(ITEM_ID_MAX) }, site.as(ana, "DELETE"))).toMatchObject({ ok: true, code: "NO_VOTE_TO_TAKE_BACK" });
	});
});

describe("0.4.2 the configured roadmap content type", () => {
	async function featuresSite(): Promise<Site> {
		const site = await openSite();
		dispose = site.dispose;
		await site.rt.fixtures.collection({ ...(roadmapCollection as Record<string, unknown>), slug: "features", label: "Features" } as never);
		await site.rt.fixtures.plugin.setting("collection", "features");
		await site.rt.transport.invokeHook("plugin:install", {});
		return site;
	}

	it("turns away a stale form on the configured type after a stage move", async () => {
		const site = await featuresSite();
		const made = await site.rt.fixtures.content("features", { data: { title: "F", description: "d", stage: "Done" }, slug: "f", status: "published" } as never);
		await site.rt.fixtures.plugin.kv(stageKey(made.id), { to: "Done", left: ["Under review"] });
		const save = (collection: string) =>
			site.rt.transport.invokeHook("content:beforeSave", { collection, isNew: false, id: made.id, content: { title: "F", stage: "Under review" } });
		expect(await save("features")).toMatchObject({ error: { code: "SAVE_REJECTED" } });
		expect(await save("roadmap")).toBeUndefined();
	});

	it("reports the configured type in health, and the Stage panel only works on it", async () => {
		const site = await featuresSite();
		expect(await site.call("health")).toMatchObject({ ok: true, collection: true });
		await site.rt.fixtures.collection(roadmapCollection as never);
		const other = await item(site, "In roadmap");
		const panel = (await site.rt.admin.loadEditorPanel("stage", "roadmap", other)) as Page;
		expect(JSON.stringify(panel.blocks)).toContain("This panel is for roadmap items");
	});
});

describe("0.4.2 no false changelog alert after an action", () => {
	it("keeps the changelog alert off after Approve, Reject and a merge when the type exists", async () => {
		const site = await openRoadmap();
		const keep = await item(site, "Keep me");
		const drop = await item(site, "Drop me");
		const ideas: string[] = [];
		for (const title of ["Approve me", "Reject me"]) {
			const draft = await site.rt.fixtures.content("roadmap", { data: { title, description: "d", stage: "Under review" }, slug: title.toLowerCase().replace(" ", "-") } as never);
			await site.rt.fixtures.plugin.storage("ideas", draft.id, {
				member_id: "", title, description: "d", status: "pending", rev: "r1", createdAt: "2026-10-01T00:00:00.000Z", visitor: "", guest: true, name: "Sam",
			});
			ideas.push(draft.id);
		}
		const alert = "Create the changelog content type";
		const approved = await adminCall(site, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: `approve|r1|${ideas[0]}` });
		expect(approved.toast).toMatchObject({ type: "success" });
		expect(JSON.stringify(approved.blocks)).not.toContain(alert);
		const rejected = await adminCall(site, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: `reject|r1|${ideas[1]}` });
		expect(rejected.toast).toMatchObject({ type: "info" });
		expect(JSON.stringify(rejected.blocks)).not.toContain(alert);
		const source = (await site.rt.inspect.content.get("roadmap", drop)) as { version?: number; updatedAt?: string };
		const merged = await adminCall(site, {
			type: "form_submit",
			action_id: "merge_items",
			page: "/ideas",
			values: { source: `item|${drop}|${source.version ?? ""}~${source.updatedAt ?? ""}`, keep },
		});
		expect(merged.toast).toMatchObject({ type: "success" });
		expect(JSON.stringify(merged.blocks)).not.toContain(alert);
	});

	it("still shows the changelog alert on a page load when that type is missing", async () => {
		const site = await openSite();
		dispose = site.dispose;
		await site.rt.fixtures.collection(roadmapCollection as never);
		await site.rt.transport.invokeHook("plugin:install", {});
		const page = (await site.call("admin", { type: "page_load", page: "/ideas" })) as Page;
		expect(JSON.stringify(page.blocks)).toContain("Create the changelog content type");
	});
});
