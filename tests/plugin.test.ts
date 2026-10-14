import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection, roadmapTaxonomies } from "../site-kit/seed/collection.mjs";
import { ana, ben, openSite } from "./site";

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
	await dispose?.();
	dispose = undefined;
});

async function openRoadmap() {
	const site = await openSite();
	dispose = site.dispose;
	await site.rt.fixtures.collection(roadmapCollection as never);
	await site.rt.fixtures.collection(changelogCollection as never);
	return site;
}

async function addItem(
	rt: Awaited<ReturnType<typeof openSite>>["rt"],
	title: string,
	stage = "Under review",
) {
	return rt.fixtures.content("roadmap", {
		data: { title, description: `${title} description`, stage },
		slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		status: "published",
	} as never);
}

function admin(
	call: Awaited<ReturnType<typeof openSite>>["call"],
	input: Record<string, unknown>,
) {
	return call("admin", input) as Promise<{
		blocks: Array<Record<string, unknown> & { type: string }>;
		toast?: { type: string; message: string };
	}>;
}

function textOf(page: { blocks: unknown }): string {
	return JSON.stringify(page.blocks);
}

describe("health and collections", () => {
	it("reports missing collections on an empty site", async () => {
		const site = await openSite();
		dispose = site.dispose;
		expect(await site.call("health")).toMatchObject({
			ok: true,
			plugin: "roadmap",
			collection: false,
			changelog: false,
		});
	});

	it("reports both collections once they exist and shows them on Ideas", async () => {
		const site = await openRoadmap();
		expect(await site.call("health")).toMatchObject({
			ok: true,
			collection: true,
			changelog: true,
		});
		const page = await site.rt.admin.loadPage("/ideas");
		const text = textOf(page);
		expect(text).toContain("Roadmap collection");
		expect(text).toContain("Changelog collection");
		expect(text).toContain("Ready");
		expect(page.blocks.map((block) => block.type)).toContain("empty");
	});
});

describe("stages", () => {
	it("starts with the four default stages and keeps items when a stage is renamed", async () => {
		const site = await openRoadmap();
		await addItem(site.rt, "Dark board", "Planned");
		const before = await admin(site.call, { type: "page_load", page: "/settings" });
		expect(textOf(before)).toContain("Under review");
		expect(textOf(before)).toContain("Planned");
		expect(textOf(before)).toContain("1 item is in this stage.");

		const renamed = await admin(site.call, {
			type: "form_submit",
			action_id: "save_stage:planned",
			page: "/settings",
			values: { name: "Coming up", shown: true },
		});
		expect(renamed.toast?.type).toBe("success");
		expect(textOf(renamed)).toContain("Coming up");
		expect(textOf(renamed)).toContain("1 item is in this stage.");
		expect(textOf(renamed)).not.toContain('"initial_value":"Planned"');
	});

	it("adds a hidden stage, moves an item there, and refuses to remove a stage that still has items", { timeout: 15000 }, async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Skip this one", "Under review");

		const added = await admin(site.call, {
			type: "form_submit",
			action_id: "add_stage",
			page: "/settings",
			values: { name: "Declined", shown: false },
		});
		expect(added.toast?.type).toBe("success");
		expect(textOf(added)).toContain("Declined");
		expect(textOf(added)).toContain("Hidden from the board");

		const declined = added.blocks
			.filter((block) => block.type === "form" && String(block.block_id).startsWith("stage_"))
			.map((block) => String(block.block_id).slice("stage_".length))
			.find((id) => !["under-review", "planned", "in-progress", "done"].includes(id));
		expect(declined).toBeTruthy();

		const moved = await admin(site.call, {
			type: "form_submit",
			action_id: "move_item",
			page: "/settings",
			values: { item: item.id, stage: declined },
		});
		expect(moved.toast?.type).toBe("success");
		expect(textOf(moved)).toMatch(/1 item is in this stage/);

		const refused = await admin(site.call, {
			type: "block_action",
			action_id: `stage_remove:${declined}`,
			page: "/settings",
		});
		expect(refused.toast?.type).toBe("error");
		expect(refused.toast?.message).toMatch(/1 item/);
	});

	it("reorders stages and removes an empty one", async () => {
		const site = await openRoadmap();
		await admin(site.call, {
			type: "form_submit",
			action_id: "add_stage",
			page: "/settings",
			values: { name: "Later", shown: true },
		});
		const up = await admin(site.call, {
			type: "block_action",
			action_id: "stage_up:later",
			page: "/settings",
		});
		expect(up.toast?.type).toBe("success");
		const removed = await admin(site.call, {
			type: "block_action",
			action_id: "stage_remove:later",
			page: "/settings",
		});
		expect(removed.toast?.type).toBe("success");
		expect(textOf(removed)).not.toContain('"text":"Later"');
	});
});

