// Must load before anything that starts the test host: it patches the bridge the host uses.
import { MAX_BRIDGE_CALLS, countBridgeCalls } from "./bridge-count";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection } from "../site-kit/seed/collection.mjs";
import { admin as adminUser, ana, openSite } from "./site";

/**
 * Bridge calls per entry point, each in its worst realistic case (a busy site). On Cloudflare a
 * sandboxed call gets 10 subrequests and each bridge call is one. Every count is pinned here, so a
 * change shows, and every one is held to MAX_BRIDGE_CALLS. Stepped work (the 0.3.0 upgrade, a
 * merge, the hourly cleanup, an erase) is run to the end and its largest call is pinned.
 */
const MEASURED: Record<string, number> = {
	"hook plugin:install (fresh)": 5,
	"hook plugin:activate (already set up)": 1,
	"hook content:beforeSave (panel-moved, draft)": 4,
	"hook content:beforeSave (inside the plugin's own Stage move)": 1,
	"hook content:afterPublish (no count row, waiting idea)": 3,
	"hook content:afterUnpublish": 1,
	"hook content:afterDelete": 1,
	"hook content:afterRestore": 1,
	"hook cron notify (sends, 150 old guest votes, 120 old guest ideas, 10 rate keys), largest run": 9,
	"hook cron notify (merge running), largest run": 8,
	"hook cron notify (0.3.0 upgrade), largest run": 8,
	"route board (200 items, votes sort)": 4,
	"route board (200 items, category=core)": 4,
	"route health": 2,
	"route vote POST (live item)": 5,
	"route vote POST (first counted vote, item not marked live)": 8,
	"route vote POST (0.3.0 row the upgrade passed)": 9,
	"route vote POST (0.3.0 site before the upgrade)": 7,
	"route vote DELETE (take back)": 2,
	"route vote DELETE (0.3.0 row the upgrade passed)": 6,
	"route vote_guest POST (live item)": 7,
	"route vote_guest POST (first counted vote, item not marked live)": 9,
	"route vote_guest POST (0.3.0 site before the upgrade, salt in kv)": 9,
	"route vote_guest DELETE (take back)": 3,
	"route vote_guest DELETE (nothing to take back)": 5,
	"route suggest_guest": 7,
	"route suggest_guest (0.3.0 site, no salt yet)": 9,
	"route suggest": 6,
	"route votes GET (300 votes)": 8,
	"route votes DELETE (erase 200 votes), largest call": 9,
	"admin page_load /ideas (200 items, 50 waiting)": 5,
	"admin page_load /ideas (0.3.0 upgrade running), largest call": 9,
	"admin page_load /ideas (500 + 500 vote merge running), largest call": 9,
	"admin page_load /settings (200 items)": 4,
	"admin widget waiting": 1,
	"admin form_submit save_who": 6,
	"admin form_submit save_email": 7,
	"admin form_submit add_stage": 5,
	"admin form_submit save_stage:planned": 5,
	"admin form_submit move_item (published)": 9,
	"admin form_submit move_item (draft)": 8,
	"admin form_submit ideas_find": 5,
	"admin form_submit merge_review": 5,
	"admin form_submit merge_items (500 + 500 votes)": 7,
	"admin block_action kit_done": 6,
	"admin block_action kit_again": 6,
	"admin block_action ideas_page": 5,
	"admin block_action idea_mod approve": 9,
	"admin block_action idea_mod reject": 5,
	"admin block_action stage_up:planned": 5,
	"admin block_action stage_down:planned": 5,
	"admin block_action stage_remove:done (empty stage)": 5,
	"editor_stage panel_load (draft)": 3,
	"editor_stage set_stage (published)": 7,
	"editor_stage set_stage (draft)": 6,
};

/** Every entry over MAX_BRIDGE_CALLS. Empty since 0.4.0, and kept that way. */
const KNOWN_OVER: Array<[string, number]> = [];

const seen = new Map<string, string[]>();

type Site = Awaited<ReturnType<typeof openSite>>;
let site: Site | undefined;
afterEach(async () => {
	await site?.dispose();
	site = undefined;
});

