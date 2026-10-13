import type { PluginContext } from "emdash/plugin";

import { EMAIL_RE } from "./core";
import { countInStage, hasCollections, listRoadmapItems, patchStage, stageCounts } from "./content";
import { approveIdea, listPendingIdeas, mergeItems, rejectIdea } from "./ideas";
import { ensureNotifyTask } from "./notify";
import {
	addStage,
	findStage,
	loadSettings,
	moveStage,
	removeStage,
	renameStage,
	saveStages,
	setStageShown,
	type Settings,
	type Stage,
} from "./settings";
import { asBoolean, asRecord, asString } from "./util";

type Toast = { message: string; type: "success" | "error" | "info" };
export type BlockMap = Record<string, unknown> & { type: string };
export type BlockResponse = { blocks: BlockMap[]; toast?: Toast };

const lines = (items: string[]) => items.map((text) => ({ type: "context", text }));

function saved(ctx: PluginContext, message: string) {
	return renderSettings(ctx, { toast: { message, type: "success" } });
}

function failed(ctx: PluginContext, message: string) {
	return renderSettings(ctx, { toast: { message, type: "error" } });
}

function whoLabel(idea: { name: string; visitor: string; member_id: string }): string {
	if (idea.visitor) return idea.name ? `${idea.name} (guest)` : "Guest";
	return idea.name || "Member";
}

function stamped(action: string, id: string, rev: string): string {
	return `${action}|${rev}|${id}`;
}

function parseStamped(value: unknown): { action: string; rev: string; id: string } {
	const [action = "", rev = "", ...rest] = asString(value).split("|");
	return { action, rev, id: rest.join("|") };
}

export async function renderIdeas(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const collections = await hasCollections(ctx);
	const pending = await listPendingIdeas(ctx);
	const items = (await listRoadmapItems(ctx)).filter((item) => item.published);
	const keepOptions = items.length
		? items.map((item) => ({ label: item.title, value: item.id }))
		: [{ label: "No published items yet", value: "" }];
	const sourceOptions = [
		...pending.map((idea) => ({ label: `${idea.title} (waiting)`, value: `idea:${idea.id}:${idea.rev}` })),
		...items.map((item) => ({ label: item.title, value: `item:${item.id}` })),
	];
	const rows = pending.map((idea) => ({
		title: idea.title,
		description: idea.description,
		from: whoLabel(idea),
		action: {
			type: "menu",
			action_id: "idea_mod",
			label: "Decide",
			items: [
				{ label: "Approve", value: stamped("approve", idea.id, idea.rev) },
				{ label: "Reject", value: stamped("reject", idea.id, idea.rev) },
			],
		},
	}));
	return {
		blocks: [
			{ type: "header", text: "Ideas" },
			{
				type: "fields",
				fields: [
					{ label: "Roadmap collection", value: collections.roadmap ? "Ready" : "Missing" },
					{ label: "Changelog collection", value: collections.changelog ? "Ready" : "Missing" },
					{ label: "Waiting", value: String(pending.length) },
				],
			},
			...(!collections.roadmap
				? [
						{
							type: "banner",
							title: "Create the roadmap collection",
							description:
								"Copy the collection seed from the site kit, or create a roadmap collection with title, description and stage. Comments should be on.",
							variant: "alert",
						},
					]
				: []),
			pending.length === 0
				? {
						type: "empty",
						title: "No ideas waiting",
						description: "Suggestions from the site wait here. Approve one to put it on the board.",
					}
				: {
						type: "table",
						page_action_id: "ideas_page",
						columns: [
							{ key: "title", label: "Title" },
							{ key: "description", label: "Description" },
							{ key: "from", label: "From" },
							{ key: "action", label: "Decision", format: "element" },
						],
						rows,
					},
			{ type: "header", text: "Merge a duplicate" },
			...lines([
				"Pick the item to drop and the item to keep. Votes move across, one per person. The dropped item is unpublished and its address redirects to the one you keep.",
			]),
			{
				type: "form",
				block_id: "merge_items",
				fields: [
					{
						type: "select",
						action_id: "source",
						label: "Merge this item",
						options: sourceOptions.length
							? sourceOptions
							: [{ label: "Nothing to merge yet", value: "" }],
					},
					{
						type: "select",
						action_id: "keep",
						label: "Into this item",
						options: keepOptions,
					},
				],
				submit: { label: "Merge", action_id: "merge_items" },
			},
			{
				type: "actions",
				elements: [{ type: "link", label: "Settings", target: { kind: "plugin-page", path: "/settings" } }],
			},
		],
		toast: extra?.toast,
	};
}