describe("settings, dashboard card and hourly email", () => {
	it("saves who can take part and email settings, and they survive reload", async () => {
		const site = await openRoadmap();
		const saved = await admin(site.call, {
			type: "form_submit",
			action_id: "save_who",
			page: "/settings",
			values: { allow_ideas: false, who: "members" },
		});
		expect(saved.toast?.type).toBe("success");
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: false, notify_to: "owner@example.com" },
		});
		const again = textOf(await site.rt.admin.loadPage("/settings"));
		expect(again).toContain('"action_id":"allow_ideas"');
		expect(again).toContain('"initial_value":false');
		expect(again).toContain('"initial_value":"members"');
		expect(again).toContain('"initial_value":"owner@example.com"');
	});

	it("refuses a bad notify address and leaves the saved one in place", async () => {
		const site = await openRoadmap();
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: true, notify_to: "owner@example.com" },
		});
		const refused = await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: true, notify_to: "not-an-email" },
		});
		expect(refused.toast?.type).toBe("error");
		expect(textOf(refused)).toContain("owner@example.com");
	});

	it("shows waiting ideas on the dashboard card", async () => {
		const site = await openRoadmap();
		await site.rt.fixtures.plugin.storage("ideas", "idea-1", {
			title: "A guest idea",
			status: "pending",
			member_id: "",
			name: "Sam",
			rev: "r1",
			createdAt: "2026-10-13T00:00:00.000Z",
		});
		const card = textOf(await admin(site.call, { type: "page_load", widget: "waiting" }));
		expect(card).toContain("Ideas waiting");
		expect(card).toContain('"value":1');
		expect(card).toContain("plugin-page");
	});

	it("sends one hourly email for many waiting ideas, and none when the switch is off", async () => {
		const site = await openRoadmap();
		const tick = () =>
			site.rt.transport.invokeHook("cron", { name: "notify", scheduledAt: new Date().toISOString() });
		for (let i = 0; i < 20; i += 1) {
			await site.rt.fixtures.plugin.storage("ideas", `idea-${i}`, {
				title: `Idea ${i}`,
				status: "pending",
				member_id: ana.id,
				rev: `r${i}`,
				createdAt: "2026-10-13T00:00:00.000Z",
			});
		}

		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: true, notify_to: "owner@example.com" },
		});
		await tick();
		await tick();
		const mail = await site.rt.inspect.email();
		expect(mail).toHaveLength(1);
		expect(mail[0].to).toBe("owner@example.com");
		expect(mail[0].text).not.toMatch(/Idea |Sam|http/i);

		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: false, notify_to: "owner@example.com" },
		});
		await site.rt.fixtures.plugin.kv("notify:last", "0");
		await tick();
		expect(await site.rt.inspect.email()).toHaveLength(1);
	});
});

