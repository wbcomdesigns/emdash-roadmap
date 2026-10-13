import type { PluginContext } from "emdash/plugin";

import { MEMBERS_ONLY, NO_VISITOR, RATE_LIMITED, SIGN_IN, SPAM, collectionName, rateLimited, type Member } from "./core";
import { loadSettings } from "./settings";
import { asRecord, asString, nowIso, rows } from "./util";
import { requestIp, visitorHash, visitorWho } from "./visitor";

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

export async function publishedItem(ctx: PluginContext, id: string): Promise<boolean> {
	if (!id || !ctx.content) return false;
	const collection = await collectionName(ctx);
	const item = await ctx.content.get(collection, id).catch(() => null);
	return item?.status === "published";
}

export async function recount(ctx: PluginContext, itemId: string): Promise<number> {
	const votes = await ctx.storage.votes.count({ item: itemId });
	await ctx.storage.tallies.put(itemId, { votes });
	return votes;
}

export function voteRowId(itemId: string, who: string): string {
	return `${itemId}:${who}`;
}

async function saveVote(ctx: PluginContext, itemId: string, who: string, extra: { member_id: string; visitor: string }) {
	const id = voteRowId(itemId, who);
	if (!(await ctx.storage.votes.exists(id))) {
		await ctx.storage.votes.put(id, {
			item: itemId,
			member_id: extra.member_id,
			createdAt: nowIso(),
			visitor: extra.visitor,
		});
	}
	return { ok: true, votes: await recount(ctx, itemId), voted: true } satisfies VoteOk;
}

async function dropVote(ctx: PluginContext, itemId: string, who: string) {
	await ctx.storage.votes.delete(voteRowId(itemId, who));
	return { ok: true, votes: await recount(ctx, itemId), voted: false } satisfies VoteOk;
}

/** One vote per signed-in member per published item. Click again (DELETE) takes it back. */
export async function handleVote(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	// POST reads JSON. DELETE has no body on EmDash, so the id comes from the query string.
	const itemId = asString(asRecord(routeCtx.input).id);
	const method = routeCtx.request.method;

	if (method === "DELETE") {
		if (!itemId) return NOT_FOUND;
		return dropVote(ctx, itemId, user.id);
	}

	if (method !== "POST") return SIGN_IN;
	if (await rateLimited(ctx, `vote:${user.id}`)) return RATE_LIMITED;
	if (!(await publishedItem(ctx, itemId))) return NOT_FOUND;
	return saveVote(ctx, itemId, user.id, { member_id: user.id, visitor: "" });
}

export async function handleVoteGuest(routeCtx: Route, ctx: PluginContext) {
	const raw = asRecord(routeCtx.input);
	if (asString(raw.website) || asString(raw.honeypot)) return SPAM;
	const settings = await loadSettings(ctx);
	if (settings.who === "members") return MEMBERS_ONLY;
	const hash = await visitorHash(ctx, requestIp(routeCtx), asString(raw.visitor));
	if (!hash) return NO_VISITOR;
	const who = visitorWho(hash);
	const itemId = asString(raw.id);
	const method = routeCtx.request.method;

	if (method === "DELETE") {
		if (!itemId) return NOT_FOUND;
		return dropVote(ctx, itemId, who);
	}

	if (method !== "POST") return NO_VISITOR;
	if (await rateLimited(ctx, `vote:${who}`)) return RATE_LIMITED;
	if (!(await publishedItem(ctx, itemId))) return NOT_FOUND;
	return saveVote(ctx, itemId, who, { member_id: who, visitor: hash });
}

/** Ids the caller voted for, so the board can mark them after a cached page loads. */
export async function listMyVotes(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	const found = await ctx.storage.votes.query({ where: { member_id: user.id }, limit: 100 });
	return {
		ok: true,
		ids: rows(found)
			.map((row) => asString(row.item))
			.filter(Boolean),
	};
}
