import type { PluginContext } from "emdash/plugin";

import type { Settings } from "./settings";
import { asNumber, asRecord } from "./util";

/**
 * Vote counts, one `tallies` row per item (id = item id). Vote rows stay the source of truth; this
 * row lets the board show counts in one read.
 *
 * 0.4.0 rows carry `v: 4` and are moved by in-database increments (`updateIf` with a delta) in the
 * same call as the vote write, never by counting the votes again. `live` is true while the item is
 * published, kept by the content hooks, a merge and the first vote that confirms it; a vote never
 * trusts it and reads the entry itself. `seq` goes up with every change, so a recount that raced a vote is not stored.
 *
 * 0.3.0 rows (`{ votes }`, no `v`) were recounted on every vote, and on Cloudflare a vote could stop
 * before that recount. They are shown until the upgrade (src/upgrade.ts) rebuilds them from the
 * vote rows, and no 0.4.0 change is applied to them.
 */
export const V = 4;

export type Tally = { v4: boolean; votes: number; live: boolean };

type Ctx = Pick<PluginContext, "storage">;

export function readTally(data: unknown): Tally | null {
	if (data === null || data === undefined) return null;
	const row = asRecord(data);
	return { v4: row.v === V, votes: Math.max(0, asNumber(row.votes) ?? 0), live: row.v === V && row.live === true };
}

export function freshTally(votes: number, live = true): Record<string, unknown> {
	return { v: V, votes, live, seq: 0 };
}

/**
 * Whether the upgrade has already counted this item's votes, so a missing row means it has none.
 * Before that, the upgrade counts it from its vote rows and a vote leaves the row alone.
 */
export function counted(settings: Pick<Settings, "upgrade">, item: string): boolean {
	const phase = String(settings.upgrade.phase ?? "");
	if (phase === "leftover" || phase === "rates" || phase === "done") return true;
	return phase === "rebuild" && typeof settings.upgrade.after === "string" && settings.upgrade.after !== "" && item <= settings.upgrade.after;
}

/** +1 or -1 on a 0.4.0 row, in one guarded write. Returns the stored count, or null when the item has no 0.4.0 row. Never throws. */
export async function moveTally(ctx: Ctx, item: string, change: 1 | -1, setLive = false): Promise<number | null> {
	const done = await ctx.storage.tallies
		.updateIf(item, {
			where: change < 0 ? { v: V, votes: { gt: 0 } } : { v: V },
			...(setLive ? { set: { live: true } } : {}),
			delta: { votes: change > 0 ? { inc: 1 } : { dec: 1 }, seq: { inc: 1 } },
		})
		.catch(() => ({ applied: false as const }));
	return done.applied ? (readTally(done.data)?.votes ?? 0) : null;
}

/**
 * Make sure a counted item has a row before its vote is written: a zero row created only when there
 * is none, so the vote's own +1 then lands on it. One call. Never throws.
 */
export async function ensureTally(ctx: Ctx, item: string): Promise<void> {
	await ctx.storage.tallies.compareAndSet(item, null, freshTally(0)).catch(() => undefined);
}

/** Mark an item's row live or not, when it has a 0.4.0 row. One call. Never throws. */
export async function setLive(ctx: Ctx, item: string, live: boolean): Promise<boolean> {
	const done = await ctx.storage.tallies.updateIf(item, { where: { v: V }, set: { live } }).catch(() => ({ applied: false as const }));
	return done.applied;
}
