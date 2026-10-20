import type { PluginContext } from "emdash/plugin";

import {
	BUSY,
	FAILED,
	GUEST_UNAVAILABLE,
	MAX_CALLS,
	MEMBERS_ONLY,
	NO_VISITOR,
	SIGN_IN,
	SPAM,
	budget,
	left,
	rateLimit,
	rateRefusal,
	roadmapReady,
	spend,
	type Budget,
	type Member,
} from "./core";
import { findStage, loadSettings, type Settings } from "./settings";
import { counted, freshTally, moveTally, readTally, type Tally } from "./tally";
import { asRecord, asString, nowIso } from "./util";
import { noteGuestAddress, requestGuest, siteSalt, visitorHash, visitorWho } from "./visitor";

export const NOT_FOUND = {
	ok: false,
	error: { code: "NOT_FOUND", message: "That item is not on the board." },
};

type Route = {
	input: unknown;
	request: { method: string };
	user?: Member;
	requestMeta?: unknown;
};

export type VoteOk = { ok: true; votes: number; voted: boolean };

export function voteRowId(itemId: string, who: string): string {
	return `${itemId}:${who}`;
}

/** The key a guest vote moves to once the 30-day cleanup drops its hash. Same old row, same key. */
export async function anonymousVoteId(itemId: string, oldRowId: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(oldRowId));
	const hex = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
	return voteRowId(itemId, `g-${hex}`);
}

/** Settings already read, or read now (one call). */
async function settingsOf(ctx: PluginContext, b: Budget, settings: Settings | null): Promise<Settings> {
	if (settings) return settings;
	spend(b);
	return loadSettings(ctx);
}

/**
 * Whether the item is on the board, read from the entry on every vote write: a stored flag can be
 * stale (a hook that failed, an unpublish it never saw), so it is never trusted for this. The type
 * check runs only when the item has no count row yet (a row means the type existed). A read that
 * fails answers "failed", never "missing": on Cloudflare a call past the limit fails, and 0.3.0
 * turned that into "That item is not on the board" for guests (walk finding, 2026-10-19).
 */
async function onBoard(ctx: PluginContext, b: Budget, settings: Settings, item: string, hasRow: boolean): Promise<"live" | "missing" | "failed"> {
	if (!ctx.content) return "missing";
	if (!hasRow) {
		spend(b);
		const ready = await roadmapReady(ctx, settings.collection);
		if (ready === null) return "failed";
		if (!ready) return "missing";
	}
	spend(b);
	try {
		const entry = await ctx.content.get(settings.collection, item);
		return entry?.status === "published" ? "live" : "missing";
	} catch {
		return "failed";
	}
}

/**
 * One vote per voter per published item. The vote row is created with a compare-and-set, so a
 * double click or two tabs store it once and count it once. The count moves in the same call:
 * +1 on a 0.4.0 row; a 0.3.0 row the upgrade already passed is counted again from the vote rows;
 * a row the upgrade has not reached yet is left to it. Worst case 7 calls after the caller's own
 * (settings, type check, entry, vote, count row, +1).
 */
async function castVote(
	ctx: PluginContext,
	b: Budget,
	known: Settings | null,
	item: string,
	who: string,
	row: { member_id: string; visitor: string },
) {
	if (!item) return NOT_FOUND;
	let tally: Tally | null;
	spend(b);
	try {
		tally = readTally(await ctx.storage.tallies.get(item));
	} catch {
		return FAILED;
	}
	const settings = await settingsOf(ctx, b, known);
	const here = await onBoard(ctx, b, settings, item, tally !== null);
	if (here === "failed") return FAILED;
	if (here === "missing") return NOT_FOUND;
	const isCounted = counted(settings, item);
	const plan = tally?.v4 ? "move" : !tally && isCounted ? "create" : tally && isCounted ? "recount" : "upgrade";
	// The write and the count change it needs must both fit, or nothing is written.
	const need = { move: 2, create: 3, recount: 3, upgrade: 1 }[plan];
	if (left(b) < need) return BUSY;
	try {
		spend(b);
		const made = await ctx.storage.votes.compareAndSet(voteRowId(item, who), null, { item, ...row, createdAt: nowIso() });
		if (!made.applied) return { ok: true, votes: Math.max(tally?.votes ?? 0, 1), voted: true } satisfies VoteOk;
	} catch {
		return FAILED;
	}
	// The vote is stored: nothing below can fail the answer.
	const guess = (tally?.votes ?? 0) + 1;
	if (plan === "create") {
		// The item's first counted vote makes its row at 1. Another first vote that made it a moment
		// earlier means this one is added to it instead.
		spend(b);
		const made = await ctx.storage.tallies.compareAndSet(item, null, freshTally(1)).catch(() => ({ applied: false }));
		if (made.applied) return { ok: true, votes: 1, voted: true } satisfies VoteOk;
	}
	if (plan === "move" || plan === "create") {
		spend(b);
		return { ok: true, votes: (await moveTally(ctx, item, 1, !tally?.live)) ?? guess, voted: true } satisfies VoteOk;
	}
	if (plan === "recount") return { ok: true, votes: (await recount(ctx, b, item)) ?? guess, voted: true } satisfies VoteOk;
	return { ok: true, votes: guess, voted: true } satisfies VoteOk;
}

