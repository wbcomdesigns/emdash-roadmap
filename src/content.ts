import type { PluginContext } from "emdash/plugin";

import { CHANGELOG, ROADMAP, collectionName, hasCollection } from "./core";
import { findStage, loadSettings, type Stage } from "./settings";
import { asNumber, asRecord, asString, rows } from "./util";

export const BOARD_MAX = 100;

export type RoadmapItem = {
	id: string;
	title: string;
	slug: string;
	stage: string;
	published: boolean;
	createdAt: string;
};

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
	for (const item of items) {
		const stage = findStage(stages, item.stage);
		if (!stage) continue;
		counts.set(stage.id, (counts.get(stage.id) ?? 0) + 1);
	}
	return counts;
}

async function votesMap(ctx: PluginContext): Promise<Map<string, number>> {
	const found = await ctx.storage.tallies.query({ limit: BOARD_MAX });
	return new Map(rows(found).map((row) => [row.id, asNumber(row.votes) ?? 0]));
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
		columns: shown.map((stage) => {
			const cards = items
				.filter((item) => findStage([stage], item.stage)?.id === stage.id)
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

/** Change the stage on an item and keep a published item live. */
export async function patchStage(
	ctx: PluginContext,
	id: string,
	stage: string,
): Promise<{ state: "done" } | { state: "busy" | "missing" }> {
	const collection = await collectionName(ctx);
	const item = await ctx.content?.get?.(collection, id).catch(() => null);
	if (!item || !ctx.content?.update) return { state: "missing" };
	if ((item as { draftRevisionId?: string | null }).draftRevisionId) return { state: "busy" };
	await ctx.content.update(collection, id, { ...item.data, stage });
	if (item.status === "published" && ctx.content.getVersioned && ctx.content.publish) {
		const versioned = await ctx.content.getVersioned(collection, id);
		if (versioned) await ctx.content.publish(collection, id, { _rev: versioned._rev });
	}
	return { state: "done" };
}