export async function renderWaiting(ctx: PluginContext): Promise<BlockResponse> {
	const waiting = await ctx.storage.ideas.count({ status: "pending" }).catch(() => 0);
	return {
		blocks: [
			waiting === 0
				? { type: "section", text: "Nothing is waiting." }
				: {
						type: "stats",
						items: [{ label: "Ideas waiting", value: waiting }],
					},
			{
				type: "actions",
				elements: [{ type: "link", label: "Open ideas", target: { kind: "plugin-page", path: "/ideas" } }],
			},
		],
	};
}

function stageRow(stage: Stage, count: number, first: boolean, last: boolean): BlockMap[] {
	const shown = stage.shown !== false;
	return [
		{ type: "header", text: stage.name },
		...lines([
			shown ? "Shown on the board." : "Hidden from the board. Items in this stage stay off the public board.",
			count === 1 ? "1 item is in this stage." : `${count} items are in this stage.`,
		]),
		{
			type: "form",
			block_id: `stage_${stage.id}`,
			fields: [
				{
					type: "text_input",
					action_id: "name",
					label: "Name",
					initial_value: stage.name,
				},
				{
					type: "toggle",
					action_id: "shown",
					label: "Show on the board",
					initial_value: shown,
				},
			],
			submit: { label: "Save stage", action_id: `save_stage:${stage.id}` },
		},
		{
			type: "actions",
			elements: [
				...(!first
					? [{ type: "button", label: "Move up", action_id: `stage_up:${stage.id}` }]
					: []),
				...(!last
					? [{ type: "button", label: "Move down", action_id: `stage_down:${stage.id}` }]
					: []),
				{
					type: "button",
					label: "Remove",
					action_id: `stage_remove:${stage.id}`,
					style: "danger",
					confirm: {
						title: "Remove this stage?",
						text:
							count > 0
								? `This stage still has ${count} ${count === 1 ? "item" : "items"}. Move them first.`
								: "Items can no longer use this stage.",
						confirm: "Remove",
						deny: "Keep",
					},
				},
			],
		},
		{ type: "divider" },
	];
}

