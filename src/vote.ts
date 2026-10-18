import type { PluginContext } from "emdash/plugin";

import { GUEST_UNAVAILABLE, MEMBERS_ONLY, NO_VISITOR, RATE_LIMITED, SIGN_IN, SPAM, collectionName, rateLimited, type Member } from "./core";
import { listRoadmapItems } from "./content";
import { findStage, loadSettings } from "./settings";
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
	// No visitor address from the host: guests cannot be told apart, so they cannot write (#51).
	const ip = requestIp(routeCtx);
	if (!ip) return GUEST_UNAVAILABLE;
	const hash = await visitorHash(ctx, ip);
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

function ideaStatus(status: string): string {
	if (status === "approved") return "On the board";
	if (status === "rejected") return "Not published";
	return "Waiting for a decision";
}

async function myVoteRows(ctx: PluginContext, userId: string) {
	const all: Array<{ id: string; item: string }> = [];
	let cursor: string | undefined;
	for (let step = 0; step < 10; step += 1) {
		const found = await ctx.storage.votes.query({ where: { member_id: userId }, limit: 100, cursor });
		for (const row of rows(found)) {
			const item = asString(row.item);
			if (item) all.push({ id: row.id, item });
		}
		if (!found.hasMore || !found.cursor) break;
		cursor = found.cursor;
	}
	return all;
}

/** Ids the caller voted for, so the board can mark them after a cached page loads. */
export async function listMyVotes(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	if (routeCtx.request.method === "DELETE") return eraseMyVotes(ctx, user.id);
	const voted = await myVoteRows(ctx, user.id);
	const ids = voted.map((row) => row.item);
	const settings = await loadSettings(ctx);
	const published = await listRoadmapItems(ctx);
	const byId = new Map(published.map((item) => [item.id, item]));
	const items = ids
		.map((id) => byId.get(id))
		.filter((item) => item?.published)
		.map((item) => {
			const stage = findStage(settings.stages, item!.stage);
			return {
				id: item!.id,
				title: item!.title,
				slug: item!.slug,
				stage: stage?.name || item!.stage,
			};
		});
	const ideaRows = rows(await ctx.storage.ideas.query({ where: { member_id: user.id }, limit: 50 }));
	const ideas = ideaRows
		.map((row) => ({ title: asString(row.title), status: ideaStatus(asString(row.status)) }))
		.filter((idea) => idea.title);
	return { ok: true, ids, items, ideas };
}

/** Drops every vote stored for this member. The member id comes from the session, never the request. */
async function eraseMyVotes(ctx: PluginContext, userId: string) {
	const voted = await myVoteRows(ctx, userId);
	const items = new Set(voted.map((row) => row.item));
	for (const row of voted) await ctx.storage.votes.delete(row.id);
	for (const item of items) await recount(ctx, item);
	return { ok: true, erased: voted.length };
}