describe("board route", () => {
	type Board = {
		ok: true;
		sort: string;
		columns: Array<{ name: string; items: Array<{ id: string; title: string; votes: number }>; empty: string | null }>;
	};

	it("groups published items, skips drafts, and marks empty columns", async () => {
		const site = await openRoadmap();
		await addItem(site.rt, "Live idea", "Planned");
		await site.rt.fixtures.content("roadmap", {
			data: { title: "Secret draft", description: "no", stage: "Planned" },
			slug: "secret-draft",
			status: "draft",
		} as never);
		const board = (await site.call("board")) as Board;
		expect(board.sort).toBe("votes");
		expect(board.columns.map((column) => column.name)).toEqual([
			"Under review",
			"Planned",
			"In progress",
			"Done",
		]);
		const planned = board.columns.find((column) => column.name === "Planned");
		expect(planned?.items.map((item) => item.title)).toEqual(["Live idea"]);
		expect(planned?.empty).toBeNull();
		expect(board.columns.find((column) => column.name === "Done")?.empty).toBe("COLUMN_EMPTY");
		expect(JSON.stringify(board)).not.toContain("Secret draft");
	});

	it("shows an item with a mistyped stage in the first column instead of losing it", async () => {
		const site = await openRoadmap();
		await addItem(site.rt, "Typo idea", "Plannned");
		await addItem(site.rt, "Right idea", "Planned");
		const board = (await site.call("board")) as Board;
		expect(board.columns[0]?.items.map((item) => item.title)).toEqual(["Typo idea"]);
		expect(board.columns.find((column) => column.name === "Planned")?.items.map((item) => item.title)).toEqual(["Right idea"]);
	});

	it("sorts by votes or newest, and hides a hidden stage", async () => {
		const site = await openRoadmap();
		const old = await addItem(site.rt, "Old idea", "Under review");
		const hot = await addItem(site.rt, "Hot idea", "Under review");
		await site.rt.fixtures.plugin.storage("tallies", hot.id, { votes: 5 });
		await site.rt.fixtures.plugin.storage("tallies", old.id, { votes: 1 });

		const byVotes = (await site.call("board", { sort: "votes" })) as Board;
		expect(byVotes.columns[0]?.items.map((item) => item.title)).toEqual(["Hot idea", "Old idea"]);
		expect(byVotes.columns[0]?.items[0]?.votes).toBe(5);

		const byNew = (await site.call("board", { sort: "newest" })) as Board;
		expect(byNew.columns[0]?.items.map((item) => item.title)).toEqual(["Hot idea", "Old idea"]);

		await admin(site.call, {
			type: "form_submit",
			action_id: "add_stage",
			page: "/settings",
			values: { name: "Declined", shown: false },
		});
		await admin(site.call, {
			type: "form_submit",
			action_id: "move_item",
			page: "/settings",
			values: { item: old.id, stage: "declined" },
		});
		const after = (await site.call("board")) as Board;
		expect(after.columns.map((column) => column.name)).not.toContain("Declined");
		expect(JSON.stringify(after)).not.toContain("Old idea");
	});

	it("category filter hides items that have no matching term", async () => {
		const site = await openRoadmap();
		await addItem(site.rt, "Unsorted idea", "Planned");
		const board = (await site.call("board", { category: "core" })) as Board;
		expect(board.columns.flatMap((column) => column.items)).toEqual([]);
		expect(board.columns.every((column) => column.empty === "COLUMN_EMPTY")).toBe(true);
	});
});

