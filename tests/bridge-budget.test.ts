// Must load before anything that starts the test host: it patches the bridge the host uses.
import { MAX_BRIDGE_CALLS, countBridgeCalls } from "./bridge-count";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection } from "../site-kit/seed/collection.mjs";
import { admin as adminUser, ana, openSite } from "./site";

/**
 * Bridge calls per entry point, each in its worst realistic case (a busy site). On Cloudflare a
 * sandboxed call gets 10 subrequests and each bridge call is one. This file measures; it does not
 * enforce the limit yet. A change in any count fails here so it is seen.
 */
const MEASURED: Record<string, number> = {
	"hook plugin:install (fresh)": 12,
	"hook plugin:activate (already set up)": 6,
	"hook content:beforeSave (panel-moved, draft)": 6,
	"hook cron notify (150 old guest votes, 120 old guest ideas, 10 rate keys)": 444,
	"route board (200 items, votes sort)": 13,
	"route board (200 items, category=core)": 214,
	"route health": 7,
	"route vote_guest POST (first vote)": 18,
	"route vote_guest DELETE (take back)": 11,
	"route vote_guest DELETE (nothing to take back, first guest request)": 13,
	"route suggest_guest": 20,
	"route vote POST (first vote)": 10,
	"route vote DELETE (take back)": 4,
	"route votes GET (200 votes)": 14,
	"route votes DELETE (erase 200 votes)": 602,
	"route suggest": 17,
	"admin page_load /ideas (200 items, 50 waiting)": 116,
	"admin page_load /settings (200 items)": 13,
	"admin widget waiting": 1,
	"admin form_submit save_who": 20,
	"admin form_submit save_email": 20,
	"admin form_submit add_stage": 19,
	"admin form_submit save_stage:planned": 19,
	"admin form_submit move_item (published)": 26,
	"admin form_submit move_item (draft)": 26,
	"admin form_submit ideas_find": 121,
	"admin form_submit merge_review": 126,
	"admin form_submit merge_items (500 + 500 votes)": 896,
	"admin block_action kit_done": 122,
	"admin block_action kit_again": 122,
	"admin block_action ideas_page": 121,
	"admin block_action idea_mod approve": 133,
	"admin block_action idea_mod reject": 121,
	"admin block_action stage_up:planned": 19,
	"admin block_action stage_down:planned": 19,
	"admin block_action stage_remove:done (empty stage)": 23,
	"editor_stage panel_load (draft)": 11,
	"editor_stage set_stage (published)": 22,
	"editor_stage set_stage (draft)": 24,
};

/** Every entry over MAX_BRIDGE_CALLS, with its count. Must match what the run measures. */
const KNOWN_OVER: Array<[string, number]> = [
	["hook plugin:install (fresh)", 12],
	["hook cron notify (150 old guest votes, 120 old guest ideas, 10 rate keys)", 444],
	["route board (200 items, votes sort)", 13],
	["route board (200 items, category=core)", 214],
	["route vote_guest POST (first vote)", 18],
	["route vote_guest DELETE (take back)", 11],
	["route vote_guest DELETE (nothing to take back, first guest request)", 13],
	["route suggest_guest", 20],
	["route vote POST (first vote)", 10],
	["route votes GET (200 votes)", 14],
	["route votes DELETE (erase 200 votes)", 602],
	["route suggest", 17],
	["admin page_load /ideas (200 items, 50 waiting)", 116],
	["admin page_load /settings (200 items)", 13],
	["admin form_submit save_who", 20],
	["admin form_submit save_email", 20],
	["admin form_submit add_stage", 19],
	["admin form_submit save_stage:planned", 19],
	["admin form_submit move_item (published)", 26],
	["admin form_submit move_item (draft)", 26],
	["admin form_submit ideas_find", 121],
	["admin form_submit merge_review", 126],
	["admin form_submit merge_items (500 + 500 votes)", 896],
	["admin block_action kit_done", 122],
	["admin block_action kit_again", 122],
	["admin block_action ideas_page", 121],
	["admin block_action idea_mod approve", 133],
	["admin block_action idea_mod reject", 121],
	["admin block_action stage_up:planned", 19],
	["admin block_action stage_down:planned", 19],
	["admin block_action stage_remove:done (empty stage)", 23],
	["editor_stage panel_load (draft)", 11],
	["editor_stage set_stage (published)", 22],
	["editor_stage set_stage (draft)", 24],
];