/**
 * A 0.3.0 row on an item the upgrade already passed: count the votes and store a 0.4.0 row. Two
 * calls. ponytail: a vote landing between the count and the write is missing from it (one call wide).
 */
async function recount(ctx: PluginContext, b: Budget, item: string): Promise<number | null> {
	spend(b);
	const n = await ctx.storage.votes.count({ item }).catch(() => null);
	if (n === null) return null;
	spend(b);
	await ctx.storage.tallies.put(item, freshTally(n)).catch(() => undefined);
	return n;
}

/**
 * Take a vote back. The delete says whether this call removed it, so two take-backs at once take
 * one off the count. Nothing to take back: no write, no recount, and the reason is said plainly.
 */
async function dropVote(ctx: PluginContext, b: Budget, known: Settings | null, item: string, who: string) {
	if (!item) return NOT_FOUND;
	const id = voteRowId(item, who);
	let removed: boolean;
	spend(b);
	try {
		removed = await ctx.storage.votes.delete(id);
	} catch {
		return FAILED;
	}
	if (!removed) {
		// forgotten_guest: the vote is older than 30 days and no longer carries the guest's address.
		// already_removed: taken back before (another tab, another device), or never cast.
		let forgotten = false;
		if (who.startsWith("v-") && spend(b)) forgotten = await ctx.storage.votes.exists(await anonymousVoteId(item, id)).catch(() => false);
		let votes = 0;
		if (spend(b)) votes = readTally(await ctx.storage.tallies.get(item).catch(() => null))?.votes ?? 0;
		return {
			ok: true,
			votes,
			voted: false,
			code: "NO_VOTE_TO_TAKE_BACK" as const,
			reason: forgotten ? ("forgotten_guest" as const) : ("already_removed" as const),
		};
	}
	// The vote is gone: nothing below can fail the answer.
	spend(b);
	const moved = await moveTally(ctx, item, -1);
	if (moved !== null) return { ok: true, votes: moved, voted: false } satisfies VoteOk;
	// No 0.4.0 row: a 0.3.0 row (counted again when the upgrade passed it, else left to it) or none.
	if (!spend(b)) return { ok: true, votes: 0, voted: false } satisfies VoteOk;
	const tally = readTally(await ctx.storage.tallies.get(item).catch(() => null));
	if (!tally) return { ok: true, votes: 0, voted: false } satisfies VoteOk;
	const guess = Math.max(0, tally.votes - 1);
	if (left(b) >= 3) {
		const settings = await settingsOf(ctx, b, known).catch(() => null);
		if (settings && counted(settings, item) && left(b) >= 2) {
			return { ok: true, votes: (await recount(ctx, b, item)) ?? guess, voted: false } satisfies VoteOk;
		}
	}
	return { ok: true, votes: guess, voted: false } satisfies VoteOk;
}

/** One vote per signed-in member per published item. Click again (DELETE) takes it back. */
export async function handleVote(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	// POST reads JSON. DELETE has no body on EmDash, so the id comes from the query string.
	const itemId = asString(asRecord(routeCtx.input).id);
	const method = routeCtx.request.method;
	const b = budget();
	if (method === "DELETE") return dropVote(ctx, b, null, itemId, user.id);
	if (method !== "POST") return SIGN_IN;
	spend(b, 2);
	const limit = rateRefusal(await rateLimit(ctx, `vote:${user.id}`));
	if (limit) return limit;
	return castVote(ctx, b, null, itemId, user.id, { member_id: user.id, visitor: "" });
}

