import type { PluginContext } from "emdash/plugin";

import { itemStamp, publishNow, unpublishNow } from "./content";
import { left, spend, type Budget } from "./core";
import { firstStage, MERGE_KEY, type Settings } from "./settings";
import { freshTally, V } from "./tally";
import { asRecord, asString, rows } from "./util";
import { anonymousVoteId } from "./vote";

export type IdeaRow = {
	id: string;
	title: string;
	description: string;
	status: string;
	rev: string;
	member_id: string;
	name: string;
	visitor: string;
	/** Sent by a guest. Stays true after the hourly task clears the visitor hash. */
	guest: boolean;
	createdAt: string;
};

export function ideaFrom(row: { id: string } & Record<string, unknown>): IdeaRow {
	return {
		id: row.id,
		title: asString(row.title),
		description: asString(row.description),
		status: asString(row.status) || "pending",
		rev: asString(row.rev),
		member_id: asString(row.member_id),
		name: asString(row.name),
		visitor: asString(row.visitor),
		guest: row.guest === true || Boolean(asString(row.visitor)),
		createdAt: asString(row.createdAt),
	};
}

/** Waiting ideas, newest first, up to 100 (one read). `more`: there are over 100. */
export async function listPendingIdeas(ctx: PluginContext): Promise<{ ideas: IdeaRow[]; more: boolean }> {
	const found = await ctx.storage.ideas.query({ where: { status: "pending" }, orderBy: { createdAt: "desc" }, limit: 100 });
	const ideas: IdeaRow[] = [];
	for (const item of found.items) {
		try {
			ideas.push(ideaFrom({ ...asRecord(item.data), id: item.id }));
		} catch {
			// One bad row must not stop the queue.
		}
	}
	return { ideas, more: found.hasMore };
}

/**
 * Guarded decision: applies only while the idea is still waiting with the revision the admin saw,
 * so a decision or a cleanup that landed in between is never overwritten. One call. Returns the
 * idea after the write, or null.
 */
async function decide(ctx: PluginContext, id: string, rev: string, status: string): Promise<IdeaRow | null> {
	if (!id || !rev) return null;
	const done = await ctx.storage.ideas.updateIf(id, {
		where: { status: "pending", rev },
		set: { status, rev: crypto.randomUUID() },
	});
	return done.applied ? ideaFrom({ ...asRecord(done.data), id }) : null;
}

const CHANGED_IDEA = "That idea changed after this page loaded.";

/**
 * Approve: the draft the member wrote is published as the first stage shown. Five calls: the draft,
 * the claim, the update, and the revision and publish. A failure after the claim puts the idea
 * back in the list (one more).
 */
export async function approveIdea(
	ctx: PluginContext,
	settings: Settings,
	id: string,
	rev: string,
): Promise<{ ok: true; settled?: true } | { ok: false; error: string }> {
	if (!id || !rev) return { ok: false, error: CHANGED_IDEA };
	const collection = settings.collection;
	const item = await ctx.content?.get(collection, id).catch(() => null);
	if (!item || !ctx.content?.update) return { ok: false, error: "That draft is no longer there." };
	// Published from the content editor already: the idea is done.
	if (item.status === "published") {
		return (await decide(ctx, id, rev, "approved")) ? { ok: true, settled: true } : { ok: false, error: CHANGED_IDEA };
	}
	// Someone edited the draft since it was suggested. Those edits sit in a draft revision this plugin
	// cannot show, so approving here would publish text nobody on this screen has seen. The owner publishes
	// it from the content editor instead; the idea then leaves this queue.
	if (item.draftRevisionId) {
		return {
			ok: false,
			error: "This idea's draft has unpublished edits. Open it in Roadmap content, check it and publish it there. It then leaves this list.",
		};
	}
	// Claim the idea first: a reject or merge that landed after the read above wins.
	const idea = await decide(ctx, id, rev, "approved");
	if (!idea) return { ok: false, error: CHANGED_IDEA };
	const back = () =>
		ctx.storage.ideas.updateIf(id, { where: { status: "approved", rev: idea.rev }, set: { status: "pending", rev: crypto.randomUUID() } }).catch(() => undefined);
	try {
		await ctx.content.update(collection, id, {
			...item.data,
			title: asString(asRecord(item.data).title) || idea.title,
			description: asString(asRecord(item.data).description) || idea.description,
			stage: firstStage(settings.stages).name,
		});
	} catch {
		await back();
		return { ok: false, error: "Could not save the idea. It is back in the list; try again." };
	}
	if (!(await publishNow(ctx, collection, id).catch(() => false))) {
		await back();
		return { ok: false, error: "Could not publish. Open the item in content admin and publish it there." };
	}
	return { ok: true };
}

