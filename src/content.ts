import type { PluginContext } from "emdash/plugin";

import { CHANGELOG, ROADMAP, collectionName, hasCollection } from "./core";
import { findStage, type Stage } from "./settings";
import { asRecord, asString } from "./util";

export type RoadmapItem = {
	id: string;
	title: string;
	stage: string;
	published: boolean;
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
				stage: asString(data.stage),
				published: item.status === "published",
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

export async function hasCollections(ctx: PluginContext): Promise<{ roadmap: boolean; changelog: boolean }> {
	const [roadmap, changelog] = await Promise.all([hasCollection(ctx, ROADMAP), hasCollection(ctx, CHANGELOG)]);
	return { roadmap, changelog };
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
