import type { PluginContext } from "emdash/plugin";

import { left, spend, type Budget } from "./core";
import { KIT_DONE_KEY, SALT_KEY, UPGRADE_KEY, type Settings } from "./settings";
import { freshTally } from "./tally";
import { asRecord, asString } from "./util";
import { OLD_SALT_KEY } from "./visitor";

/**
 * Bringing 0.3.0 data into 0.4.0, one small step per call (Cloudflare allows 10 requests per plugin
 * call). Steps run on Ideas page loads (after the page's own reads) and in the hourly task. The
 * state is the `upgrade_0_4` setting, read with the other settings. Each step reads it with its
 * revision and claims the next state with a compare-and-set BEFORE it writes, so a step runs once
 * when two loads race; the loser does nothing. Every step is at most UPGRADE_STEP calls.
 *
 * 1. `salt`: the guest salt moves from kv into the settings record (or is made there), so a guest
 *    request reads it with the other settings.
 * 2. `kit`: the "visitor pages are set up" answer moves from kv into the settings record.
 * 3. `rebuild`: vote rows are read 100 at a time in item order and each item's count is stored as a
 *    0.4.0 row. An item with more than 100 votes is counted on its own (`big`).
 * 4. `leftover`: 0.3.0 rows the rebuild did not write (items with no votes left, or a vote that
 *    landed after the rebuild passed) become 0.4.0 rows counted from their vote rows.
 * 5. `rates`: 0.3.0 hourly-limit keys (kv `rate:*`, which carry guest hashes) are deleted as many
 *    per step as the budget allows; 0.4.0 keeps these counters in the `rates` collection.
 *
 * Nothing reads content, so a site whose roadmap type is missing never stalls here. Old rows are
 * shown until they are rebuilt; no 0.4.0 change is applied to them (src/tally.ts).
 * ponytail: steps 3 and 4 write whole rows, so a vote landing in the one call between a step's
 * read and its write is missing from that item's count. A later merge or the owner's next vote
 * change on that item does not fix it; it stays one low.
 */
export const UPGRADE_STEP = 4;

export type UpgradeState = { phase: "salt" | "kit" | "rebuild" | "leftover" | "rates" | "done"; after: string; big: string };

export function readUpgrade(raw: unknown): UpgradeState {
	const row = asRecord(raw);
	const phase = asString(row.phase);
	return {
		phase: (["salt", "kit", "rebuild", "leftover", "rates", "done"].includes(phase) ? phase : "salt") as UpgradeState["phase"],
		after: asString(row.after),
		big: asString(row.big),
	};
}

export const upgradeDone = (settings: Pick<Settings, "upgrade">) => readUpgrade(settings.upgrade).phase === "done";

/** No recount is running: the rebuild and leftover passes are over (the 0.3.0 rate keys may still be going). */
export const guestCleanupSafe = (settings: Pick<Settings, "upgrade">) => ["rates", "done"].includes(readUpgrade(settings.upgrade).phase);

/** What the Ideas page says while the upgrade runs. */
export function upgradeLabel(settings: Pick<Settings, "upgrade">): string {
	const phase = readUpgrade(settings.upgrade).phase;
	if (phase === "rebuild" || phase === "leftover") return "Recounting votes from 0.3.0";
	return phase === "rates" ? "Removing 0.3.0 hourly-limit records" : "Moving 0.3.0 settings";
}

/**
 * Run one step when UPGRADE_STEP calls are free. Updates `settings` in place with what the step
 * moved, so the page drawn after it shows the new state. Returns true when the upgrade is done.
 */