describe("voting", () => {
	type VoteOk = { ok: true; votes: number; voted: boolean };
	type VoteErr = { ok: false; error: { code: string } };
	type Mine = { ok: true; ids: string[] };

	it("refuses a guest on vote and votes", async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Needs a vote");
		expect(await site.call("vote", { id: item.id }, site.asGuest)).toMatchObject({
			ok: false,
			error: { code: "SIGN_IN_REQUIRED" },
		});
		expect(await site.call("votes", {}, { method: "GET" })).toMatchObject({
			ok: false,
			error: { code: "SIGN_IN_REQUIRED" },
		});
	});

	it("casts one vote per member, takes it back, and recounts with storage.count", async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Dark board");
		const first = (await site.call("vote", { id: item.id }, site.as(ana))) as VoteOk;
		expect(first).toEqual({ ok: true, votes: 1, voted: true });
		const again = (await site.call("vote", { id: item.id }, site.as(ana))) as VoteOk;
		expect(again).toEqual({ ok: true, votes: 1, voted: true });
		const mine = (await site.call("votes", {}, site.as(ana, "GET"))) as Mine;
		expect(mine.ids).toEqual([item.id]);

		const back = (await site.call("vote", { id: item.id }, site.as(ana, "DELETE"))) as VoteOk;
		expect(back).toEqual({ ok: true, votes: 0, voted: false });
		expect(await site.call("votes", {}, site.as(ana, "GET"))).toEqual({ ok: true, ids: [] });
		expect(await site.rt.inspect.storage.get("tallies", item.id)).toMatchObject({ votes: 0 });
	});

	it("ignores a member id sent in the request", async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Shared idea");
		await site.call("vote", { id: item.id, member_id: ben.id }, site.as(ana));
		const anaVotes = (await site.call("votes", { member_id: ben.id }, site.as(ana, "GET"))) as Mine;
		const benVotes = (await site.call("votes", { member_id: ana.id }, site.as(ben, "GET"))) as Mine;
		expect(anaVotes.ids).toEqual([item.id]);
		expect(benVotes.ids).toEqual([]);
	});

	it("refuses a draft or a missing item, and keeps the tally equal to the vote count", async () => {
		const site = await openRoadmap();
		const live = await addItem(site.rt, "Live idea");
		const draft = await site.rt.fixtures.content("roadmap", {
			data: { title: "Secret draft", description: "no", stage: "Planned" },
			slug: "secret-draft",
			status: "draft",
		} as never);
		const missing = (await site.call("vote", { id: "no-such-item" }, site.as(ana))) as VoteErr;
		const hidden = (await site.call("vote", { id: draft.id }, site.as(ana))) as VoteErr;
		expect(missing.error.code).toBe("NOT_FOUND");
		expect(hidden.error.code).toBe("NOT_FOUND");

		await site.call("vote", { id: live.id }, site.as(ana));
		await site.call("vote", { id: live.id }, site.as(ben));
		const board = (await site.call("board")) as {
			columns: Array<{ items: Array<{ id: string; votes: number }> }>;
		};
		const card = board.columns.flatMap((column) => column.items).find((item) => item.id === live.id);
		expect(card?.votes).toBe(2);
	});

	it("refuses a ninth vote in an hour", async () => {
		const site = await openRoadmap();
		const items = [];
		for (let i = 0; i < 9; i += 1) items.push(await addItem(site.rt, `Rate ${i}`));
		for (let i = 0; i < 8; i += 1) {
			expect(await site.call("vote", { id: items[i]?.id }, site.as(ana))).toMatchObject({ ok: true });
		}
		expect(await site.call("vote", { id: items[8]?.id }, site.as(ana))).toMatchObject({
			ok: false,
			error: { code: "RATE_LIMITED" },
		});
	});
});