const DAY = 24 * 60 * 60 * 1000;
const OLD = new Date(Date.now() - 40 * DAY).toISOString();
const RECENT = new Date(Date.now() - DAY).toISOString();
const guestReq = (ip: string, method = "POST") => ({ method, meta: { ip, userAgent: null, referer: null, geo: null } });
const memberReq = (method = "POST") => ({ method, user: ana });

type Busy = {
	/** Seed counts as 0.3.0 left them (no `v`), with the salt and setup answer in kv, and no install. */
	v3?: boolean;
	fresh?: boolean;
	items?: number;
	drafts?: number;
	pending?: number;
	votesPer?: number;
	votedBy?: string;
	/** Mark each item's count row live, as the content hooks do on a 0.4.0 site. */
	live?: boolean;
};

/** A busy site: published items, draft items, waiting ideas, and votes with their counts. */
async function busySite(opts: Busy = {}) {
	site = await openSite();
	const { rt } = site;
	await rt.fixtures.collection(roadmapCollection as never);
	await rt.fixtures.collection(changelogCollection as never);
	await rt.fixtures.plugin.setting("notify_to", "owner@example.com");
	// A 0.4.0 site ran install: the hourly task, the salt, and no 0.3.0 data to bring over.
	if (!opts.fresh && !opts.v3) await rt.transport.invokeHook("plugin:install", {});
	if (opts.v3) {
		await rt.fixtures.plugin.kv("visitor-salt", "old-salt");
		await rt.fixtures.plugin.kv("kit_pages_done", "1");
	}
	const items: string[] = [];
	for (let i = 0; i < (opts.items ?? 0); i += 1) {
		const made = await rt.fixtures.content("roadmap", {
			data: { title: `Item ${i}`, description: "d", stage: ["Under review", "Planned", "In progress"][i % 3] },
			slug: `item-${i}`,
			status: "published",
		} as never);
		items.push(made.id);
	}
	for (let i = 0; i < (opts.drafts ?? 0); i += 1) {
		await rt.fixtures.content("roadmap", {
			data: { title: `Draft ${i}`, description: "d", stage: "Under review" },
			slug: `draft-${i}`,
		} as never);
	}
	const ideas: string[] = [];
	for (let i = 0; i < (opts.pending ?? 0); i += 1) {
		const made = await rt.fixtures.content("roadmap", {
			data: { title: `Idea ${i}`, description: "d", stage: "Under review" },
			slug: `idea-${i}`,
		} as never);
		await rt.fixtures.plugin.storage("ideas", made.id, {
			member_id: "",
			title: `Idea ${i}`,
			description: "d",
			status: "pending",
			rev: `r${i}`,
			createdAt: RECENT,
			visitor: "",
			guest: true,
			name: "Sam",
		});
		ideas.push(made.id);
	}
	for (const item of items) {
		const per = opts.votesPer ?? 0;
		for (let v = 0; v < per; v += 1) {
			await rt.fixtures.plugin.storage("votes", `${item}:m${v}`, { item, member_id: `m${v}`, createdAt: RECENT, visitor: "" });
		}
		if (opts.votedBy) {
			await rt.fixtures.plugin.storage("votes", `${item}:${opts.votedBy}`, { item, member_id: opts.votedBy, createdAt: RECENT, visitor: "" });
		}
		const votes = per + (opts.votedBy ? 1 : 0);
		await rt.fixtures.plugin.storage("tallies", item, opts.v3 ? { votes } : { v: 4, votes, live: opts.live !== false, seq: 0 });
	}
	return { site, rt, items, ideas };
}