/**
 * Entries long enough to outlive roadmapReady's 2-second cache (src/core.ts): each expiry re-reads
 * the collection setting and the schema, 2 more calls. Asserted within this many extra calls.
 */
const SLACK: Record<string, number> = { "admin form_submit merge_items (500 + 500 votes)": 6 };

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

type Busy = { fresh?: boolean; items?: number; drafts?: number; pending?: number; votesPer?: number; votedBy?: string };

/** A busy site: published items, draft items, waiting ideas, and votes with tallies. */
async function busySite(opts: Busy = {}) {
	site = await openSite();
	const { rt } = site;
	await rt.fixtures.collection(roadmapCollection as never);
	await rt.fixtures.collection(changelogCollection as never);
	await rt.fixtures.plugin.setting("notify_to", "owner@example.com");
	// A live site ran install: settings seeded and the hourly task scheduled.
	if (!opts.fresh) await rt.transport.invokeHook("plugin:install", {});
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
		await rt.fixtures.plugin.storage("tallies", item, { votes: per + (opts.votedBy ? 1 : 0) });
	}
	return { site, rt, items, ideas };
}

async function measure(name: string, call: () => Promise<unknown>) {
	const { result, calls } = await countBridgeCalls(call);
	seen.set(name, calls);
	const want = MEASURED[name];
	expect(want, `${name} has no MEASURED count`).toBeTypeOf("number");
	if (SLACK[name]) expect(calls.length - want!, name).toSatisfy((extra: number) => extra >= 0 && extra <= SLACK[name]!);
	else expect(calls.length, name).toBe(want);
	return result;
}

const adminCall = (s: Site, input: Record<string, unknown>) => s.call("admin", input, { method: "POST", user: adminUser });
const panelCall = (s: Site, id: string, input: Record<string, unknown>) =>
	s.call("editor_stage", input, { method: "POST", user: adminUser, ui: { entry: { collection: "roadmap", id } } } as never);

/** Puts an unpublished change on a published item, so it carries a draft revision. */
async function withDraft(s: Site, id: string) {
	await s.rt.actions.content.update("roadmap", id, { data: { title: "Edited", description: "d", stage: "Planned" } } as never);
}

describe("hooks", () => {
	it("plugin:install on a fresh site", async () => {
		const { rt } = await busySite({ fresh: true });
		for (const key of ["stages", "allow_ideas", "who", "notify", "collection"]) await rt.fixtures.plugin.setting(key, null as never);
		await measure("hook plugin:install (fresh)", () => rt.transport.invokeHook("plugin:install", {}));
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

	it("cron notify on a busy site with old guest rows", async () => {
		const { rt, items } = await busySite({ items: 2, pending: 5 });
		for (let i = 0; i < 150; i += 1) {
			const id = `${items[i % 2]}:v-old${i}`;
			await rt.fixtures.plugin.storage("votes", id, { item: items[i % 2], member_id: `v-old${i}`, createdAt: OLD, visitor: `old${i}` });
		}
		for (let i = 0; i < 120; i += 1) {
			await rt.fixtures.plugin.storage("ideas", `gi${i}`, { title: "g", status: "rejected", rev: "r", createdAt: OLD, visitor: `old${i}`, guest: true });
		}
		for (let i = 0; i < 10; i += 1) await rt.fixtures.plugin.kv(`rate:vote:v-${i}`, `${Date.parse(OLD)}|1`);
		await rt.fixtures.plugin.kv("notify:last", "0");
		await measure("hook cron notify (150 old guest votes, 120 old guest ideas, 10 rate keys)", () =>
			rt.transport.invokeHook("cron", { name: "notify", data: {}, scheduledAt: new Date().toISOString() }),
		);
	});
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

	it("vote_guest POST, first vote of the hour, item with 500 votes", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500 });
		await s.call("vote_guest", { id: "warm-salt" }, guestReq("203.0.113.9")); // the salt exists on a live site
		await s.rt.fixtures.plugin.kv("guest:address-seen", {});
		await measure("route vote_guest POST (first vote)", () => s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7")));
	});

	it("vote_guest DELETE", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500 });
		await s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7"));
		await measure("route vote_guest DELETE (take back)", () => s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7", "DELETE")));
	});

	it("vote_guest DELETE of a vote the cleanup made anonymous", async () => {
		const { site: s, items } = await busySite({ items: 1 });
		await measure("route vote_guest DELETE (nothing to take back, first guest request)", () =>
			s.call("vote_guest", { id: items[0] }, guestReq("198.51.100.7", "DELETE")),
		);
	});

	it("suggest_guest", async () => {
		const { site: s } = await busySite({ items: 1 });
		await s.call("vote_guest", { id: "warm-salt" }, guestReq("203.0.113.9"));
		await s.rt.fixtures.plugin.kv("guest:address-seen", {});
		await measure("route suggest_guest", () => s.call("suggest_guest", { title: "Dark mode", description: "x", name: "Sam" }, guestReq("198.51.100.7")));
	});
});