/** One call. */
export async function rejectIdea(ctx: PluginContext, id: string, rev: string): Promise<{ ok: true } | { ok: false; error: string }> {
	return (await decide(ctx, id, rev, "rejected")) ? { ok: true } : { ok: false, error: CHANGED_IDEA };
}

/**
 * The content:afterPublish part for ideas: an idea whose draft the owner published from the
 * content editor is done. One call; nothing happens unless it was still waiting.
 */
export async function settleIdea(ctx: PluginContext, id: string): Promise<void> {
	await ctx.storage.ideas.updateIf(id, { where: { status: "pending" }, set: { status: "approved", rev: crypto.randomUUID() } }).catch(() => undefined);
}

export type MergeSource = { kind: "idea" | "item"; id: string; stamp: string };

/** Admin form values carry what the admin saw: "idea|<id>|<rev>" or "item|<id>|<stamp>". */
export function mergeSourceValue(source: MergeSource): string {
	return `${source.kind}|${source.id}|${source.stamp}`;
}

export function parseMergeSource(value: string): MergeSource | null {
	const [kind = "", id = "", ...rest] = value.split("|");
	if ((kind !== "idea" && kind !== "item") || !id) return null;
	return { kind, id, stamp: rest.join("|") };
}

const CHANGED = { ok: false as const, error: "That item changed after this page loaded. Check it and try again." };

/**
 * A merge in progress, kept in the settings record (read with the other settings, so showing it
 * costs nothing). Its steps run a few calls at a time (mergeStep): unpublish the dropped item and
 * add the redirect, move its votes 100 at a time, count the kept item again, then close.
 */
export type MergeJob = {
	from: string;
	keep: string;
	kind: "idea" | "item";
	fromTitle: string;
	keepTitle: string;
	fromSlug: string;
	keepSlug: string;
	phase: "unpublish" | "votes" | "count" | "close";
};

export function readJob(raw: Record<string, unknown> | null): MergeJob | null {
	if (!raw) return null;
	const from = asString(raw.from);
	const keep = asString(raw.keep);
	const phase = asString(raw.phase);
	if (!from || !keep || !["unpublish", "votes", "count", "close"].includes(phase)) return null;
	return {
		from,
		keep,
		kind: raw.kind === "idea" ? "idea" : "item",
		fromTitle: asString(raw.fromTitle),
		keepTitle: asString(raw.keepTitle),
		fromSlug: asString(raw.fromSlug),
		keepSlug: asString(raw.keepSlug),
		phase: phase as MergeJob["phase"],
	};
}

/**
 * Start a merge: check both items, then claim the one merge slot and the waiting idea. Four calls,
 * five when the idea changed (the slot is given back). Votes move in later steps.
 */