/**
 * Content hooks run after a publish without being awaited (EmDash fires them and moves on). Each is
 * its own plugin call with its own budget, so let them finish before counting the next call.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

async function measure(name: string, call: () => Promise<unknown>) {
	await settle();
	const { result, calls } = await countBridgeCalls(call);
	record(name, calls);
	expect(calls.length, `${name}: ${calls.join(",")}`).toBe(MEASURED[name]);
	return result;
}

/** Stepped work: run `call` until `done` says it ended, and keep the largest call. */
async function measureSteps(name: string, call: () => Promise<unknown>, done: () => Promise<boolean>, max = 60) {
	let largest: string[] = [];
	for (let step = 0; step < max; step += 1) {
		await settle();
		const { calls } = await countBridgeCalls(call);
		if (calls.length > largest.length) largest = calls;
		if (await done()) {
			record(name, largest);
			expect(largest.length, `${name}: ${largest.join(",")}`).toBe(MEASURED[name]);
			return step + 1;
		}
	}
	throw new Error(`${name} did not end in ${max} calls`);
}

function record(name: string, calls: string[]) {
	expect(MEASURED[name], `${name} has no MEASURED count`).toBeTypeOf("number");
	seen.set(name, calls);
}

const adminCall = (s: Site, input: Record<string, unknown>) => s.call("admin", input, { method: "POST", user: adminUser });
const panelCall = (s: Site, id: string, input: Record<string, unknown>) =>
	s.call("editor_stage", input, { method: "POST", user: adminUser, ui: { entry: { collection: "roadmap", id } } } as never);
const cron = (s: Site) => s.rt.transport.invokeHook("cron", { name: "notify", data: {}, scheduledAt: new Date().toISOString() });

/** Puts an unpublished change on a published item, so it carries a draft revision. */
async function withDraft(s: Site, id: string) {
	await s.rt.actions.content.update("roadmap", id, { data: { title: "Edited", description: "d", stage: "Planned" } } as never);
}

type Row = Record<string, unknown>;
const tally = async (s: Site, id: string) => (await s.rt.inspect.storage.get<Row>("tallies", id)) ?? null;
const voteRows = async (s: Site, id: string) => (await s.rt.inspect.storage.list<Row>("votes")).filter((row) => row.data.item === id).length;