describe("member routes", () => {
	it("vote POST, first vote, item with 500 votes", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500 });
		await measure("route vote POST (first vote)", () => s.call("vote", { id: items[0] }, memberReq()));
	});

	it("vote DELETE", async () => {
		const { site: s, items } = await busySite({ items: 1, votesPer: 500, votedBy: ana.id });
		await measure("route vote DELETE (take back)", () => s.call("vote", { id: items[0] }, memberReq("DELETE")));
	});

	it("votes GET, member who voted on 200 items", async () => {
		const { site: s } = await busySite({ items: 200, votedBy: ana.id });
		await measure("route votes GET (200 votes)", () => s.call("votes", {}, memberReq("GET")));
	});

	it("votes DELETE, member who voted on 200 items", async () => {
		const { site: s } = await busySite({ items: 200, votedBy: ana.id });
		await measure("route votes DELETE (erase 200 votes)", () => s.call("votes", {}, memberReq("DELETE")));
	});

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

	it("form_submit merge_items, 500 votes on each side", async () => {
		const { site: s, items } = await busySite({ ...big, items: 200, votesPer: 0 });
		// Source and kept item each with 500 votes, 250 of them from the same people.
		for (let v = 0; v < 500; v += 1) {
			await s.rt.fixtures.plugin.storage("votes", `${items[1]}:s${v}`, { item: items[1], member_id: `s${v}`, createdAt: RECENT, visitor: "" });
			await s.rt.fixtures.plugin.storage("votes", `${items[0]}:s${v + 250}`, { item: items[0], member_id: `s${v + 250}`, createdAt: RECENT, visitor: "" });
		}
		const source = (await s.rt.inspect.content.get("roadmap", items[1]!)) as { version?: number; updatedAt?: string };
		await measure("admin form_submit merge_items (500 + 500 votes)", () =>
			adminCall(s, {
				type: "form_submit",
				action_id: "merge_items",
				page: "/ideas",
				values: { source: `item|${items[1]}|${source.version ?? ""}~${source.updatedAt ?? ""}`, keep: items[0] },
			}),
		);
	});

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
	it("lists every entry over the limit", () => {
		const over = [...seen].filter(([, calls]) => calls.length > MAX_BRIDGE_CALLS).map(([name]) => name);
		expect(over.sort()).toEqual(KNOWN_OVER.map(([name]) => name).sort());
		for (const [name, count] of KNOWN_OVER) expect(MEASURED[name], name).toBe(count);
		// Every measured entry has a recorded count.
		expect([...seen.keys()].sort()).toEqual(Object.keys(MEASURED).sort());
	});
});
