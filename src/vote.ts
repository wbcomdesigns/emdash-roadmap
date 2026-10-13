import type { PluginContext } from "emdash/plugin";

import { RATE_LIMITED, SIGN_IN, collectionName, rateLimited, type Member } from "./core";
import { asRecord, asString, nowIso, rows } from "./util";

export const NOT_FOUND = {
	ok: false,
	error: { code: "NOT_FOUND", message: "That item is not on the board." },
};

type Route = {
	input: unknown;
	request: { method: string };
	user?: Member;
};

export type VoteOk = { ok: true; votes: number; voted: boolean };

async function publishedItem(ctx: PluginContext, id: string): Promise<boolean> {
	if (!id || !ctx.content) return false;
	const collection = await collectionName(ctx);
	const item = await ctx.content.get(collection, id).catch(() => null);
	return item?.status === "published";
}

async function recount(ctx: PluginContext, itemId: string): Promise<number> {
	const votes = await ctx.storage.votes.count({ item: itemId });
	await ctx.storage.tallies.put(itemId, { votes });
	return votes;
}

function voteRowId(itemId: string, memberId: string): string {
	return `${itemId}:${memberId}`;
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
		await ctx.storage.votes.delete(voteRowId(itemId, user.id));
		return { ok: true, votes: await recount(ctx, itemId), voted: false } satisfies VoteOk;
	}

	if (method !== "POST") return SIGN_IN;
	if (await rateLimited(ctx, user.id)) return RATE_LIMITED;
	if (!(await publishedItem(ctx, itemId))) return NOT_FOUND;

	const id = voteRowId(itemId, user.id);
	if (!(await ctx.storage.votes.exists(id))) {
		await ctx.storage.votes.put(id, {
			item: itemId,
			member_id: user.id,
			createdAt: nowIso(),
		});
	}
	return { ok: true, votes: await recount(ctx, itemId), voted: true } satisfies VoteOk;
}

/** Ids the caller voted for, so the board can mark them after a cached page loads. */
export async function listMyVotes(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	const found = await ctx.storage.votes.query({ where: { member_id: user.id }, limit: 100 });
	return {
		ok: true,
		ids: rows(found).map((row) => asString(row.item)).filter(Boolean),
	};
}