describe("hooks", () => {
	it("plugin:install on a fresh site", async () => {
		const { rt } = await busySite({ fresh: true });
		await measure("hook plugin:install (fresh)", () => rt.transport.invokeHook("plugin:install", {}));
		expect(await rt.inspect.setting("upgrade_0_4")).toMatchObject({ phase: "done" });
	});

	it("plugin:activate on a set-up site", async () => {
		const { rt } = await busySite();
		await measure("hook plugin:activate (already set up)", () => rt.transport.invokeHook("plugin:activate", {}));
	});

	it("content:beforeSave on an item the panel moved, with a draft", async () => {
		const { site: s, rt, items } = await busySite({ items: 1 });
		await withDraft(s, items[0]!);
		await panelCall(s, items[0]!, { type: "block_action", action_id: "set_stage:done" });
		await measure("hook content:beforeSave (panel-moved, draft)", () =>
			rt.transport.invokeHook("content:beforeSave", {
				collection: "roadmap",
				isNew: false,
				id: items[0],
				content: { title: "x", stage: "In progress" },
			}),
		);
	});

	it("content:beforeSave inside the plugin's own Stage move stops after one call", async () => {
		const { site: s, rt, items } = await busySite({ items: 1 });
		await panelCall(s, items[0]!, { type: "block_action", action_id: "set_stage:done" });
		// The plugin's own update carries the stage the move record was just set to.
		await measure("hook content:beforeSave (inside the plugin's own Stage move)", () =>
			rt.transport.invokeHook("content:beforeSave", { collection: "roadmap", isNew: false, id: items[0], content: { title: "x", stage: "Done" } }),
		);
	});

	it("content:afterPublish on an item with no count row and a waiting idea", async () => {
		const { rt, ideas } = await busySite({ pending: 1 });
		await measure("hook content:afterPublish (no count row, waiting idea)", () =>
			rt.transport.invokeHook("content:afterPublish", { collection: "roadmap", content: { id: ideas[0], status: "published" } }),
		);
		expect(await rt.inspect.storage.get("tallies", ideas[0]!)).toMatchObject({ v: 4, votes: 0, live: true });
		expect(await rt.inspect.storage.get("ideas", ideas[0]!)).toMatchObject({ status: "approved" });
	});

	for (const [hook, event] of [
		["content:afterUnpublish", (id: string) => ({ collection: "roadmap", content: { id } })],
		["content:afterDelete", (id: string) => ({ collection: "roadmap", id })],
		["content:afterRestore", (id: string) => ({ collection: "roadmap", content: { id, status: "draft" } })],
	] as const) {
		it(`${hook} marks the count row not live`, async () => {
			const { rt, items } = await busySite({ items: 1, votesPer: 3 });
			await measure(`hook ${hook}`, () => rt.transport.invokeHook(hook, event(items[0]!)));
			expect(await rt.inspect.storage.get("tallies", items[0]!)).toMatchObject({ v: 4, votes: 3, live: false });
		});
	}

	it("cron on a busy site with old guest rows: notice, then the cleanup in batches", async () => {
		const { site: s, rt, items } = await busySite({ items: 2, pending: 5 });
		for (let i = 0; i < 150; i += 1) {
			const id = `${items[i % 2]}:v-old${i}`;
			await rt.fixtures.plugin.storage("votes", id, { item: items[i % 2], member_id: `v-old${i}`, createdAt: OLD, visitor: `old${i}` });
		}
		for (let i = 0; i < 120; i += 1) {
			await rt.fixtures.plugin.storage("ideas", `gi${i}`, { title: "g", status: "rejected", rev: "r", createdAt: OLD, visitor: `old${i}`, guest: true });
		}
		for (let i = 0; i < 10; i += 1) await rt.fixtures.plugin.kv(`rate:vote:v-${i}`, `${Date.parse(OLD)}|1`);
		await rt.fixtures.plugin.kv("notify:last", "0");
		const hashed = async () => {
			const votes = (await rt.inspect.storage.list<Row>("votes")).filter((row) => row.data.visitor);
			const ideas = (await rt.inspect.storage.list<Row>("ideas")).filter((row) => row.data.visitor);
			const rate = (await rt.inspect.kv.list()).filter((row) => String((row as { id?: string; key?: string }).id ?? (row as { key?: string }).key).startsWith("rate:"));
			return votes.length + ideas.length + rate.length === 0;
		};
		await measureSteps("hook cron notify (sends, 150 old guest votes, 120 old guest ideas, 10 rate keys), largest run", () => cron(s), hashed, 80);
		const votes = await rt.inspect.storage.list<Row>("votes");
		expect(votes).toHaveLength(150);
	}, 240_000);
});