export async function renderSettings(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	await ensureNotifyTask(ctx);
	const settings = await loadSettings(ctx);
	const items = await listRoadmapItems(ctx);
	const counts = stageCounts(items, settings.stages);
	const mailReady = EMAIL_RE.test(settings.notifyTo);
	return {
		blocks: [
			{ type: "header", text: "Settings" },
			{ type: "section", text: "Each group saves on its own. The collection name stays internal." },
			{ type: "header", text: "Who can take part" },
			...lines([
				"Allow suggestions: when on, people can send an idea. It always waits for you to approve it.",
				"Who can vote and suggest: anyone, or signed-in members only. Anyone is the default.",
				"Guest identity uses a trusted visitor address when the host supplies one. On hosting that does not, it falls back to a browser cookie, which is weaker: clearing the cookie lets someone vote again.",
			]),
			{
				type: "form",
				block_id: "settings_who",
				fields: [
					{
						type: "toggle",
						action_id: "allow_ideas",
						label: "Allow suggestions",
						initial_value: settings.allowIdeas,
					},
					{
						type: "select",
						action_id: "who",
						label: "Who can vote and suggest",
						initial_value: settings.who,
						options: [
							{ label: "Anyone", value: "anyone" },
							{ label: "Signed-in members only", value: "members" },
						],
					},
				],
				submit: { label: "Save who can take part", action_id: "save_who" },
			},
			{ type: "divider" },
			{ type: "header", text: "Stages" },
			...lines([
				"Add, rename, reorder or hide stages. A hidden stage keeps its items off the board.",
				"On a roadmap item, set Stage to the stage name, for example Done.",
				"A stage that still has items cannot be removed until those items move.",
			]),
			...settings.stages.flatMap((stage, index) =>
				stageRow(stage, counts.get(stage.id) ?? 0, index === 0, index === settings.stages.length - 1),
			),
			{
				type: "form",
				block_id: "stage_add",
				fields: [
					{ type: "text_input", action_id: "name", label: "New stage name" },
					{
						type: "toggle",
						action_id: "shown",
						label: "Show on the board",
						initial_value: true,
					},
				],
				submit: { label: "Add stage", action_id: "add_stage" },
			},
			{
				type: "form",
				block_id: "stage_move",
				fields: [
					{
						type: "select",
						action_id: "item",
						label: "Move an item",
						options: items.length
							? items.map((item) => ({ label: item.title, value: item.id }))
							: [{ label: "No items yet", value: "" }],
					},
					{
						type: "select",
						action_id: "stage",
						label: "To this stage",
						options: settings.stages.map((stage) => ({ label: stage.name, value: stage.id })),
					},
				],
				submit: { label: "Move item", action_id: "move_item" },
			},
			{ type: "divider" },
			{ type: "header", text: "Email" },
			...lines([
				"Email me when ideas are waiting: one short notice an hour. The notice has no idea text and no link.",
				"Needs a mail provider on the site. The official Resend plugin is the usual setup.",
				mailReady
					? "Notices go to the address below."
					: "Enter an address or the notice stays off, even when the switch is on.",
			]),
			{
				type: "form",
				block_id: "settings_email",
				fields: [
					{
						type: "toggle",
						action_id: "notify",
						label: "Email me when ideas are waiting",
						initial_value: settings.notify,
					},
					{
						type: "text_input",
						action_id: "notify_to",
						label: "Send that email to",
						initial_value: settings.notifyTo,
					},
				],
				submit: { label: "Save email", action_id: "save_email" },
			},
		],
		toast: extra?.toast,
	};
}

async function saveWho(ctx: PluginContext, values: Record<string, unknown>): Promise<BlockResponse> {
	await ctx.settings.set("allow_ideas", asBoolean(values.allow_ideas));
	await ctx.settings.set("who", asString(values.who) === "members" ? "members" : "anyone");
	return saved(ctx, "Who can take part was saved.");
}

async function saveEmail(ctx: PluginContext, values: Record<string, unknown>): Promise<BlockResponse> {
	const to = asString(values.notify_to);
	if (to && !EMAIL_RE.test(to)) {
		return failed(ctx, "Enter a real email address, or leave it empty. Nothing was changed.");
	}
	await ctx.settings.set("notify", asBoolean(values.notify));
	await ctx.settings.set("notify_to", to);
	return saved(ctx, "Email settings were saved.");
}

async function handleStageSave(
	ctx: PluginContext,
	settings: Settings,
	id: string,
	values: Record<string, unknown>,
): Promise<BlockResponse> {
	const renamed = renameStage(settings.stages, id, asString(values.name));
	if (!renamed.ok) return failed(ctx, renamed.error);
	const next = setStageShown(renamed.stages, id, asBoolean(values.shown));
	if (!next) return failed(ctx, "That stage is no longer on the list.");
	await saveStages(ctx, next);
	return saved(ctx, "Stage saved.");
}

async function handleAddStage(
	ctx: PluginContext,
	settings: Settings,
	values: Record<string, unknown>,
): Promise<BlockResponse> {
	const added = addStage(settings.stages, asString(values.name), values.shown !== false);
	if (!added.ok) return failed(ctx, added.error);
	await saveStages(ctx, added.stages);
	return saved(ctx, "Stage added.");
}

async function handleRemoveStage(ctx: PluginContext, settings: Settings, id: string): Promise<BlockResponse> {
	const stage = settings.stages.find((item) => item.id === id);
	if (!stage) return failed(ctx, "That stage is no longer on the list.");
	const count = countInStage(await listRoadmapItems(ctx), stage);
	if (count > 0) {
		return failed(
			ctx,
			`This stage still has ${count} ${count === 1 ? "item" : "items"}. Move ${count === 1 ? "it" : "them"} first.`,
		);
	}
	const removed = removeStage(settings.stages, id);
	if (!removed.ok) return failed(ctx, removed.error);
	await saveStages(ctx, removed.stages);
	return saved(ctx, "Stage removed.");
}

