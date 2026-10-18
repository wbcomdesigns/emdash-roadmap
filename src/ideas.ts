import type { PluginContext } from "emdash/plugin";

import { collectionName } from "./core";
import { getItem, itemStamp, publishNow, unpublishNow } from "./content";
import { firstStage, loadSettings } from "./settings";
import { STORAGE_PAGE, allRows, asRecord, asString, rows } from "./util";
import { recount, voteRowId } from "./vote";

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

/** An idea whose draft the owner published from the content editor is done: mark it approved. Up to 50 reads. */
export async function settlePublishedIdeas(ctx: PluginContext, ideas: IdeaRow[]): Promise<IdeaRow[]> {
	const waiting: IdeaRow[] = [];
	for (const idea of ideas) {
		const item = await getItem(ctx, idea.id);
		if (item?.status === "published") await writeIdea(ctx, idea, { status: "approved" }).catch(() => false);
		else waiting.push(idea);
	}
	return waiting;
}

export async function listPendingIdeas(ctx: PluginContext): Promise<IdeaRow[]> {
	try {
		const found = await ctx.storage.ideas.query({
			where: { status: "pending" },
			orderBy: { createdAt: "desc" },
			limit: 50,
		});
		const ideas: IdeaRow[] = [];
		for (const item of found.items) {
			try {
				ideas.push(ideaFrom({ ...asRecord(item.data), id: item.id }));
			} catch {
				// One bad row must not stop the queue.
			}
		}
		return ideas;
	} catch {
		return [];
	}
}

export async function loadIdea(ctx: PluginContext, id: string): Promise<IdeaRow | null> {
	if (!id) return null;
	try {
		const row = await ctx.storage.ideas.get(id);
		if (!row) return null;
		return ideaFrom({ ...asRecord(row), id });
	} catch {
		return null;
	}
}

/**
 * Guarded write: applies only while the row still has the status and revision this decision was
 * made on, so a decision or a cleanup that landed in between is never overwritten.
 */
async function writeIdea(ctx: PluginContext, idea: IdeaRow, patch: Partial<IdeaRow>): Promise<boolean> {
	const { id: _id, ...set } = patch;
	const result = await ctx.storage.ideas.updateIf(idea.id, {
		where: { status: idea.status, rev: idea.rev },
		set: { ...set, rev: crypto.randomUUID() },
	});
	return result.applied;
}

export async function approveIdea(
	ctx: PluginContext,
	id: string,
	rev: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const idea = await loadIdea(ctx, id);
	if (!idea || idea.status !== "pending") return { ok: false, error: "That idea is no longer waiting." };
	if (!rev || idea.rev !== rev) return { ok: false, error: "That idea changed after this page loaded." };
	const item = await getItem(ctx, id);
	if (!item || !ctx.content?.update) return { ok: false, error: "That draft is no longer there." };
	const settings = await loadSettings(ctx);
	const stage = firstStage(settings.stages);
	// Someone edited the draft since it was suggested. Those edits sit in a draft revision this plugin
	// cannot show, so approving here would publish text nobody on this screen has seen. The owner publishes
	// it from the content editor instead; the idea then leaves this queue (settlePublishedIdeas).
	if (item.draftRevisionId) {
		return {
			ok: false,
			error: "This idea's draft has unpublished edits. Open it in Roadmap content, check it and publish it there. It then leaves this list.",
		};
	}
	// Claim the idea first: a reject or merge that landed after the checks above wins.
	if (!(await writeIdea(ctx, idea, { status: "approved" }))) {
		return { ok: false, error: "That idea changed after this page loaded." };
	}
	const back = async () => {
		const now = await loadIdea(ctx, id);
		if (now?.status === "approved") await writeIdea(ctx, now, { status: "pending" });
	};
	await ctx.content.update(await collectionName(ctx), id, {
		...item.data,
		title: asString(asRecord(item.data).title) || idea.title,
		description: asString(asRecord(item.data).description) || idea.description,
		stage: stage.name,
	});
	if (!(await publishNow(ctx, id).catch(() => false))) {
		await back();
		return { ok: false, error: "Could not publish. Open the item in content admin and publish it there." };
	}
	return { ok: true };
}

export async function rejectIdea(
	ctx: PluginContext,
	id: string,
	rev: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const idea = await loadIdea(ctx, id);
	if (!idea || idea.status !== "pending") return { ok: false, error: "That idea is no longer waiting." };
	if (!rev || idea.rev !== rev) return { ok: false, error: "That idea changed after this page loaded." };
	if (!(await writeIdea(ctx, idea, { status: "rejected" }))) {
		return { ok: false, error: "That idea changed after this page loaded." };
	}
	return { ok: true };
}

function personKey(row: Record<string, unknown>): string {
	return asString(row.member_id) || (asString(row.visitor) ? `v-${asString(row.visitor)}` : "");
}

