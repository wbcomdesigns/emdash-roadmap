import type { PluginContext } from "emdash/plugin";

import { CHANGELOG, ROADMAP, collectionName, hasCollection } from "./core";
import { findStage, loadSettings, type Stage } from "./settings";
import { allRows, asNumber, asRecord, asString } from "./util";

export const BOARD_MAX = 100;

export type RoadmapItem = {
	id: string;
	title: string;
	slug: string;
	stage: string;
	published: boolean;
	createdAt: string;
	/** Changes whenever the item is saved. Ties an admin decision to the item the admin saw. */
	stamp: string;
};

export function itemStamp(item: { version?: number; updatedAt?: string | null }): string {
	return `${item.version ?? ""}~${item.updatedAt ?? ""}`;
}

export type BoardCard = {
	id: string;
	title: string;
	slug: string;
	votes: number;
};

export type BoardColumn = {
	name: string;
	items: BoardCard[];
	empty: "COLUMN_EMPTY" | null;
};

const PAGE = 100;
const MAX_PAGES = 2;

async function listByStatus(
	ctx: PluginContext,
	collection: string,
	status: string,
): Promise<RoadmapItem[]> {
	if (!ctx.content) return [];
	const items: RoadmapItem[] = [];
	let cursor: string | undefined;
	for (let read = 0; read < MAX_PAGES; read += 1) {
		const page = await ctx.content.list(collection, { limit: PAGE, cursor, where: { status } });
		for (const item of page.items) {
			const data = asRecord(item.data);
			items.push({
				id: item.id,
				title: asString(data.title) || item.slug || item.id,
				slug: item.slug || "",
				stage: asString(data.stage),
				published: item.status === "published",
				createdAt: item.publishedAt || item.createdAt || "",
				stamp: itemStamp(item),
			});
		}
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return items;
}

export async function listRoadmapItems(ctx: PluginContext): Promise<RoadmapItem[]> {
	const collection = await collectionName(ctx);
	try {
		const [live, drafts] = await Promise.all([
			listByStatus(ctx, collection, "published"),
			listByStatus(ctx, collection, "draft"),
		]);
		return [...live, ...drafts];
	} catch {
		return [];
	}
}

export function countInStage(items: RoadmapItem[], stage: Stage): number {
	return items.filter((item) => findStage([stage], item.stage)?.id === stage.id).length;
}

export function stageCounts(items: RoadmapItem[], stages: Stage[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const stage of stages) counts.set(stage.id, 0);
	// Same rule as the board: an item whose stage matches no stage counts in the first column shown.
	const first = stages.find((stage) => stage.shown);
	for (const item of items) {
		const stage = findStage(stages, item.stage) ?? first;
		if (!stage) continue;
		counts.set(stage.id, (counts.get(stage.id) ?? 0) + 1);
	}
	return counts;
}

/** One tally per item. Paged: a storage query returns 100 rows at most, and items can pass 100. */
async function votesMap(ctx: PluginContext): Promise<Map<string, number>> {
	const found = await allRows(ctx.storage.tallies, {}, MAX_PAGES * 2);
	return new Map(found.map((row) => [row.id, asNumber(row.votes) ?? 0]));
}

async function inCategory(ctx: PluginContext, id: string, collection: string, wanted: string): Promise<boolean> {
	if (!ctx.taxonomies) return false;
	try {
		const terms = await ctx.taxonomies.getEntryTerms(collection, id);
		const needle = wanted.toLowerCase();
		return terms.some((term) => term.slug.toLowerCase() === needle || term.label.toLowerCase() === needle);
	} catch {
		return false;
	}
}

export async function loadBoard(
	ctx: PluginContext,
	input: unknown,
): Promise<{ ok: true; sort: "votes" | "newest"; columns: BoardColumn[] }> {
	const raw = asRecord(input);
	const sort = asString(raw.sort) === "newest" ? "newest" : "votes";
	const category = asString(raw.category);
	const settings = await loadSettings(ctx);
	const shown = settings.stages.filter((stage) => stage.shown);
	let items = (await listRoadmapItems(ctx)).filter((item) => item.published);
	if (category) {
		const collection = await collectionName(ctx);
		const keep: RoadmapItem[] = [];
		// ponytail: one terms read per item. Fine at BOARD_MAX; batch if the host adds getEntriesByTerm.
		for (const item of items) {
			if (await inCategory(ctx, item.id, collection, category)) keep.push(item);
		}
		items = keep;
	}
	items = items.slice(0, BOARD_MAX);
	const votes = await votesMap(ctx);
	items.sort((a, b) => {
		if (sort === "newest") return (b.createdAt || "").localeCompare(a.createdAt || "");
		const diff = (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0);
		return diff || (b.createdAt || "").localeCompare(a.createdAt || "");
	});
	return {
		ok: true,
		sort,
		columns: shown.map((stage, index) => {
			const cards = items
				// An item whose stage matches no stage at all (a typo in the content form) shows in the
				// first column instead of vanishing. Items in a hidden stage stay hidden.
				.filter((item) => {
					const at = findStage(settings.stages, item.stage);
					return at ? at.id === stage.id : index === 0;
				})
				.map((item) => ({
					id: item.id,
					title: item.title,
					slug: item.slug,
					votes: votes.get(item.id) ?? 0,
				}));
			return { name: stage.name, items: cards, empty: cards.length ? null : "COLUMN_EMPTY" };
		}),
	};
}

export async function hasCollections(ctx: PluginContext): Promise<{ roadmap: boolean; changelog: boolean }> {
	const [roadmap, changelog] = await Promise.all([hasCollection(ctx, ROADMAP), hasCollection(ctx, CHANGELOG)]);
	return { roadmap, changelog };
}

export async function getItem(ctx: PluginContext, id: string) {
	const collection = await collectionName(ctx);
	return ctx.content?.get?.(collection, id).catch(() => null) ?? null;
}

export async function publishNow(ctx: PluginContext, id: string): Promise<boolean> {
	const collection = await collectionName(ctx);
	if (!ctx.content?.getVersioned || !ctx.content.publish) return false;
	const versioned = await ctx.content.getVersioned(collection, id);
	if (!versioned) return false;
	await ctx.content.publish(collection, id, { _rev: versioned._rev });
	return true;
}

export async function unpublishNow(ctx: PluginContext, id: string): Promise<boolean> {
	const collection = await collectionName(ctx);
	if (!ctx.content?.getVersioned || !ctx.content.unpublish) return false;
	const versioned = await ctx.content.getVersioned(collection, id);
	if (!versioned) return false;
	await ctx.content.unpublish(collection, id, { _rev: versioned._rev });
	return true;
}

/** The last Stage panel move on an item: {from, to}. Guards against an older editor form only. */
export function stageKey(id: string): string {
	return `stage:${id}`;
}

type StageMove = { from: string; to: string };

/**
 * The item's stage as the next publish would show it: the unpublished changes if there are any,
 * otherwise the live entry. Read from the entry every time, never from the plugin's own record.
 */
export async function currentStage(ctx: PluginContext, item: { id: string; data: unknown; draftRevisionId?: string | null }): Promise<{ stage: string; inDraft: boolean; live: string }> {
	const live = asString(asRecord(item.data).stage);
	if (!item.draftRevisionId || !ctx.content?.getRevision) return { stage: live, inDraft: false, live };
	const collection = await collectionName(ctx);
	const draft = await ctx.content.getRevision(collection, item.id, item.draftRevisionId).catch(() => null);
	const stage = draft ? asString(asRecord(draft.data).stage) : live;
	return { stage: stage || live, inDraft: Boolean(draft), live };
}

/**
 * Change the stage on an item. Published with no unpublished changes: the change goes live at
 * once. With unpublished changes: only the stage in that draft changes, and it goes live when the
 * owner publishes. Either way the move is recorded as {from, to} so keepPanelStage can turn away an
 * editor form that was opened before the move and still holds the old stage.
 */
export async function patchStage(
	ctx: PluginContext,
	id: string,
	stage: string,
): Promise<{ state: "done" | "draft" | "missing" }> {
	const collection = await collectionName(ctx);
	const item = await ctx.content?.get?.(collection, id).catch(() => null);
	if (!item || !ctx.content?.update) return { state: "missing" };
	const from = (await currentStage(ctx, item)).stage;
	// Recorded before the write, so the hook sees this move when the plugin's own update saves.
	if (from && from !== stage) await ctx.kv.set(stageKey(id), { from, to: stage } satisfies StageMove);
	if (item.draftRevisionId) {
		await ctx.content.update(collection, id, { stage });
		return { state: "draft" };
	}
	await ctx.content.update(collection, id, { ...item.data, stage });
	if (item.status === "published" && ctx.content.getVersioned && ctx.content.publish) {
		const versioned = await ctx.content.getVersioned(collection, id);
		if (versioned) await ctx.content.publish(collection, id, { _rev: versioned._rev });
	}
	return { state: "done" };
}

export const STALE_STAGE_REASON = (to: string) =>
	`The Stage panel moved this item to ${to} after this page was opened. To keep that, set the Stage box to ${to} and save again, or reload the page. To change the stage, use the Stage panel.`;

/**
 * content:beforeSave. Only one save is turned away: one that still carries the stage an item had
 * before its last Stage panel move, while the item still has the stage that move set (the form was
 * opened before the move). The owner is told why. Every other stage, typed in the form or sent
 * through the API, is saved as it is, and the record is dropped. A discarded draft or a restored
 * revision changes the item's stage, so the record is dropped then too.
 */
export async function keepPanelStage(
	ctx: PluginContext,
	event: { collection: string; isNew: boolean; id?: string; content: Record<string, unknown> },
): Promise<Record<string, unknown> | { __emdashSandboxHookResult: true; version: 1; error: { code: "SAVE_REJECTED"; reason: string } } | void> {
	if (event.isNew || !event.id || !("stage" in event.content)) return;
	if (event.collection !== (await collectionName(ctx))) return;
	const move = await ctx.kv.get<StageMove>(stageKey(event.id));
	if (!move?.to) return;
	const incoming = asString(event.content.stage);
	if (incoming === move.to) return;
	const item = await ctx.content?.get?.(event.collection, event.id).catch(() => null);
	const now = item ? (await currentStage(ctx, item)).stage : "";
	if (incoming === move.from && now === move.to) {
		return {
			__emdashSandboxHookResult: true,
			version: 1,
			error: { code: "SAVE_REJECTED", reason: STALE_STAGE_REASON(move.to) },
		};
	}
	await ctx.kv.delete(stageKey(event.id));
}