async function handleMoveStage(
	ctx: PluginContext,
	settings: Settings,
	id: string,
	direction: "up" | "down",
): Promise<BlockResponse> {
	const moved = moveStage(settings.stages, id, direction);
	if (!moved.ok) return failed(ctx, moved.error);
	await saveStages(ctx, moved.stages);
	return saved(ctx, "Stage order saved.");
}

async function handleMoveItem(
	ctx: PluginContext,
	settings: Settings,
	values: Record<string, unknown>,
): Promise<BlockResponse> {
	const id = asString(values.item);
	const stageId = asString(values.stage);
	const stage = findStage(settings.stages, stageId);
	if (!id || !stage) return failed(ctx, "Pick an item and a stage.");
	const result = await patchStage(ctx, id, stage.name);
	if (result.state === "missing") return failed(ctx, "That item is no longer there.");
	if (result.state === "busy") {
		return failed(ctx, "That item has unpublished edits. Publish or discard them, then move it.");
	}
	return saved(ctx, `Moved to ${stage.name}.`);
}

async function handleIdeaMod(ctx: PluginContext, value: unknown): Promise<BlockResponse> {
	const { action, rev, id } = parseStamped(value);
	if (action === "approve") {
		const result = await approveIdea(ctx, id, rev);
		if (!result.ok) return renderIdeas(ctx, { toast: { message: result.error, type: "error" } });
		return renderIdeas(ctx, { toast: { message: "Idea published to the board.", type: "success" } });
	}
	if (action === "reject") {
		const result = await rejectIdea(ctx, id, rev);
		if (!result.ok) return renderIdeas(ctx, { toast: { message: result.error, type: "error" } });
		return renderIdeas(ctx, { toast: { message: "Idea rejected. It stays a draft.", type: "info" } });
	}
	return renderIdeas(ctx, { toast: { message: "Unknown decision.", type: "error" } });
}

async function handleMerge(ctx: PluginContext, values: Record<string, unknown>): Promise<BlockResponse> {
	const sourceRaw = asString(values.source);
	const keep = asString(values.keep);
	const ideaMatch = sourceRaw.match(/^idea:([^:]+):(.*)$/);
	const itemMatch = sourceRaw.match(/^item:(.+)$/);
	const sourceId = ideaMatch?.[1] || itemMatch?.[1] || sourceRaw;
	const rev = ideaMatch?.[2] || "";
	const result = await mergeItems(ctx, sourceId, keep, rev);
	if (!result.ok) return renderIdeas(ctx, { toast: { message: result.error, type: "error" } });
	return renderIdeas(ctx, { toast: { message: "Merged. Votes moved to the item you kept.", type: "success" } });
}

export async function handleAdmin(input: unknown, ctx: PluginContext): Promise<BlockResponse> {
	const raw = asRecord(input);
	const type = asString(raw.type);
	const page = asString(raw.page);
	const action = asString(raw.action_id);
	const values = asRecord(raw.values);

	if (type === "form_submit") {
		const settings = await loadSettings(ctx);
		if (action === "save_who") return saveWho(ctx, values);
		if (action === "save_email") return saveEmail(ctx, values);
		if (action === "add_stage") return handleAddStage(ctx, settings, values);
		if (action === "move_item") return handleMoveItem(ctx, settings, values);
		if (action === "merge_items") return handleMerge(ctx, values);
		if (action.startsWith("save_stage:")) return handleStageSave(ctx, settings, action.slice(11), values);
	}

	if (type === "block_action") {
		const settings = await loadSettings(ctx);
		if (action === "idea_mod") return handleIdeaMod(ctx, raw.value);
		if (action.startsWith("stage_up:")) return handleMoveStage(ctx, settings, action.slice(9), "up");
		if (action.startsWith("stage_down:")) return handleMoveStage(ctx, settings, action.slice(11), "down");
		if (action.startsWith("stage_remove:")) return handleRemoveStage(ctx, settings, action.slice(13));
	}

	if (asString(raw.widget) === "waiting" || page.includes("waiting") || page.includes("widget:waiting")) {
		return renderWaiting(ctx);
	}
	if (page.includes("settings")) return renderSettings(ctx);
	return renderIdeas(ctx);
}