describe("public routes", () => {
	it("board, 200 published items sorted by votes", async () => {
		const { site: s } = await busySite({ items: 200, drafts: 20 });
		await measure("route board (200 items, votes sort)", () => s.call("board", {}, { method: "GET" }));
	});

	it("board with a category filter", async () => {
		const { site: s } = await busySite({ items: 200 });
		await measure("route board (200 items, category=core)", () => s.call("board", { category: "core" }, { method: "GET" }));
	});

	it("health", async () => {
		const { site: s } = await busySite();
		await measure("route health", () => s.call("health", {}, { method: "GET" }));
	});

	it("vote_guest POST on a live item", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500 });
		await s.rt.fixtures.plugin.setting("guest_seen", {});
		await measure("route vote_guest POST (live item)", () => s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7")));
		expect(await tally(s, items[0]!)).toMatchObject({ votes: 501 });
	});

	it("vote_guest POST, the item's first counted vote, row not marked live", async () => {
		const { site: s } = await busySite();
		const made = await s.rt.fixtures.content("roadmap", { data: { title: "New", stage: "Planned" }, slug: "new", status: "published" } as never);
		await measure("route vote_guest POST (first counted vote, item not marked live)", () => s.call("vote_guest", { id: made.id }, guestReq("198.51.100.7")));
		expect(await tally(s, made.id)).toMatchObject({ v: 4, votes: 1, live: true });
	});

	it("vote_guest POST on a 0.3.0 site before the upgrade: salt read from kv, count left to the upgrade", async () => {
		const { site: s, items } = await busySite({ v3: true, items: 1, votesPer: 5 });
		const answer = await measure("route vote_guest POST (0.3.0 site before the upgrade, salt in kv)", () =>
			s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7")),
		);
		expect(answer).toMatchObject({ ok: true, voted: true, votes: 6 });
		expect(await tally(s, items[0]!)).toEqual({ votes: 5 });
	});

	it("vote_guest DELETE", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500 });
		await s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7"));
		await measure("route vote_guest DELETE (take back)", () => s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7", "DELETE")));
		expect(await tally(s, items[0]!)).toMatchObject({ votes: 500 });
	});

	it("vote_guest DELETE with nothing to take back", async () => {
		const { site: s, items } = await busySite({ items: 1 });
		await measure("route vote_guest DELETE (nothing to take back)", () => s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7", "DELETE")));
	});

	it("suggest_guest", async () => {
		const { site: s } = await busySite({ items: 1 });
		await s.rt.fixtures.plugin.setting("guest_seen", {});
		await measure("route suggest_guest", () => s.call("suggest_guest", { title: "Dark mode", description: "x", name: "Sam" }, guestReq("198.51.100.7")));
	});

	it("suggest_guest on a 0.3.0 site where no guest ever wrote: the salt is made", async () => {
		const { site: s } = await busySite({ fresh: true, items: 1 });
		await measure("route suggest_guest (0.3.0 site, no salt yet)", () =>
			s.call("suggest_guest", { title: "Dark mode", description: "x", name: "Sam" }, guestReq("198.51.100.7")),
		);
		expect(await s.rt.inspect.setting("visitor_salt")).toBeTruthy();
	});
});

describe("member routes", () => {
	it("vote POST on a live item with 500 votes", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500 });
		await measure("route vote POST (live item)", () => s.call("vote", { id: items[0] }, memberReq()));
		expect(await tally(s, items[0]!)).toMatchObject({ votes: 501 });
	});

	it("vote POST, the item's first counted vote, row not marked live", async () => {
		const { site: s } = await busySite();
		const made = await s.rt.fixtures.content("roadmap", { data: { title: "New", stage: "Planned" }, slug: "new", status: "published" } as never);
		await measure("route vote POST (first counted vote, item not marked live)", () => s.call("vote", { id: made.id }, memberReq()));
		expect(await tally(s, made.id)).toMatchObject({ v: 4, votes: 1 });
	});

	it("vote POST on a 0.3.0 row the upgrade already passed: counted again", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 4 });
		await s.rt.fixtures.plugin.storage("tallies", items[0]!, { votes: 9 });
		await measure("route vote POST (0.3.0 row the upgrade passed)", () => s.call("vote", { id: items[0] }, memberReq()));
		expect(await tally(s, items[0]!)).toMatchObject({ v: 4, votes: 5 });
	});

	it("vote POST on a 0.3.0 site before the upgrade", async () => {
		const { site: s, items } = await busySite({ v3: true, items: 1, votesPer: 4 });
		await measure("route vote POST (0.3.0 site before the upgrade)", () => s.call("vote", { id: items[0] }, memberReq()));
	});

	it("vote DELETE", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500, votedBy: ana.id });
		await measure("route vote DELETE (take back)", () => s.call("vote", { id: items[0] }, memberReq("DELETE")));
		expect(await tally(s, items[0]!)).toMatchObject({ votes: 500 });
	});

	it("vote DELETE on a 0.3.0 row the upgrade already passed", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 4, votedBy: ana.id });
		await s.rt.fixtures.plugin.storage("tallies", items[0]!, { votes: 9 });
		await measure("route vote DELETE (0.3.0 row the upgrade passed)", () => s.call("vote", { id: items[0] }, memberReq("DELETE")));
		expect(await tally(s, items[0]!)).toMatchObject({ v: 4, votes: 4 });
	});

	it("votes GET, member with 300 votes", async () => {
		const { site: s } = await busySite({ items: 200, votedBy: ana.id });
		for (let i = 0; i < 100; i += 1) {
			await s.rt.fixtures.plugin.storage("votes", `gone${i}:${ana.id}`, { item: `gone${i}`, member_id: ana.id, createdAt: RECENT, visitor: "" });
		}
		await measure("route votes GET (300 votes)", () => s.call("votes", {}, memberReq("GET")));
	});

	it("votes DELETE, member who voted on 200 items: erased in calls of a few, every count right", async () => {
		const { site: s, items } = await busySite({ items: 200, votesPer: 1, votedBy: ana.id });
		let last: unknown;
		const steps = await measureSteps(
			"route votes DELETE (erase 200 votes), largest call",
			async () => (last = await s.call("votes", {}, memberReq("DELETE"))),
			async () => (last as { ok?: boolean }).ok === true,
		);
		expect(steps).toBeGreaterThan(1);
		const rows = await s.rt.inspect.storage.list<Row>("votes");
		expect(rows.filter((row) => row.data.member_id === ana.id)).toHaveLength(0);
		for (const id of items.slice(0, 5)) expect(await tally(s, id)).toMatchObject({ votes: 1 });
	}, 240_000);

	it("suggest", async () => {
		const { site: s } = await busySite({ items: 1 });
		await measure("route suggest", () => s.call("suggest", { title: "Dark mode", description: "x" }, memberReq()));
	});
});

