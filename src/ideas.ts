import type { PluginContext } from "emdash/plugin";

import { collectionName } from "./core";
import { getItem, publishNow, unpublishNow } from "./content";
import { firstStage, loadSettings } from "./settings";
import { asRecord, asString, rows } from "./util";
import { recount } from "./vote";

export type IdeaRow = {
	id: string;
	title: string;
	description: string;
	status: string;
	rev: string;
	member_id: string;
	name: string;
	visitor: string;
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
		createdAt: asString(row.createdAt),
	};
}

/** An idea whose draft the owner published from the content editor is done: mark it approved. Up to 50 reads. */
export async function settlePublishedIdeas(ctx: PluginContext, ideas: IdeaRow[]): Promise<IdeaRow[]> {
	const waiting: IdeaRow[] = [];
	for (const idea of ideas) {
		const item = await getItem(ctx, idea.id);
		if (item?.status === "published") await writeIdea(ctx, idea, { status: "approved" });
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

async function writeIdea(ctx: PluginContext, idea: IdeaRow, patch: Partial<IdeaRow>): Promise<void> {
	const { id: _id, ...rest } = { ...idea, ...patch };
	await ctx.storage.ideas.put(idea.id, rest);
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
	await ctx.content.update(await collectionName(ctx), id, {
		...item.data,
		title: asString(asRecord(item.data).title) || idea.title,
		description: asString(asRecord(item.data).description) || idea.description,
		stage: stage.name,
	});
	if (!(await publishNow(ctx, id))) {
		return { ok: false, error: "Could not publish. Open the item in content admin and publish it there." };
	}
	await writeIdea(ctx, idea, { status: "approved" });
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
	await writeIdea(ctx, idea, { status: "rejected" });
	return { ok: true };
}

function personKey(row: Record<string, unknown>): string {
	return asString(row.member_id) || (asString(row.visitor) ? `v-${asString(row.visitor)}` : "");
}

export async function moveVotes(ctx: PluginContext, fromId: string, toId: string): Promise<void> {
	const source = rows(await ctx.storage.votes.query({ where: { item: fromId }, limit: 500 }));
	const target = rows(await ctx.storage.votes.query({ where: { item: toId }, limit: 500 }));
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

export async function mergeItems(
	ctx: PluginContext,
	sourceId: string,
	keepId: string,
	rev = "",
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!sourceId || !keepId) return { ok: false, error: "Pick two different items." };
	if (sourceId === keepId) return { ok: false, error: "Pick a different item to keep." };
	const idea = await loadIdea(ctx, sourceId);
	if (idea?.status === "pending" && rev && idea.rev !== rev) {
		return { ok: false, error: "That idea changed after this page loaded." };
	}
	const source = await getItem(ctx, sourceId);
	const keep = await getItem(ctx, keepId);
	if (!source || !keep) return { ok: false, error: "One of those items is no longer there." };
	if (keep.status !== "published") return { ok: false, error: "Keep a published item." };
	await moveVotes(ctx, sourceId, keepId);
	if (source.status === "published") await unpublishNow(ctx, sourceId);
	const from = `/${(await collectionName(ctx))}/${source.slug || sourceId}`;
	const to = `/${(await collectionName(ctx))}/${keep.slug || keepId}`;
	if (ctx.redirects?.create && source.slug && keep.slug && from !== to) {
		await ctx.redirects.create({ source: from, destination: to, type: 301 }).catch(() => undefined);
	}
	if (idea) await writeIdea(ctx, idea, { status: "merged" });
	return { ok: true };
}