describe("suggest and ideas queue", () => {
	type Board = { columns: Array<{ name: string; items: Array<{ title: string }> }> };

	it("creates a draft that stays off the board, then publishes it on approve", async () => {
		const site = await openRoadmap();
		const sent = (await site.call(
			"suggest",
			{ title: "Dark <b>mode</b> for comments", description: "Show <em>plain</em> text." },
			site.as(ana),
		)) as { ok: true; id: string };
		expect(sent.ok).toBe(true);
		expect(JSON.stringify(await site.call("board"))).not.toContain("Dark mode for comments");
		const draft = await site.rt.inspect.content.get("roadmap", sent.id);
		expect(draft?.status).not.toBe("published");

		const page = await admin(site.call, { type: "page_load", page: "/ideas" });
		expect(textOf(page)).toContain("Dark mode for comments");
		expect(textOf(page)).toContain("Show plain text.");
		expect(textOf(page)).toContain("ana");

		const idea = await site.rt.inspect.storage.get<{ rev: string }>("ideas", sent.id);
		const approved = await admin(site.call, {
			type: "block_action",
			action_id: "idea_mod",
			page: "/ideas",
			value: `approve|${idea?.rev}|${sent.id}`,
		});
		expect(approved.toast?.type).toBe("success");
		const board = (await site.call("board")) as Board;
		expect(board.columns[0]?.items.map((item) => item.title)).toContain("Dark mode for comments");
	});

	it("approve publishes the draft's current text, not the stored idea text", async () => {
		const site = await openRoadmap();
		const draft = await site.rt.fixtures.content("roadmap", {
			data: { title: "Export monthly reports as CSV", description: "Download the monthly report.", stage: "" },
			slug: "export-monthly-reports",
			status: "draft",
		} as never);
		await site.rt.fixtures.plugin.storage("ideas", draft.id, {
			title: "Export reports as CSV",
			description: "let me download the montly report",
			status: "pending",
			rev: "r-edit",
			name: "Priya",
			createdAt: "2026-10-14T00:00:00.000Z",
		});
		const approved = await admin(site.call, {
			type: "block_action",
			action_id: "idea_mod",
			page: "/ideas",
			value: `approve|r-edit|${draft.id}`,
		});
		expect(approved.toast?.type).toBe("success");
		const live = await site.rt.inspect.content.get("roadmap", draft.id);
		expect(JSON.stringify(live)).toContain("Export monthly reports as CSV");
		expect(JSON.stringify(live)).not.toContain("montly");
	});

	it("an idea whose draft the owner published from the editor leaves the queue", async () => {
		const site = await openRoadmap();
		const item = await site.rt.fixtures.content("roadmap", {
			data: { title: "Weekly digest email", description: "A summary every Monday.", stage: "Planned" },
			slug: "weekly-digest-email",
			status: "published",
		} as never);
		await site.rt.fixtures.plugin.storage("ideas", item.id, {
			title: "weekly digest",
			description: "",
			status: "pending",
			rev: "r-pub",
			name: "Ana",
			createdAt: "2026-10-14T00:00:00.000Z",
		});
		const page = await admin(site.call, { type: "page_load", page: "/ideas" });
		expect(textOf(page)).not.toContain("weekly digest (waiting)");
		expect(await site.rt.inspect.storage.get<{ status: string }>("ideas", item.id)).toMatchObject({ status: "approved" });
	});

	it("refuses ideas when they are off, a ninth suggest, and a stale approve", async () => {
		const site = await openRoadmap();
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_who",
			page: "/settings",
			values: { allow_ideas: false, who: "anyone" },
		});
		expect(await site.call("suggest", { title: "Closed" }, site.as(ana))).toMatchObject({
			ok: false,
			error: { code: "IDEAS_CLOSED" },
		});
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_who",
			page: "/settings",
			values: { allow_ideas: true, who: "anyone" },
		});
		for (let i = 0; i < 8; i += 1) {
			expect(await site.call("suggest", { title: `Cap ${i}` }, site.as(ben))).toMatchObject({ ok: true });
		}
		expect(await site.call("suggest", { title: "Cap 8" }, site.as(ben))).toMatchObject({
			ok: false,
			error: { code: "RATE_LIMITED" },
		});

		const sent = (await site.call("suggest", { title: "Stale one" }, site.as(ana))) as { ok: true; id: string };
		const idea = await site.rt.inspect.storage.get<Record<string, unknown>>("ideas", sent.id);
		await site.rt.fixtures.plugin.storage("ideas", sent.id, { ...(idea || {}), rev: "rewritten" });
		const refused = await admin(site.call, {
			type: "block_action",
			action_id: "idea_mod",
			page: "/ideas",
			value: `approve|${String(idea?.rev || "")}|${sent.id}`,
		});
		expect(refused.toast?.type).toBe("error");
		expect(refused.toast?.message).toMatch(/changed after this page loaded/);
	});

	it("rejects a waiting idea and leaves it unpublished", async () => {
		const site = await openRoadmap();
		const sent = (await site.call("suggest", { title: "Skip this" }, site.as(ana))) as { ok: true; id: string };
		const idea = await site.rt.inspect.storage.get<{ rev: string }>("ideas", sent.id);
		const rejected = await admin(site.call, {
			type: "block_action",
			action_id: "idea_mod",
			page: "/ideas",
			value: `reject|${idea?.rev}|${sent.id}`,
		});
		expect(rejected.toast?.type).toBe("info");
		expect(JSON.stringify(await site.call("board"))).not.toContain("Skip this");
		expect((await site.rt.inspect.content.get("roadmap", sent.id))?.status).not.toBe("published");
	});
});