export async function mergeItems(
	ctx: PluginContext,
	settings: Settings,
	from: MergeSource | null,
	keepId: string,
): Promise<{ ok: true; job: MergeJob } | { ok: false; error: string }> {
	if (!from || !keepId) return { ok: false, error: "Pick two different items." };
	const sourceId = from.id;
	if (sourceId === keepId) return { ok: false, error: "Pick a different item to keep." };
	if (readJob(settings.mergeJob)) return { ok: false, error: "A merge is still moving votes. Let it finish, then merge again." };
	// Every merge carries the stamp of what the admin saw, for an idea and for an item alike.
	if (!from.stamp) return CHANGED;
	const collection = settings.collection;
	const source = await ctx.content?.get(collection, sourceId).catch(() => null);
	const keep = await ctx.content?.get(collection, keepId).catch(() => null);
	if (!source || !keep) return { ok: false, error: "One of those items is no longer there." };
	if (from.kind === "item" && itemStamp(source) !== from.stamp) return CHANGED;
	if (keep.status !== "published") return { ok: false, error: "Keep a published item." };
	const job: MergeJob = {
		from: sourceId,
		keep: keepId,
		kind: from.kind,
		fromTitle: asString(asRecord(source.data).title) || source.slug || sourceId,
		keepTitle: asString(asRecord(keep.data).title) || keep.slug || keepId,
		fromSlug: source.slug || "",
		keepSlug: keep.slug || "",
		phase: "unpublish",
	};
	if (!(await ctx.settings.compareAndSet(MERGE_KEY, null, job)).applied) {
		return { ok: false, error: "A merge is still moving votes. Let it finish, then merge again." };
	}
	// A waiting idea is claimed before anything moves, so an approve in between wins.
	if (from.kind === "idea") {
		const claimed = await ctx.storage.ideas
			.updateIf(sourceId, { where: { status: "pending", rev: from.stamp }, set: { status: "merged", rev: crypto.randomUUID() } })
			.catch(() => ({ applied: false as const }));
		if (!claimed.applied) {
			await ctx.settings.delete(MERGE_KEY).catch(() => false);
			return { ok: false, error: CHANGED_IDEA };
		}
	}
	return { ok: true, job };
}

/** Calls one merge step needs at most. */
export const MERGE_STEP = 4;

/**
 * One step of the merge in progress, when MERGE_STEP calls are free. Every step can run twice
 * (two admin tabs, the hourly task) without harm: the unpublish and the redirect check first,
 * moved votes are written under their new id (the same id twice is one row), and the count is
 * stored only if no vote moved the kept item's count meanwhile. Returns the job after the step.
 */
export async function mergeStep(ctx: PluginContext, b: Budget, settings: Settings): Promise<MergeJob | null> {
	const job = readJob(settings.mergeJob);
	if (!job || left(b) < MERGE_STEP) return job;
	const collection = settings.collection;
	const next = async (phase: MergeJob["phase"] | null) => {
		spend(b);
		if (phase) await ctx.settings.set(MERGE_KEY, { ...job, phase });
		else await ctx.settings.delete(MERGE_KEY);
		return phase ? { ...job, phase } : null;
	};
	try {
		if (job.phase === "unpublish") {
			spend(b, 2);
			await unpublishNow(ctx, collection, job.from);
			const fromPath = `/${collection}/${job.fromSlug || job.from}`;
			const toPath = `/${collection}/${job.keepSlug || job.keep}`;
			if (ctx.redirects?.create && job.fromSlug && job.keepSlug && fromPath !== toPath && spend(b)) {
				await ctx.redirects.create({ source: fromPath, destination: toPath, type: 301 }).catch(() => undefined);
			}
			return await next("votes");
		}
		if (job.phase === "votes") {
			spend(b);
			const found = await ctx.storage.votes.query({ where: { item: job.from }, limit: 100 });
			if (!found.items.length) return await next("count");
			const moving = found.items.map((row) => ({ id: row.id, data: asRecord(row.data) }));
			const target = (row: { data: Record<string, unknown> }) => `${job.keep}:${personKey(row.data)}`;
			spend(b);
			const already = await ctx.storage.votes.getMany(moving.filter((row) => personKey(row.data)).map(target));
			// One vote per person: someone who voted on both keeps the vote on the kept item.
			const put = moving
				.filter((row) => personKey(row.data) && !already.has(target(row)))
				.map((row) => ({
					id: target(row),
					data: {
						item: job.keep,
						member_id: asString(row.data.member_id) || personKey(row.data),
						createdAt: asString(row.data.createdAt),
						visitor: asString(row.data.visitor),
					},
				}));
			if (put.length) {
				spend(b);
				await ctx.storage.votes.putMany(put);
			}
			spend(b);
			await ctx.storage.votes.deleteMany(moving.map((row) => row.id));
			return job;
		}
		if (job.phase === "count") {
			// The kept item's count, from its vote rows, stored only if no vote moved it meanwhile.
			spend(b);
			const stored = asRecord(await ctx.storage.tallies.get(job.keep));
			spend(b);
			const votes = await ctx.storage.votes.count({ item: job.keep });
			spend(b);
			if (stored.v === V) {
				const done = await ctx.storage.tallies.updateIf(job.keep, { where: { v: V, seq: Number(stored.seq) || 0 }, set: { votes } });
				if (!done.applied) return job;
			} else {
				// ponytail: no 0.4.0 row yet (the upgrade has not reached it); a vote in this one call is missed.
				await ctx.storage.tallies.put(job.keep, freshTally(votes));
			}
			return await next("close");
		}
		// close: the dropped item's count goes, and a waiting idea for it is marked merged.
		spend(b);
		await ctx.storage.tallies.delete(job.from);
		if (job.kind === "item" && spend(b)) {
			await ctx.storage.ideas.updateIf(job.from, { where: { status: "pending" }, set: { status: "merged", rev: crypto.randomUUID() } }).catch(() => undefined);
		}
		return await next(null);
	} catch {
		// The step is tried again next time; nothing it did is lost.
		return job;
	}
}