export async function moveVotes(ctx: PluginContext, fromId: string, toId: string): Promise<void> {
	const source = await allRows(ctx.storage.votes, { item: fromId });
	const target = await allRows(ctx.storage.votes, { item: toId });
	const kept = new Set(target.map(personKey).filter(Boolean));
	for (const row of source) {
		const who = personKey(row);
		if (!who) {
			await ctx.storage.votes.delete(row.id);
			continue;
		}
		if (kept.has(who)) {
			await ctx.storage.votes.delete(row.id);
			continue;
		}
		await ctx.storage.votes.put(`${toId}:${who}`, {
			item: toId,
			member_id: asString(row.member_id) || who,
			createdAt: asString(row.createdAt),
			visitor: asString(row.visitor),
		});
		await ctx.storage.votes.delete(row.id);
		kept.add(who);
	}
	await recount(ctx, fromId);
	await recount(ctx, toId);
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

export async function mergeItems(
	ctx: PluginContext,
	from: MergeSource | null,
	keepId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!from || !keepId) return { ok: false, error: "Pick two different items." };
	const sourceId = from.id;
	if (sourceId === keepId) return { ok: false, error: "Pick a different item to keep." };
	// Every merge carries the stamp of what the admin saw, for an idea and for an item alike.
	if (!from.stamp) return CHANGED;
	const idea = await loadIdea(ctx, sourceId);
	if (from.kind === "idea" && (idea?.status !== "pending" || idea.rev !== from.stamp)) {
		return { ok: false, error: "That idea changed after this page loaded." };
	}
	const source = await getItem(ctx, sourceId);
	const keep = await getItem(ctx, keepId);
	if (!source || !keep) return { ok: false, error: "One of those items is no longer there." };
	if (from.kind === "item" && itemStamp(source) !== from.stamp) return CHANGED;
	if (keep.status !== "published") return { ok: false, error: "Keep a published item." };
	// A waiting idea is claimed before anything moves, so an approve in between wins.
	if (from.kind === "idea" && idea && !(await writeIdea(ctx, idea, { status: "merged" }))) {
		return { ok: false, error: "That idea changed after this page loaded." };
	}
	await moveVotes(ctx, sourceId, keepId);
	if (source.status === "published") await unpublishNow(ctx, sourceId);
	const fromPath = `/${(await collectionName(ctx))}/${source.slug || sourceId}`;
	const toPath = `/${(await collectionName(ctx))}/${keep.slug || keepId}`;
	if (ctx.redirects?.create && source.slug && keep.slug && fromPath !== toPath) {
		await ctx.redirects.create({ source: fromPath, destination: toPath, type: 301 }).catch(() => undefined);
	}
	if (from.kind === "item" && idea?.status === "pending") await writeIdea(ctx, idea, { status: "merged" });
	return { ok: true };
}

async function sha256Hex(text: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** How long a guest's salted address stays on a row: it stops repeat votes inside this window. */
export const GUEST_HASH_DAYS = 30;
const FORGET_BATCH = STORAGE_PAGE;
/** Batches per hourly run. A row done drops out of the query, so each batch reads the next ones. */
const FORGET_ROUNDS = 20;

/**
 * Hourly: drop the salted visitor hash from guest votes and guest ideas older than the window.
 * The vote and the idea stay. A vote row is keyed by the hash, so it moves to an anonymous key.
 */
export async function forgetOldGuests(ctx: PluginContext, now = Date.now()): Promise<{ votes: number; ideas: number }> {
	const before = new Date(now - GUEST_HASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const old = { visitor: { gt: "" }, createdAt: { lt: before } };
	let votes = 0;
	for (let round = 0; round < FORGET_ROUNDS; round += 1) {
		const batch = rows(await ctx.storage.votes.query({ where: old, limit: FORGET_BATCH }));
		if (!batch.length) break;
		for (const row of batch) votes += await forgetVote(ctx, row);
		if (batch.length < FORGET_BATCH) break;
	}
	let ideas = 0;
	for (let round = 0; round < FORGET_ROUNDS; round += 1) {
		const batch = rows(await ctx.storage.ideas.query({ where: old, limit: FORGET_BATCH }));
		if (!batch.length) break;
		let done = 0;
		for (const row of batch) done += await forgetIdea(ctx, row);
		ideas += done;
		// Nothing applied: the rest changed under us; the next hourly run takes them.
		if (batch.length < FORGET_BATCH || done === 0) break;
	}
	// Rate-limit counters carry the same hash in their key. Drop the ones whose hour is over.
	for (const entry of await ctx.kv.list("rate:").catch(() => [])) {
		const start = Number(String(entry.value ?? "").split("|")[0]) || 0;
		if (now - start > 60 * 60 * 1000) await ctx.kv.delete(entry.key).catch(() => false);
	}
	return { votes, ideas };
}

async function forgetVote(ctx: PluginContext, row: { id: string } & Record<string, unknown>): Promise<number> {
	if (!asString(row.visitor)) return 0;
	const item = asString(row.item);
	// Same old row, same new key: a run that stops halfway and runs again cannot count it twice.
	const anon = `g-${await sha256Hex(row.id)}`;
	await ctx.storage.votes.put(voteRowId(item, anon), {
		item,
		member_id: anon,
		createdAt: asString(row.createdAt),
		visitor: "",
	});
	await ctx.storage.votes.delete(row.id);
	return 1;
}

async function forgetIdea(ctx: PluginContext, row: { id: string } & Record<string, unknown>): Promise<number> {
	if (!asString(row.visitor)) return 0;
	// Touches only these two fields, and only while the hash is still the one read here.
	const done = await ctx.storage.ideas.updateIf(row.id, {
		where: { visitor: asString(row.visitor) },
		set: { visitor: "", guest: true },
	});
	return done.applied ? 1 : 0;
}
