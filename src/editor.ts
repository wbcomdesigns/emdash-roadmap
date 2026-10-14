import type { PluginContext } from "emdash/plugin";

import type { BlockResponse } from "./admin";
import { getItem, patchStage } from "./content";
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
	extra?: Pick<BlockResponse, "toast">,
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
	const current = findStage(settings.stages, asString(asRecord(item.data).stage));
	return {
		blocks: [
			{ type: "header", text: "Stage" },
			{
				type: "context",
				text: "Pick a stage. The board uses this as soon as you save it here.",
			},
			{
				type: "form",
				block_id: "stage",
				fields: [
					{
						type: "select",
						action_id: "stage",
						label: "Stage",
						initial_value: current?.id || settings.stages[0]?.id || "",
						options: settings.stages.map((stage) => ({
							label: stage.shown === false ? `${stage.name} (hidden)` : stage.name,
							value: stage.id,
						})),
					},
				],
				submit: { action_id: "set_stage", label: "Save stage" },
			},
		],
		toast: extra?.toast,
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
	if (result.state === "busy") {
		return renderPanel(ctx, entry, {
			toast: { message: "This item has unpublished edits. Finish or discard them first.", type: "error" },
		});
	}
	return renderPanel(ctx, entry, { toast: { message: `Moved to ${stage.name}.`, type: "success" } });
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
	if (asString(raw.type) === "form_submit" && asString(raw.action_id) === "set_stage") {
		return saveStage(ctx, entry, asString(asRecord(raw.values).stage));
	}
	return renderPanel(ctx, entry);
}
