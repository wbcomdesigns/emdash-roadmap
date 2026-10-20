// Must load before anything that starts the test host: it patches the sandbox bridge.
import { MAX_BRIDGE_CALLS, countBridgeCalls } from "./bridge-count";

import { PluginBridge } from "@emdash-cms/cloudflare/sandbox";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection } from "../site-kit/seed/collection.mjs";
import { admin, ana, ben, member, openSite } from "./site";

/**
 * 0.4.0 counters under races, and the Cloudflare walk finding. Each race test runs the competing
 * call right before a chosen bridge call of the first one, while that call waits.
 */

type Site = Awaited<ReturnType<typeof openSite>>;
type Row = Record<string, unknown>;

let site: Site | undefined;
let race: { method: string; nth: number; run: () => Promise<unknown> } | null = null;
afterEach(async () => {
	race = null;
	await site?.dispose();
	site = undefined;
});

const proto = PluginBridge.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
for (const name of ["storageCompareAndSet", "storageDelete", "storageCount", "kvCompareAndSet"]) {
	const method = proto[name]!;
	proto[name] = async function (this: unknown, ...args: unknown[]) {
		if (race?.method === name && --race.nth === 0) {
			const run = race.run;
			race = null;
			await run();
		}
		return method.apply(this, args);
	};
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const guest = (ip: string, method = "POST") => ({ method, meta: { ip, userAgent: null, referer: null, geo: null } });

async function open(install = true) {
	site = await openSite();
	await site.rt.fixtures.collection(roadmapCollection as never);
	await site.rt.fixtures.collection(changelogCollection as never);
	if (install) await site.rt.transport.invokeHook("plugin:install", {});
	return site;
}

async function item(s: Site, title: string) {
	return (await s.rt.fixtures.content("roadmap", { data: { title, stage: "Planned" }, slug: title.toLowerCase().replace(/\W+/g, "-"), status: "published" } as never)).id;
}

const count = async (s: Site, id: string) => ((await s.rt.inspect.storage.get<Row>("tallies", id))?.votes as number | undefined) ?? null;
const rowsOf = async (s: Site, id: string) => (await s.rt.inspect.storage.list<Row>("votes")).filter((row) => row.data.item === id).length;

describe("vote counts under races", () => {
	it("a double click stores one vote and counts it once", async () => {
		const s = await open();
		const id = await item(s, "Double");
		race = { method: "storageCompareAndSet", nth: 1, run: () => s.call("vote", { id }, s.as(ana)) };
		const first = await s.call("vote", { id }, s.as(ana));
		expect(race).toBeNull();
		expect(first).toMatchObject({ ok: true, voted: true });
		expect(await rowsOf(s, id)).toBe(1);
		expect(await count(s, id)).toBe(1);
	});

	it("two first votes on a new item at once both count", async () => {
		const s = await open();
		const id = await item(s, "Fresh");
		// Ben's whole vote runs right before Ana's vote makes the item's count row.
		race = { method: "storageCompareAndSet", nth: 2, run: () => s.call("vote", { id }, s.as(ben)) };
		await s.call("vote", { id }, s.as(ana));
		expect(race).toBeNull();
		expect(await rowsOf(s, id)).toBe(2);
		expect(await count(s, id)).toBe(2);
	});

	it("two take-backs at once take one vote off", async () => {
		const s = await open();
		const id = await item(s, "Twice back");
		await s.call("vote", { id }, s.as(ana));
		await s.call("vote", { id }, s.as(ben));
		race = { method: "storageDelete", nth: 1, run: () => s.call("vote", { id }, s.as(ana, "DELETE")) };
		const first = await s.call("vote", { id }, s.as(ana, "DELETE"));
		expect(first).toMatchObject({ ok: true, code: "NO_VOTE_TO_TAKE_BACK" });
		expect(await rowsOf(s, id)).toBe(1);
		expect(await count(s, id)).toBe(1);
	});

	it("a guest vote and take-back from two tabs leave rows and count equal", async () => {
		const s = await open();
		const id = await item(s, "Tabs");
		await s.call("vote_guest", { id }, guest("198.51.100.4"));
		race = { method: "storageDelete", nth: 1, run: () => s.call("vote_guest", { id }, guest("198.51.100.4")) };
		await s.call("vote_guest", { id }, guest("198.51.100.4", "DELETE"));
		expect(await count(s, id)).toBe(await rowsOf(s, id));
	});

	it("a lost hourly-limit compare-and-set answers BUSY and writes nothing", async () => {
		const s = await open();
		const id = await item(s, "Busy");
		const other = await item(s, "Other");
		race = { method: "kvCompareAndSet", nth: 1, run: () => s.call("vote", { id: other }, s.as(ana)) };
		expect(await s.call("vote", { id }, s.as(ana))).toMatchObject({ ok: false, error: { code: "BUSY" } });
		expect(await rowsOf(s, id)).toBe(0);
		expect(await count(s, other)).toBe(1);
	});

	it("an erase answers ok only when every vote is gone, and every count follows", async () => {
		const s = await open();
		const ids = [];
		for (let i = 0; i < 20; i += 1) ids.push(await item(s, `Erase ${i}`));
		for (const id of ids) {
			await s.rt.fixtures.plugin.storage("votes", `${id}:${ana.id}`, { item: id, member_id: ana.id, createdAt: "2026-10-01T00:00:00.000Z", visitor: "" });
			await s.rt.fixtures.plugin.storage("tallies", id, { v: 4, votes: 1, live: true, seq: 0 });
		}
		const first = await s.call("votes", {}, s.as(ana, "DELETE"));
		expect(first).toMatchObject({ ok: false, error: { code: "BUSY", reason: "MORE" } });
		let last: unknown = first;
		for (let i = 0; i < 10 && (last as { ok?: boolean }).ok !== true; i += 1) last = await s.call("votes", {}, s.as(ana, "DELETE"));
		expect(last).toMatchObject({ ok: true });
		for (const id of ids) expect(await count(s, id)).toBe(0);
	});
});

describe("a merge under races", () => {
	it("a vote on the kept item while its count is checked is not lost", async () => {
		const s = await open();
		const keep = await item(s, "Keep");
		const drop = await item(s, "Drop");
		for (const who of ["m1", "m2", "m3"]) await s.call("vote", { id: drop }, s.as(member(who)));
		await s.call("vote", { id: keep }, s.as(member("m4")));
		const stamp = (await s.rt.inspect.content.get("roadmap", drop)) as { version?: number; updatedAt?: string };
		await s.call("admin", { type: "form_submit", action_id: "merge_items", page: "/ideas", values: { source: `item|${drop}|${stamp.version}~${stamp.updatedAt}`, keep } }, s.as(admin));
		// The vote lands between the count of the kept item and the write of it.
		race = { method: "storageCount", nth: 1, run: () => s.call("vote", { id: keep }, s.as(member("late"))) };
		for (let i = 0; i < 12 && (await s.rt.inspect.setting("merge_job")); i += 1) {
			await settle();
			await s.call("admin", { type: "block_action", action_id: "bg_continue", page: "/ideas" }, s.as(admin));
		}
		expect(race).toBeNull();
		expect(await s.rt.inspect.setting("merge_job")).toBeFalsy();
		expect(await rowsOf(s, keep)).toBe(5);
		expect(await count(s, keep)).toBe(5);
	});
});

describe("the 0.3.0 upgrade under votes", () => {
	async function v3Site(items: number, votes: number) {
		const s = await open(false);
		await s.rt.fixtures.plugin.kv("visitor-salt", "old-salt");
		const ids: string[] = [];
		for (let i = 0; i < items; i += 1) {
			const id = await item(s, `Old ${i}`);
			ids.push(id);
			for (let v = 0; v < votes; v += 1) await s.rt.fixtures.plugin.storage("votes", `${id}:o${v}`, { item: id, member_id: `o${v}`, createdAt: "2026-10-01T00:00:00.000Z", visitor: "" });
			await s.rt.fixtures.plugin.storage("tallies", id, { votes });
		}
		return { s, ids: ids.sort() };
	}
	const step = (s: Site) => s.call("admin", { type: "page_load", page: "/ideas" }, s.as(admin));
	const phase = async (s: Site) => ((await s.rt.inspect.setting<Row>("upgrade_0_4"))?.phase as string | undefined) ?? "";

	it("keeps a guest's 0.3.0 vote theirs: the same salt, so they can take it back after the update", async () => {
		const { s, ids } = await v3Site(1, 0);
		await s.call("vote_guest", { id: ids[0] }, guest("198.51.100.9"));
		for (let i = 0; i < 10 && (await phase(s)) !== "done"; i += 1) await step(s);
		expect(await s.rt.inspect.setting("visitor_salt")).toBe("old-salt");
		expect(await s.call("vote_guest", { id: ids[0] }, guest("198.51.100.9", "DELETE"))).toMatchObject({ ok: true, voted: false });
		expect(await count(s, ids[0]!)).toBe(0);
	});

	it("counts every vote cast before, during and after the rebuild", async () => {
		const { s, ids } = await v3Site(6, 2);
		await s.call("vote", { id: ids[5] }, s.as(ana));
		for (let i = 0; i < 20 && (await phase(s)) !== "done"; i += 1) {
			await step(s);
			await s.call("vote", { id: ids[i % 6] }, s.as(member(`d${i}`)));
		}
		await s.call("vote", { id: ids[0] }, s.as(ben));
		expect(await phase(s)).toBe("done");
		for (const id of ids) expect(await count(s, id), id).toBe(await rowsOf(s, id));
	});

	it("a vote on a 0.3.0 row the rebuild passed is counted from the rows, and the leftover pass keeps it", async () => {
		const { s, ids } = await v3Site(2, 3);
		// A stale 0.3.0 count on an item whose votes were all removed before the update.
		const stale = await item(s, "Stale");
		await s.rt.fixtures.plugin.storage("tallies", stale, { votes: 4 });
		while ((await phase(s)) !== "leftover") await step(s);
		await s.call("vote", { id: stale }, s.as(ana));
		expect(await count(s, stale)).toBe(1);
		while ((await phase(s)) !== "done") await step(s);
		expect(await count(s, stale)).toBe(1);
		for (const id of ids) expect(await count(s, id)).toBe(3);
	});
});

describe("Cloudflare walk finding: a guest vote refused as not on the board", () => {
	it("a guest vote fits the limit on the busy path the walk took", async () => {
		const s = await open();
		const id = await item(s, "Admin voted");
		await s.call("vote", { id }, s.as(admin));
		await settle();
		// 0.3.0 made 18 calls here; Cloudflare failed the 11th (the item read), and the plugin turned
		// that failure into NOT_FOUND. 0.4.0 stays under the limit on this path.
		const { result, calls } = await countBridgeCalls(() => s.call("vote_guest", { id }, guest("203.0.113.50")));
		expect(result).toMatchObject({ ok: true, voted: true, votes: 2 });
		expect(calls.length).toBeLessThanOrEqual(MAX_BRIDGE_CALLS);
	});

	it("a failed item read answers FAILED, never NOT_FOUND, and stores nothing", async () => {
		// The plugin side alone: on Cloudflare a call past the limit rejects like this.
		const { handleVoteGuest } = await import("../src/vote");
		const { loadBoard } = await import("../src/content");
		const tooMany = async () => {
			throw new Error("Too many subrequests");
		};
		const written: string[] = [];
		const ctx = {
			settings: { list: async () => [{ key: "visitor_salt", value: "s" }, { key: "upgrade_0_4", value: { phase: "done" } }], set: async () => undefined },
			kv: { getVersioned: async () => null, compareAndSet: async () => ({ applied: true }) },
			schema: { listCollections: async () => [{ slug: "roadmap" }] },
			content: { get: tooMany, list: tooMany },
			storage: {
				tallies: { get: async () => null, getMany: async () => new Map() },
				votes: { compareAndSet: async (id: string) => (written.push(id), { applied: true }) },
			},
		};
		expect(await handleVoteGuest({ input: { id: "i1" }, request: { method: "POST" }, requestMeta: { ip: "203.0.113.51" } }, ctx as never)).toMatchObject({
			ok: false,
			error: { code: "FAILED" },
		});
		expect(written).toEqual([]);
		// A failed type check is not "missing" either.
		const noSchema = { ...ctx, schema: { listCollections: tooMany } };
		expect(await handleVoteGuest({ input: { id: "i1" }, request: { method: "POST" }, requestMeta: { ip: "203.0.113.51" } }, noSchema as never)).toMatchObject({
			ok: false,
			error: { code: "FAILED" },
		});
		expect(await loadBoard(ctx as never, {})).toMatchObject({ ok: false, error: { code: "FAILED" } });
	});
});