function personKey(row: Record<string, unknown>): string {
	return asString(row.member_id) || (asString(row.visitor) ? `v-${asString(row.visitor)}` : "");
}

/** How long a guest's salted address stays on a row: it stops repeat votes inside this window. */
export const GUEST_HASH_DAYS = 30;

const oldGuest = (now: number) => ({
	visitor: { gt: "" },
	createdAt: { lt: new Date(now - GUEST_HASH_DAYS * 24 * 60 * 60 * 1000).toISOString() },
});

/**
 * Hourly, a batch at a time: drop the salted visitor hash from guest votes older than the window.
 * The vote stays. Its row id carries the hash, so it moves to an anonymous id with the same item:
 * the count does not change. Three calls for up to 100 votes. Returns how many moved, or null when
 * the budget had no room.
 * ponytail: a guest taking a vote back in the same second as this batch reads it can see it come
 * back under the anonymous id (the delete of 100 cannot say which rows another call removed).
 */
export async function forgetGuestVotes(ctx: PluginContext, b: Budget, now = Date.now()): Promise<number | null> {
	if (left(b) < 3) return null;
	spend(b);
	const batch = rows(await ctx.storage.votes.query({ where: oldGuest(now), limit: 100 }));
	if (!batch.length) return 0;
	spend(b);
	const gone = await ctx.storage.votes.deleteMany(batch.map((row) => row.id));
	if (gone !== batch.length) return 0;
	const moved = await Promise.all(
		batch.map(async (row) => {
			const item = asString(row.item);
			const anon = await anonymousVoteId(item, row.id);
			return { id: anon, data: { item, member_id: anon.slice(item.length + 1), createdAt: asString(row.createdAt), visitor: "" } };
		}),
	);
	spend(b);
	await ctx.storage.votes.putMany(moved);
	return moved.length;
}

/** Hourly: drop the hash from old guest ideas, one guarded write each, as many as the budget allows. */
export async function forgetGuestIdeas(ctx: PluginContext, b: Budget, now = Date.now()): Promise<number | null> {
	if (left(b) < 2) return null;
	spend(b);
	const batch = rows(await ctx.storage.ideas.query({ where: oldGuest(now), limit: left(b) }));
	let done = 0;
	for (const row of batch) {
		if (!spend(b)) break;
		// Touches only these two fields, and only while the hash is still the one read here.
		const applied = await ctx.storage.ideas.updateIf(row.id, { where: { visitor: asString(row.visitor) }, set: { visitor: "", guest: true } });
		if (applied.applied) done += 1;
	}
	return done;
}

/** Hourly: drop hourly-limit counters whose hour is over (their key carries the hash), as many as the budget allows. */
export async function forgetRateKeys(ctx: PluginContext, b: Budget, now = Date.now()): Promise<number | null> {
	if (left(b) < 2) return null;
	spend(b);
	let done = 0;
	for (const entry of await ctx.kv.list("rate:")) {
		const start = Number(String(entry.value ?? "").split("|")[0]) || 0;
		if (now - start <= 60 * 60 * 1000) continue;
		if (!spend(b)) break;
		if (await ctx.kv.delete(entry.key)) done += 1;
	}
	return done;
}