describe("guest participation", () => {
	const visitor = "a".repeat(32);
	const guest = { method: "POST" as const };

	it("lets a guest vote and take it back, and never stores an IP", async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Guest vote item");
		const first = await site.call("vote_guest", { id: item.id, visitor }, guest);
		expect(first).toMatchObject({ ok: true, votes: 1, voted: true });
		const rows = await site.rt.inspect.storage.list<{ visitor: string; member_id: string }>("votes");
		expect(rows[0]?.data.visitor).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(rows)).not.toMatch(/1\.2\.3\.4|visitor-ip/);
		const back = await site.call("vote_guest", { id: item.id, visitor }, { method: "DELETE" });
		expect(back).toMatchObject({ ok: true, votes: 0, voted: false });
	});

	it("refuses members-only, a honeypot, and a missing visitor", async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Closed vote");
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_who",
			page: "/settings",
			values: { allow_ideas: true, who: "members" },
		});
		expect(await site.call("vote_guest", { id: item.id, visitor }, guest)).toMatchObject({
			ok: false,
			error: { code: "MEMBERS_ONLY" },
		});
		expect(await site.call("suggest_guest", { title: "Nope", name: "Sam", visitor }, guest)).toMatchObject({
			ok: false,
			error: { code: "MEMBERS_ONLY" },
		});
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_who",
			page: "/settings",
			values: { allow_ideas: true, who: "anyone" },
		});
		expect(
			await site.call("vote_guest", { id: item.id, visitor, website: "https://spam.example" }, guest),
		).toMatchObject({ ok: false, error: { code: "SPAM" } });
		expect(await site.call("vote_guest", { id: item.id }, guest)).toMatchObject({
			ok: false,
			error: { code: "NO_VISITOR" },
		});
	});

	it("takes a guest idea with a name and marks it as from a guest", async () => {
		const site = await openRoadmap();
		const sent = (await site.call(
			"suggest_guest",
			{ title: "From the door", description: "Please", name: "Sam", visitor },
			guest,
		)) as { ok: true; id: string };
		expect(sent.ok).toBe(true);
		const page = textOf(await admin(site.call, { type: "page_load", page: "/ideas" }));
		expect(page).toContain("From the door");
		expect(page).toContain("Sam (guest)");
	});
});

describe("merge", () => {
	it("asks the owner to choose items and names both before merging", async () => {
		const site = await openRoadmap();
		const keep = await addItem(site.rt, "Keep this");
		const drop = await addItem(site.rt, "Drop this");
		const page = textOf(await admin(site.call, { type: "page_load", page: "/ideas" }));
		expect(page).toContain("Choose an item");
		expect(page).toContain("Review merge");
		const blank = await admin(site.call, {
			type: "form_submit",
			action_id: "merge_review",
			page: "/ideas",
			values: { source: "", keep: "" },
		});
		expect(blank.toast?.type).toBe("error");
		const preview = await admin(site.call, {
			type: "form_submit",
			action_id: "merge_review",
			page: "/ideas",
			values: { source: `item:${drop.id}`, keep: keep.id },
		});
		expect(textOf(preview)).toContain("Merge Drop this into Keep this?");
		expect(textOf(preview)).toContain("Merge these two");
	});

	it("moves votes once per person and refuses merging an item into itself", async () => {
		const site = await openRoadmap();
		const keep = await addItem(site.rt, "Keep this");
		const drop = await addItem(site.rt, "Drop this");
		await site.call("vote", { id: keep.id }, site.as(ana));
		await site.call("vote", { id: keep.id }, site.as(ben));
		await site.rt.fixtures.plugin.storage("votes", `${keep.id}:cara`, {
			item: keep.id,
			member_id: "cara",
			createdAt: "2026-10-01T00:00:00.000Z",
			visitor: "",
		});
		await site.rt.fixtures.plugin.storage("votes", `${keep.id}:drew`, {
			item: keep.id,
			member_id: "drew",
			createdAt: "2026-10-01T00:00:00.000Z",
			visitor: "",
		});
		await site.rt.fixtures.plugin.storage("votes", `${keep.id}:erin`, {
			item: keep.id,
			member_id: "erin",
			createdAt: "2026-10-01T00:00:00.000Z",
			visitor: "",
		});
		await site.call("vote", { id: drop.id }, site.as(ana));
		await site.rt.fixtures.plugin.storage("votes", `${drop.id}:finn`, {
			item: drop.id,
			member_id: "finn",
			createdAt: "2026-10-01T00:00:00.000Z",
			visitor: "",
		});
		await site.rt.fixtures.plugin.storage("votes", `${drop.id}:gabe`, {
			item: drop.id,
			member_id: "gabe",
			createdAt: "2026-10-01T00:00:00.000Z",
			visitor: "",
		});
		const merged = await admin(site.call, {
			type: "form_submit",
			action_id: "merge_items",
			page: "/ideas",
			values: { source: `item:${drop.id}`, keep: keep.id },
		});
		expect(merged.toast?.type).toBe("success");
		const board = (await site.call("board")) as {
			columns: Array<{ items: Array<{ id: string; votes: number; title: string }> }>;
		};
		const kept = board.columns.flatMap((column) => column.items).find((item) => item.id === keep.id);
		expect(kept?.votes).toBe(7);
		expect(JSON.stringify(board)).not.toContain("Drop this");
		const self = await admin(site.call, {
			type: "form_submit",
			action_id: "merge_items",
			page: "/ideas",
			values: { source: `item:${keep.id}`, keep: keep.id },
		});
		expect(self.toast?.type).toBe("error");
	});
});