export async function upgradeStep(ctx: PluginContext, b: Budget, settings: Settings): Promise<boolean> {
	if (upgradeDone(settings)) return true;
	if (left(b) < UPGRADE_STEP) return false;
	spend(b);
	const seen = await ctx.settings.getVersioned<Record<string, unknown>>(UPGRADE_KEY);
	const state = readUpgrade(seen?.value);
	const rev = seen?.revision ?? null;
	const claim = async (next: UpgradeState) => {
		spend(b);
		const won = (await ctx.settings.compareAndSet(UPGRADE_KEY, rev, next)).applied;
		if (won) settings.upgrade = next;
		return won;
	};
	try {
		if (state.phase === "salt") {
			if (!(await claim({ ...state, phase: "kit" }))) return false;
			if (settings.salt) return false;
			spend(b, 2);
			const old = await ctx.kv.get<string>(OLD_SALT_KEY);
			const salt = typeof old === "string" && old ? old : crypto.randomUUID();
			if ((await ctx.settings.compareAndSet(SALT_KEY, null, salt)).applied) settings.salt = salt;
			return false;
		}
		if (state.phase === "kit") {
			if (!(await claim({ ...state, phase: "rebuild", after: "", big: "" }))) return false;
			if (settings.kitDone !== null) return false;
			spend(b);
			if ((await ctx.kv.get<string>("kit_pages_done")) !== "1") return false;
			spend(b);
			if ((await ctx.settings.compareAndSet(KIT_DONE_KEY, null, true)).applied) settings.kitDone = true;
			return false;
		}
		if (state.phase === "rebuild") {
			if (state.big) {
				if (!(await claim({ ...state, after: state.big, big: "" }))) return false;
				spend(b, 2);
				const votes = await ctx.storage.votes.count({ item: state.big });
				await ctx.storage.tallies.put(state.big, freshTally(votes, false));
				return false;
			}
			spend(b);
			const found = await ctx.storage.votes.query({
				where: state.after ? { item: { gt: state.after } } : {},
				orderBy: { item: "asc" },
				limit: 100,
			});
			const byItem = new Map<string, number>();
			for (const row of found.items) {
				const item = asString(asRecord(row.data).item);
				if (item) byItem.set(item, (byItem.get(item) ?? 0) + 1);
			}
			const items = [...byItem.keys()];
			if (!items.length) {
				await claim({ phase: "leftover", after: "", big: "" });
				return false;
			}
			// With more to read, the last item may go on in the next read. A read that is all one item
			// is that item's first 100 votes: it is counted on its own in the next step.
			if (found.hasMore && items.length === 1) {
				await claim({ ...state, big: items[0]! });
				return false;
			}
			const complete = found.hasMore ? items.slice(0, -1) : items;
			const next: UpgradeState = found.hasMore ? { ...state, after: complete[complete.length - 1]! } : { phase: "leftover", after: "", big: "" };
			if (!(await claim(next))) return false;
			spend(b);
			await ctx.storage.tallies.putMany(complete.map((id) => ({ id, data: freshTally(byItem.get(id) ?? 0, false) })));
			return false;
		}
		if (state.phase === "rates") {
			// Deleting is safe to repeat, so only the move to done is claimed.
			spend(b);
			const keys = await ctx.kv.list("rate:");
			if (!keys.length) return await claim({ phase: "done", after: "", big: "" });
			for (const { key } of keys) {
				if (!spend(b)) break;
				await ctx.kv.delete(key);
			}
			return false;
		}
		// leftover: 0.3.0 rows the rebuild did not write. Normally they have no votes; a vote that
		// landed after the rebuild passed, or a rebuild write that failed, is counted here. The batch
		// is safe to run twice, so only the move to done is claimed.
		spend(b);
		const old = await ctx.storage.tallies.query({ where: { v: null }, limit: 100 });
		if (!old.items.length) return await claim({ phase: "rates", after: "", big: "" }) && false;
		const ids = old.items.map((row) => row.id);
		spend(b);
		const found = await ctx.storage.votes.query({ where: { item: { in: ids } }, orderBy: { item: "asc" }, limit: 100 });
		const counts = new Map<string, number>(ids.map((id) => [id, 0]));
		for (const row of found.items) {
			const item = asString(asRecord(row.data).item);
			if (counts.has(item)) counts.set(item, (counts.get(item) ?? 0) + 1);
		}
		if (found.hasMore) {
			// Items at or after the last one read may have more rows: count the first of them alone,
			// leave the rest for the next step.
			const last = asString(asRecord(found.items[found.items.length - 1]?.data).item);
			spend(b);
			counts.set(last, await ctx.storage.votes.count({ item: last }));
			for (const id of ids) if (id > last) counts.delete(id);
		}
		spend(b);
		await ctx.storage.tallies.putMany([...counts].map(([id, votes]) => ({ id, data: freshTally(votes, false) })));
		return false;
	} catch {
		// Tried again on the next step. A step that claimed and then failed is redone by the leftover pass.
		return false;
	}
}