export async function handleVoteGuest(routeCtx: Route, ctx: PluginContext) {
	const raw = asRecord(routeCtx.input);
	if (asString(raw.website) || asString(raw.honeypot)) return SPAM;
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (settings.who === "members") return MEMBERS_ONLY;
	// No visitor address from the host: guests cannot be told apart, so they cannot write (#51).
	const guest = requestGuest(routeCtx);
	if (!guest) {
		await noteGuestAddress(ctx, b, settings, false);
		return GUEST_UNAVAILABLE;
	}
	const salt = await siteSalt(ctx, b, settings);
	if (!salt) return BUSY;
	const hash = await visitorHash(salt, guest);
	const who = visitorWho(hash);
	const itemId = asString(raw.id);
	const method = routeCtx.request.method;

	let answer: unknown;
	if (method === "DELETE") answer = await dropVote(ctx, b, settings, itemId, who);
	else if (method !== "POST") return NO_VISITOR;
	else {
		spend(b, 2);
		answer = rateRefusal(await rateLimit(ctx, `vote:${who}`)) ?? (await castVote(ctx, b, settings, itemId, who, { member_id: who, visitor: hash }));
	}
	// Last, and only with a call to spare: it can never fail the answer.
	await noteGuestAddress(ctx, b, settings, true);
	return answer;
}

function ideaStatus(status: string): string {
	if (status === "approved") return "On the board";
	if (status === "rejected") return "Not published";
	return "Waiting for a decision";
}

/** Pages of 100 vote rows `votes` GET reads (the newest first), and pages of published items it names them from. */
const MINE_PAGES = 3;
const ITEM_PAGES = 2;

/** Ids the caller voted for, so the board can mark them after a cached page loads. At most 8 calls. */
export async function listMyVotes(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	if (routeCtx.request.method === "DELETE") return eraseMyVotes(ctx, user.id);
	const ids: string[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < MINE_PAGES; page += 1) {
		const found = await ctx.storage.votes.query({ where: { member_id: user.id }, orderBy: { createdAt: "desc" }, limit: 100, cursor });
		for (const row of found.items) {
			const item = asString(asRecord(row.data).item);
			if (item) ids.push(item);
		}
		if (!found.hasMore || !found.cursor) break;
		cursor = found.cursor;
	}
	const settings = await loadSettings(ctx);
	const byId = new Map<string, { title: string; slug: string; stage: string }>();
	if (ids.length && ctx.content && (await roadmapReady(ctx, settings.collection))) {
		let at: string | undefined;
		try {
			for (let page = 0; page < ITEM_PAGES; page += 1) {
				const found = await ctx.content.list(settings.collection, { limit: 100, cursor: at, where: { status: "published" } });
				for (const item of found.items) {
					const data = asRecord(item.data);
					byId.set(item.id, { title: asString(data.title) || item.slug || item.id, slug: item.slug || "", stage: asString(data.stage) });
				}
				if (!found.hasMore || !found.cursor) break;
				at = found.cursor;
			}
		} catch {
			// Names are extra: the ids still mark the board.
		}
	}
	const items = ids.flatMap((id) => {
		const item = byId.get(id);
		if (!item) return [];
		return [{ id, title: item.title, slug: item.slug, stage: findStage(settings.stages, item.stage)?.name || item.stage }];
	});
	const ideaRows = await ctx.storage.ideas.query({ where: { member_id: user.id }, limit: 50 });
	const ideas = ideaRows.items
		.map((row) => asRecord(row.data))
		.map((row) => ({ title: asString(row.title), status: ideaStatus(asString(row.status)) }))
		.filter((idea) => idea.title);
	return { ok: true, ids, items, ideas };
}

/** Votes one erase call removes. Each needs its own count change; the kit calls again on MORE. */
export const ERASE_BATCH = MAX_CALLS - 2;

/**
 * Drops this member's votes, a few per call. The member id comes from the session, never the
 * request. Answers ok only when none are left, so the kit never says done early; otherwise BUSY
 * with reason MORE, and the kit calls again.
 */
async function eraseMyVotes(ctx: PluginContext, userId: string) {
	const found = await ctx.storage.votes.query({ where: { member_id: userId }, limit: ERASE_BATCH });
	if (!found.items.length) return { ok: true, erased: 0 };
	const ids = found.items.map((row) => row.id);
	const gone = await ctx.storage.votes.deleteMany(ids);
	// The votes are gone: nothing below can fail the answer. Each member vote is on its own item, and
	// every one of them takes its count down by one (never below zero).
	// ponytail: when a take-back in another tab removed one of these at the same moment, this call
	// cannot tell which; that item's count ends one low instead of the other six one high.
	for (const row of found.items) {
		const item = asString(asRecord(row.data).item);
		if (item) await moveTally(ctx, item, -1);
	}
	if (found.hasMore) return { ok: false, erased: gone, error: { code: "BUSY", reason: "MORE", message: "More votes to remove. Try again." } };
	return { ok: true, erased: gone };
}
