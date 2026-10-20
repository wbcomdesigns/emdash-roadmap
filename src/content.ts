import type { PluginContext } from "emdash/plugin";

import { FAILED, ROADMAP, roadmapReady } from "./core";
import { findStage, loadSettings, type Settings, type Stage } from "./settings";
import { readTally } from "./tally";
import { asRecord, asString } from "./util";

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

/**
 * Items in one status, newest first by the host's order, `pages` reads of 100. The caller has
 * checked the content type exists. Throws when a read fails: callers decide what that means.
 */
export async function listItems(ctx: PluginContext, collection: string, status: "published" | "draft", pages = 1): Promise<RoadmapItem[]> {
	if (!ctx.content) return [];
	const items: RoadmapItem[] = [];
	let cursor: string | undefined;
	for (let read = 0; read < pages; read += 1) {
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

/**
 * The public board: settings, the type check, one read of up to 100 published items and one read of
 * their counts. Four calls. A `category` from a 0.3.0 kit is not applied here: the 0.4.0 kit filters
 * by category in the page, from the one terms read it already makes (one read per item here did
 * not fit Cloudflare's limit).
 */
export async function loadBoard(ctx: PluginContext, input: unknown) {
	const raw = asRecord(input);
	const sort = asString(raw.sort) === "newest" ? "newest" : "votes";
	const settings = await loadSettings(ctx);
	const shown = settings.stages.filter((stage) => stage.shown);
	let items: RoadmapItem[] = [];
	const votes = new Map<string, number>();
	const ready = ctx.content ? await roadmapReady(ctx, settings.collection) : false;
	if (ready === null) return FAILED;
	if (ready) {
		try {
			items = (await listItems(ctx, settings.collection, "published")).slice(0, BOARD_MAX);
			if (items.length) {
				const found = await ctx.storage.tallies.getMany(items.map((item) => item.id));
				for (const [id, data] of found) votes.set(id, readTally(data)?.votes ?? 0);
			}
		} catch {
			return FAILED;
		}
	}
	items.sort((a, b) => {
		if (sort === "newest") return (b.createdAt || "").localeCompare(a.createdAt || "");
		const diff = (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0);
		return diff || (b.createdAt || "").localeCompare(a.createdAt || "");
	});
	return {
		ok: true as const,
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
			return { name: stage.name, items: cards, empty: cards.length ? null : ("COLUMN_EMPTY" as const) };
		}),
	};
}

/** Publish an entry: read its revision, then publish. Two calls. */
export async function publishNow(ctx: PluginContext, collection: string, id: string): Promise<boolean> {
	if (!ctx.content?.getVersioned || !ctx.content.publish) return false;
	const versioned = await ctx.content.getVersioned(collection, id);
	if (!versioned) return false;
	await ctx.content.publish(collection, id, { _rev: versioned._rev });
	return true;
}

/** Unpublish an entry that is published. Two calls, one when it is not published. */
export async function unpublishNow(ctx: PluginContext, collection: string, id: string): Promise<boolean> {
	if (!ctx.content?.getVersioned || !ctx.content.unpublish) return false;
	const versioned = await ctx.content.getVersioned(collection, id);
	if (!versioned) return false;
	if (versioned.item.status !== "published") return true;
	await ctx.content.unpublish(collection, id, { _rev: versioned._rev });
	return true;
}

/** The last Stage panel move on an item: {from, to}. Guards against an older editor form only. */
export function stageKey(id: string): string {
	return `stage:${id}`;
}

/** to: the stage the panel last set. left: every stage the item left through the panel since then. */
type StageMove = { to: string; left: string[] };

function readMove(raw: unknown): StageMove | null {
	const row = asRecord(raw);
	const to = asString(row.to);
	if (!to) return null;
	const left = Array.isArray(row.left) ? row.left.map(asString).filter(Boolean) : [asString(row.from)].filter(Boolean);
	return { to, left };
}

type Entry = { id: string; data: unknown; status?: string; draftRevisionId?: string | null };

/**
 * The item's stage as the next publish would show it: the unpublished changes if there are any,
 * otherwise the live entry. Read from the entry every time, never from the plugin's own record.
 * One call when the item has unpublished changes, none otherwise.
 */