describe("admin", () => {
	const big = { items: 200, drafts: 20, pending: 50 };

	it("page_load /ideas", async () => {
		const { site: s } = await busySite(big);
		await measure("admin page_load /ideas (200 items, 50 waiting)", () => adminCall(s, { type: "page_load", page: "/ideas" }));
	});

	it("page_load /ideas runs the 0.3.0 upgrade to the end, every count rebuilt from its votes", async () => {
		const { site: s, rt, items } = await busySite({ v3: true, items: 40, votesPer: 3 });
		// The busiest item has 150 votes; one has a stale 0.3.0 count and no votes; one has votes and no count.
		for (let v = 0; v < 147; v += 1) await rt.fixtures.plugin.storage("votes", `${items[0]}:x${v}`, { item: items[0], member_id: `x${v}`, createdAt: RECENT, visitor: "" });
		await rt.fixtures.plugin.storage("tallies", items[1]!, { votes: 7 });
		for (const row of (await rt.inspect.storage.list<Row>("votes")).filter((r) => r.data.item === items[1])) {
			await s.rt.fixtures.plugin.storage("votes", row.id, { item: "elsewhere", member_id: "z", createdAt: RECENT, visitor: "" });
		}
		await rt.fixtures.plugin.storage("tallies", "gone-item", { votes: 3 });
		await measureSteps(
			"admin page_load /ideas (0.3.0 upgrade running), largest call",
			() => adminCall(s, { type: "page_load", page: "/ideas" }),
			async () => ((await rt.inspect.setting<Row>("upgrade_0_4"))?.phase ?? "") === "done",
		);
		for (const id of [...items, "elsewhere", "gone-item"]) {
			expect(await tally(s, id), id).toMatchObject({ v: 4, votes: await voteRows(s, id) });
		}
		expect(await rt.inspect.setting("visitor_salt")).toBe("old-salt");
		expect(await rt.inspect.setting("kit_done")).toBe(true);
	}, 240_000);

	it("cron runs the 0.3.0 upgrade to the end", async () => {
		const { site: s, rt, items } = await busySite({ v3: true, items: 30, votesPer: 4 });
		await measureSteps(
			"hook cron notify (0.3.0 upgrade), largest run",
			() => cron(s),
			async () => ((await rt.inspect.setting<Row>("upgrade_0_4"))?.phase ?? "") === "done",
		);
		for (const id of items) expect(await tally(s, id)).toMatchObject({ v: 4, votes: 4 });
	}, 240_000);

	it("page_load /settings", async () => {
		const { site: s } = await busySite(big);
		await measure("admin page_load /settings (200 items)", () => adminCall(s, { type: "page_load", page: "/settings" }));
	});

	it("widget waiting", async () => {
		const { site: s } = await busySite({ pending: 50 });
		await measure("admin widget waiting", () => adminCall(s, { type: "page_load", page: "widget:waiting" }));
	});

	for (const [action, values] of [
		["save_who", { allow_ideas: true, who: "anyone" }],
		["save_email", { notify: true, notify_to: "owner@example.com" }],
		["add_stage", { name: "Later", shown: true }],
		["save_stage:planned", { name: "Planned next", shown: true }],
	] as const) {
		it(`form_submit ${action}`, async () => {
			const { site: s } = await busySite(big);
			await measure(`admin form_submit ${action}`, () => adminCall(s, { type: "form_submit", action_id: action, page: "/settings", values }));
		});
	}

	it("form_submit move_item, published item", async () => {
		const { site: s, items } = await busySite(big);
		await measure("admin form_submit move_item (published)", () =>
			adminCall(s, { type: "form_submit", action_id: "move_item", page: "/settings", values: { item: items[0], stage: "done" } }),
		);
	});

	it("form_submit move_item, item with a draft", async () => {
		const { site: s, items } = await busySite(big);
		await withDraft(s, items[0]!);
		await measure("admin form_submit move_item (draft)", () =>
			adminCall(s, { type: "form_submit", action_id: "move_item", page: "/settings", values: { item: items[0], stage: "done" } }),
		);
	});

	it("form_submit ideas_find", async () => {
		const { site: s } = await busySite(big);
		await measure("admin form_submit ideas_find", () => adminCall(s, { type: "form_submit", action_id: "ideas_find", page: "/ideas", values: { q: "Idea" } }));
	});

	it("form_submit merge_review", async () => {
		const { site: s, items } = await busySite(big);
		await measure("admin form_submit merge_review", () =>
			adminCall(s, {
				type: "form_submit",
				action_id: "merge_review",
				page: "/ideas",
				values: { source: `item|${items[1]}|x`, keep: items[0] },
			}),
		);
	});

	it("merge_items with 500 votes on each side: started in one call, finished by page loads, one vote per person", async () => {
		const { site: s, rt, items } = await busySite({ ...big, items: 200, votesPer: 0 });
		// Source and kept item each with 500 votes, 250 of them from the same people.
		for (let v = 0; v < 500; v += 1) {
			await rt.fixtures.plugin.storage("votes", `${items[1]}:s${v}`, { item: items[1], member_id: `s${v}`, createdAt: RECENT, visitor: "" });
			await rt.fixtures.plugin.storage("votes", `${items[0]}:s${v + 250}`, { item: items[0], member_id: `s${v + 250}`, createdAt: RECENT, visitor: "" });
		}
		await rt.fixtures.plugin.storage("tallies", items[1]!, { v: 4, votes: 500, live: true, seq: 0 });
		await rt.fixtures.plugin.storage("tallies", items[0]!, { v: 4, votes: 500, live: true, seq: 0 });
		const source = (await rt.inspect.content.get("roadmap", items[1]!)) as { version?: number; updatedAt?: string };
		await measure("admin form_submit merge_items (500 + 500 votes)", () =>
			adminCall(s, {
				type: "form_submit",
				action_id: "merge_items",
				page: "/ideas",
				values: { source: `item|${items[1]}|${source.version ?? ""}~${source.updatedAt ?? ""}`, keep: items[0] },
			}),
		);
		await measureSteps(
			"admin page_load /ideas (500 + 500 vote merge running), largest call",
			() => adminCall(s, { type: "page_load", page: "/ideas" }),
			async () => !(await rt.inspect.setting("merge_job")),
		);
		expect(await voteRows(s, items[0]!)).toBe(750);
		expect(await voteRows(s, items[1]!)).toBe(0);
		expect(await tally(s, items[0]!)).toMatchObject({ votes: 750 });
		expect(await tally(s, items[1]!)).toBeNull();
		expect((await rt.inspect.content.get("roadmap", items[1]!))?.status).not.toBe("published");
	}, 240_000);

	it("cron finishes a merge in progress", async () => {
		const { site: s, rt, items } = await busySite({ items: 2, votesPer: 150 });
		const source = (await rt.inspect.content.get("roadmap", items[1]!)) as { version?: number; updatedAt?: string };
		await adminCall(s, {
			type: "form_submit",
			action_id: "merge_items",
			page: "/ideas",
			values: { source: `item|${items[1]}|${source.version ?? ""}~${source.updatedAt ?? ""}`, keep: items[0] },
		});
		await measureSteps("hook cron notify (merge running), largest run", () => cron(s), async () => !(await rt.inspect.setting("merge_job")));
		expect(await tally(s, items[0]!)).toMatchObject({ votes: 150 });
	}, 240_000);

	for (const action of ["kit_done", "kit_again", "ideas_page"]) {
		it(`block_action ${action}`, async () => {
			const { site: s } = await busySite(big);
			await measure(`admin block_action ${action}`, () =>
				adminCall(s, { type: "block_action", action_id: action, page: "/ideas", value: action === "ideas_page" ? "25|" : undefined }),
			);
		});
	}

	it("block_action idea_mod approve", async () => {
		const { site: s, ideas } = await busySite(big);
		await measure("admin block_action idea_mod approve", () =>
			adminCall(s, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: `approve|r0|${ideas[0]}` }),
		);
		expect((await s.rt.inspect.content.get("roadmap", ideas[0]!))?.status).toBe("published");
	});

	it("block_action idea_mod reject", async () => {
		const { site: s, ideas } = await busySite(big);
		await measure("admin block_action idea_mod reject", () =>
			adminCall(s, { type: "block_action", action_id: "idea_mod", page: "/ideas", value: `reject|r0|${ideas[0]}` }),
		);
	});

	for (const action of ["stage_up:planned", "stage_down:planned"]) {
		it(`block_action ${action}`, async () => {
			const { site: s } = await busySite(big);
			await measure(`admin block_action ${action}`, () => adminCall(s, { type: "block_action", action_id: action, page: "/settings" }));
		});
	}

	it("block_action stage_remove of an empty stage", async () => {
		const { site: s } = await busySite(big);
		await measure("admin block_action stage_remove:done (empty stage)", () =>
			adminCall(s, { type: "block_action", action_id: "stage_remove:done", page: "/settings" }),
		);
	});

	it("editor panel load, item with a draft", async () => {
		const { site: s, items } = await busySite({ items: 1 });
		await withDraft(s, items[0]!);
		await measure("editor_stage panel_load (draft)", () => panelCall(s, items[0]!, { type: "panel_load" }));
	});

	it("editor panel set_stage, published item", async () => {
		const { site: s, items } = await busySite({ items: 1 });
		await measure("editor_stage set_stage (published)", () => panelCall(s, items[0]!, { type: "block_action", action_id: "set_stage:done" }));
	});

	it("editor panel set_stage, item with a draft", async () => {
		const { site: s, items } = await busySite({ items: 1 });
		await withDraft(s, items[0]!);
		await measure("editor_stage set_stage (draft)", () => panelCall(s, items[0]!, { type: "block_action", action_id: "set_stage:done" }));
	});
});

describe("budget", () => {
	it("holds every entry point to the limit", () => {
		const over = [...seen].filter(([, calls]) => calls.length > MAX_BRIDGE_CALLS).map(([name, calls]) => [name, calls.length]);
		expect(over).toEqual(KNOWN_OVER);
		expect(KNOWN_OVER).toEqual([]);
		for (const [name, calls] of seen) expect(calls.length, name).toBeLessThanOrEqual(MAX_BRIDGE_CALLS);
		for (const count of Object.values(MEASURED)) expect(count).toBeLessThanOrEqual(MAX_BRIDGE_CALLS);
		// Every measured entry has a recorded count, and every count was measured.
		expect([...seen.keys()].sort()).toEqual(Object.keys(MEASURED).sort());
	});
});
