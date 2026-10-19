import type { PluginContext } from "emdash/plugin";

import type { BlockResponse } from "./admin";
import { currentStage, getItem, patchStage } from "./content";
import { ROADMAP } from "./core";
import { findStage, loadSettings } from "./settings";
import { asRecord, asString } from "./util";

type Ctx = PluginContext;
type RouteCtx = {
	input: unknown;
	ui?: { entry?: { collection: string; id: string } };
};

function entryOf(routeCtx: RouteCtx): { collection: string; id: string } | null {
	const entry = routeCtx.ui?.entry;
	if (!entry?.collection || !entry.id) return null;
	return { collection: entry.collection, id: entry.id };
}

async function renderPanel(
	ctx: Ctx,
	entry: { collection: string; id: string },
	extra?: Pick<BlockResponse, "toast"> & { refresh?: boolean },
): Promise<BlockResponse> {
	if (entry.collection !== ROADMAP) {
		return {
			blocks: [
				{ type: "header", text: "Stage" },
				{
					type: "empty",
					title: "This panel is for roadmap items",
					description: "Open a roadmap item to choose its stage.",
				},
			],
			toast: extra?.toast,
		};
	}

	const item = await getItem(ctx, entry.id);
	if (!item) {
		return {
			blocks: [
				{
					type: "banner",
					variant: "error",
					title: "Save the item first",
					description: "The stage list works on a saved roadmap item.",
				},
			],
			toast: extra?.toast,
		};
	}

	const settings = await loadSettings(ctx);
	// Read from the entry: the unpublished changes if there are any, otherwise the live item.
	const now = await currentStage(ctx, { ...item, id: entry.id });
	const current = findStage(settings.stages, now.stage);
	const live = findStage(settings.stages, now.live);
	const label = (stage: { name: string; shown: boolean }) => (stage.shown === false ? `${stage.name} (hidden)` : stage.name);
	// Buttons, not a form: the panel sits inside the editor's own form, and a form inside a form is
	// invalid HTML. This panel is the one place to move an item.
	return {
		blocks: [
			{
				type: "fields",
				fields: [
					{
						label: now.inDraft ? "Stage in the unpublished changes" : "Stage now",
						value: current ? label(current) : now.stage || settings.stages[0]?.name || "",
					},
					...(now.inDraft && now.live !== now.stage
						? [{ label: "On the board now", value: live ? label(live) : now.live }]
						: []),
				],
			},
			{
				type: "context",
				text: item.draftRevisionId
					? "This item has unpublished changes. A move goes into them; publish to show it on the board."
					: "Move this item to another stage. Visitors see it on the board within about two minutes.",
			},
			{
				type: "actions",
				elements: settings.stages
					.filter((stage) => stage.id !== current?.id)
					.map((stage) => ({
						type: "button",
						label: `Move to ${label(stage)}`,
						// Unique per button: the admin keys elements by action_id.
						action_id: `set_stage:${stage.id}`,
						value: stage.id,
					})),
			},
		],
		toast: extra?.toast,
		...(extra?.refresh ? { refresh: true as const } : {}),
	};
}

async function saveStage(ctx: Ctx, entry: { collection: string; id: string }, raw: string): Promise<BlockResponse> {
	const settings = await loadSettings(ctx);
	const stage = findStage(settings.stages, raw);
	if (!stage) {
		return renderPanel(ctx, entry, { toast: { message: "Pick a stage from the list.", type: "error" } });
	}
	const result = await patchStage(ctx, entry.id, stage.name);
	if (result.state === "missing") {
		return renderPanel(ctx, entry, { toast: { message: "That item is gone.", type: "error" } });
	}
	// refresh: the editor reloads the entry, so its own Stage box shows the new stage. A later Save
	// from a form that still holds the old stage is corrected by the content:beforeSave hook.
	const message =
		result.state === "draft"
			? `Moved to ${stage.name} in this item's unpublished changes. Publish them to show it on the board.`
			: `Moved to ${stage.name}.`;
	return renderPanel(ctx, entry, { toast: { message, type: "success" }, refresh: true });
}

export async function handleEditorPanel(routeCtx: RouteCtx, ctx: Ctx): Promise<BlockResponse> {
	const entry = entryOf(routeCtx);
	if (!entry) {
		return {
			blocks: [
				{
					type: "banner",
					variant: "error",
					title: "Save the item first",
					description: "The stage list works on a saved roadmap item.",
				},
			],
		};
	}

	const raw = asRecord(routeCtx.input);
	const action = asString(raw.action_id);
	if (asString(raw.type) === "block_action" && action.startsWith("set_stage:")) {
		return saveStage(ctx, entry, action.slice("set_stage:".length));
	}
	return renderPanel(ctx, entry);
}