export async function currentStage(ctx: PluginContext, collection: string, item: Entry): Promise<{ stage: string; inDraft: boolean; live: string }> {
	const live = asString(asRecord(item.data).stage);
	if (!item.draftRevisionId || !ctx.content?.getRevision) return { stage: live, inDraft: false, live };
	const draft = await ctx.content.getRevision(collection, item.id, item.draftRevisionId).catch(() => null);
	const stage = draft ? asString(asRecord(draft.data).stage) : live;
	return { stage: stage || live, inDraft: Boolean(draft), live };
}

export type StageResult =
	| { state: "missing" }
	| { state: "done" | "draft"; item: Entry; now: { stage: string; inDraft: boolean; live: string } };

/**
 * Change the stage on an item. Published with no unpublished changes: the change goes live at
 * once. With unpublished changes: only the stage in that draft changes, and it goes live when the
 * owner publishes. Either way the move is recorded as {from, to} so keepPanelStage can turn away an
 * editor form that was opened before the move and still holds the old stage.
 *
 * Six calls at most (read, the move record read and write, the update, and the revision and
 * publish for a live item), five with unpublished changes (read, their revision, record, update).
 * Returns the item's state after the move, so a screen redraws without reading it again.
 */
export async function patchStage(ctx: PluginContext, collection: string, id: string, stage: string): Promise<StageResult> {
	const item = await ctx.content?.get(collection, id).catch(() => null);
	if (!item || !ctx.content?.update) return { state: "missing" };
	const was = await currentStage(ctx, collection, item);
	const from = was.stage;
	// Recorded before the write, so the hook sees this move when the plugin's own update saves.
	if (from && from !== stage) {
		// A move from the stage the last move set continues the record, so a form opened before
		// either move is still turned away. Moving back to a stage takes it off the list.
		const before = readMove(await ctx.kv.get(stageKey(id)));
		const left = before && before.to === from ? [...before.left, from] : [from];
		await ctx.kv.set(stageKey(id), {
			to: stage,
			left: [...new Set(left)].filter((name) => name !== stage),
		} satisfies StageMove);
	}
	if (item.draftRevisionId) {
		await ctx.content.update(collection, id, { stage });
		return { state: "draft", item, now: { stage, inDraft: true, live: was.live } };
	}
	await ctx.content.update(collection, id, { ...item.data, stage });
	if (item.status === "published") await publishNow(ctx, collection, id);
	return { state: "done", item: { ...item, data: { ...item.data, stage } }, now: { stage, inDraft: false, live: stage } };
}

export const STALE_STAGE_REASON = (to: string) =>
	`The Stage panel moved this item to ${to}. To keep that, set the Stage box to ${to} and save again, or reload the page. To change the stage, use the Stage panel.`;

/**
 * content:beforeSave. Only one save is turned away: one that carries a stage the item left through
 * the Stage panel, while the item still has the stage the panel set (a form opened before the
 * moves). The owner is told why. Every other stage, typed in the form or sent through the API, is
 * saved as it is, and the record is dropped. A discarded draft or a restored revision changes the
 * item's stage, so the record is dropped then too.
 */
export async function keepPanelStage(
	ctx: PluginContext,
	event: { collection: string; isNew: boolean; id?: string; content: Record<string, unknown> },
): Promise<Record<string, unknown> | { __emdashSandboxHookResult: true; version: 1; error: { code: "SAVE_REJECTED"; reason: string } } | void> {
	// This hook also runs inside the plugin's own content.update (a Stage panel move). The usual
	// save costs one call (the move record); the plugin's own save then stops there, because it
	// carries the stage the record was just set to. At most four calls.
	if (event.isNew || !event.id || !("stage" in event.content)) return;
	if (event.collection !== ROADMAP) return;
	const move = readMove(await ctx.kv.get(stageKey(event.id)));
	if (!move) return;
	const incoming = asString(event.content.stage);
	if (incoming === move.to) return;
	const item = await ctx.content?.get?.(event.collection, event.id).catch(() => null);
	const now = item ? (await currentStage(ctx, event.collection, item)).stage : "";
	if (move.left.includes(incoming) && now === move.to) {
		return {
			__emdashSandboxHookResult: true,
			version: 1,
			error: { code: "SAVE_REJECTED", reason: STALE_STAGE_REASON(move.to) },
		};
	}
	await ctx.kv.delete(stageKey(event.id));
}