describe("0.1.1 owner findings", () => {
	it("computes the registry plugin id used on a real site", async () => {
		const { registryPluginId } = await import("../site-kit/lib/wbcom-kit");
		expect(await registryPluginId("roadmap")).toBe("r_76xywti6l5cbxzos");
	});

	it("puts the vote count in the button name", async () => {
		const { voteAriaLabel } = await import("../site-kit/lib/roadmap-vote");
		expect(voteAriaLabel(false, "Filter by category", 3)).toBe("Vote: Filter by category, 3 votes");
		expect(voteAriaLabel(true, "Filter by category", 1)).toBe("Voted: Filter by category, 1 vote");
	});

	it("keeps owner wording off the Settings page and names the taxonomy", async () => {
		const site = await openRoadmap();
		const page = textOf(await admin(site.call, { type: "page_load", page: "/settings" }));
		expect(page).not.toContain("collection name stays internal");
		expect(page).not.toContain("set Stage to the stage name");
		expect(page).toContain("pick the stage from the Stage panel");
		expect(roadmapTaxonomies[0]?.label).toBe("Roadmap categories");
	});

	it("offers stages as a choice on the item editor and moves the item", async () => {
		const site = await openRoadmap();
		expect(site.rt.manifest.admin?.editorPanels).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: "stage", title: "Stage", route: "editor_stage" })]),
		);
		const item = await addItem(site.rt, "Dark board", "Planned");
		const panel = await site.rt.admin.loadEditorPanel("stage", "roadmap", item.id);
		expect(textOf(panel)).toContain("Done");
		expect(textOf(panel)).toContain("Planned");
		const saved = await site.rt.admin.submitEditorPanel("stage", "roadmap", item.id, "set_stage", {
			stage: "done",
		});
		expect(saved.toast).toMatchObject({ type: "success", message: "Moved to Done." });
		const board = (await site.call("board")) as {
			columns: Array<{ name: string; items: Array<{ title: string }> }>;
		};
		expect(board.columns.find((column) => column.name === "Done")?.items.map((row) => row.title)).toContain(
			"Dark board",
		);
		expect(board.columns.find((column) => column.name === "Planned")?.items.map((row) => row.title) || []).not.toContain(
			"Dark board",
		);
	});

	it("refuses guests and members on the stage panel", async () => {
		const site = await openRoadmap();
		const guest = await site.rt.actions.routes.request("editor_stage", { method: "POST", body: { type: "panel_load" } });
		expect(guest.status).toBe(401);
		const member = await site.rt.actions.routes.request("editor_stage", {
			method: "POST",
			body: { type: "panel_load" },
			user: ana,
		});
		expect(member.status).toBe(403);
	});
});

describe("rename keeps items", () => {
	it("keeps Under review items after the stage is renamed", async () => {
		const site = await openRoadmap();
		await addItem(site.rt, "One", "Under review");
		await addItem(site.rt, "Two", "Under review");
		await addItem(site.rt, "Three", "Under review");
		const renamed = await admin(site.call, {
			type: "form_submit",
			action_id: "save_stage:under-review",
			page: "/settings",
			values: { name: "QA Review", shown: true },
		});
		expect(textOf(renamed)).toContain("QA Review");
		expect(textOf(renamed)).toContain("3 items are in this stage.");
		const board = (await site.call("board")) as {
			columns: Array<{ name: string; items: Array<{ title: string }> }>;
		};
		const column = board.columns.find((item) => item.name === "QA Review");
		expect(column?.items.map((item) => item.title).sort()).toEqual(["One", "Three", "Two"]);
	});
});

describe("first stage for new ideas", () => {
	it("skips a hidden first stage", async () => {
		const { firstStage } = await import("../src/settings");
		const stages = [
			{ id: "a", name: "Under review", order: 0, shown: false, aliases: [] },
			{ id: "b", name: "Planned", order: 1, shown: true, aliases: [] },
		];
		expect(firstStage(stages as never).name).toBe("Planned");
		expect(firstStage(stages.map((s) => ({ ...s, shown: true })) as never).name).toBe("Under review");
	});
});
