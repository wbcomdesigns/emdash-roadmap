import type { PluginContext } from "emdash/plugin";

import { EMAIL_RE } from "./core";
import { countInStage, hasCollections, listRoadmapItems, patchStage, stageCounts } from "./content";
import { guestAddressSeen } from "./visitor";
import {
	approveIdea,
	listPendingIdeas,
	mergeItems,
	mergeSourceValue,
	parseMergeSource,
	rejectIdea,
	settlePublishedIdeas,
} from "./ideas";
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
export type BlockResponse = { blocks: BlockMap[]; toast?: Toast; refresh?: true };

const PAGE = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const lines = (items: string[]) => items.map((text) => ({ type: "context", text }));

async function votesThisWeek(ctx: PluginContext): Promise<number> {
	const since = new Date(Date.now() - WEEK_MS).toISOString();
	return ctx.storage.votes.count({ createdAt: { gte: since } });
}

function saved(ctx: PluginContext, message: string) {
	return renderSettings(ctx, { toast: { message, type: "success" } });
}

function failed(ctx: PluginContext, message: string) {
	return renderSettings(ctx, { toast: { message, type: "error" } });
}

function whoLabel(idea: { name: string; visitor: string; guest: boolean }): string {
	if (idea.visitor || idea.guest) return idea.name ? `${idea.name} (guest)` : "Guest";
	return idea.name || "Member";
}

function stamped(action: string, id: string, rev: string): string {
	return `${action}|${rev}|${id}`;
}

function parseStamped(value: unknown): { action: string; rev: string; id: string } {
	const [action = "", rev = "", ...rest] = asString(value).split("|");
	return { action, rev, id: rest.join("|") };
}

const KIT_DONE = "kit_pages_done";
const REPO_URL = "https://github.com/wbcomdesigns/emdash-roadmap";

/**
 * The "Set up visitor pages" card. A registry plugin cannot add pages, so until the site kit is
 * copied every roadmap address is the site's 404. The card gives the command for the version that
 * is installed (never main), until the owner says the pages are set up; then one line to the guide.
 */
/** The kit command on six lines of 52 characters or fewer: an admin code block neither wraps nor scrolls. */
export function kitCommand(tag: string): string {
	return [
		'kit="$(mktemp -d)" &&',
		"  git clone --depth 1 \\",
		`    --branch ${tag} \\`,
		"    https://github.com/wbcomdesigns/emdash-roadmap \\",
		'    "$kit/emdash-roadmap" &&',
		'  "$kit/emdash-roadmap/scripts/add-to-site.sh" .',
	].join("\n");
}

export async function kitBlocks(ctx: PluginContext): Promise<BlockMap[]> {
	const tag = `v${ctx.plugin.version}`;
	const guideUrl = `${REPO_URL}/blob/${tag}/docs/website/getting-started/install.md`;
	const guide = { type: "link", label: "Install guide", target: { kind: "external", url: guideUrl } };
	if ((await ctx.kv.get<string>(KIT_DONE)) === "1") {
		return [
			{
				type: "context",
				text: `Visitor pages come from the Roadmap site kit. After each plugin update, copy the kit for ${tag} again.`,
			},
			{
				type: "actions",
				elements: [guide, { type: "button", action_id: "kit_again", label: "Show the setup steps again" }],
			},
		];
	}
	return [
		{
			type: "banner",
			title: "Set up visitor pages",
			description:
				"Installing Product Roadmap adds this admin, not pages on your site. The visitor pages come from the Roadmap site kit. Until you copy it, the addresses below show your site's 404 page.",
			variant: "default",
		},
		{
			type: "context",
			text: `From your site's root folder, run this command. It copies the kit for the version you have installed (${tag}).`,
		},
		// A fresh mktemp folder, never a fixed /tmp path someone else could create first; the
		// script runs only when the clone worked.
		{ type: "code", language: "bash", code: kitCommand(tag) },
		{
			type: "actions",
			elements: [
				{ type: "link", label: "Copy it from the install guide on a phone", target: { kind: "external", url: guideUrl } },
			],
		},
		{
			type: "fields",
			fields: [
				{ label: "Board", value: "/roadmap/" },
				{ label: "One item", value: "/roadmap/<item>/" },
				{ label: "Suggest an idea", value: "/roadmap/suggest/" },
				{ label: "Changelog", value: "/changelog/" },
				{ label: "Roadmap votes", value: "/account/roadmap-votes/" },
			],
		},
		{
			type: "actions",
			elements: [guide, { type: "button", action_id: "kit_done", label: "Visitor pages are set up", style: "primary" }],
		},
	];
}

type IdeasExtra = Pick<BlockResponse, "toast"> & {
	mergeConfirm?: { source: string; keep: string; sourceTitle: string; keepTitle: string };
	q?: string;
	offset?: number;
};

function withChoice(options: Array<{ label: string; value: string }>): Array<{ label: string; value: string }> {
	return [{ label: "Choose an item", value: "" }, ...options.filter((option) => option.value)];
}

export async function renderIdeas(ctx: PluginContext, extra?: IdeasExtra): Promise<BlockResponse> {
	const collections = await hasCollections(ctx);
	const settings = await loadSettings(ctx);
	const pending = await settlePublishedIdeas(ctx, await listPendingIdeas(ctx));
	const allItems = await listRoadmapItems(ctx);
	const items = allItems.filter((item) => item.published);
	// Stage counts are what the board shows. A waiting idea is a draft: it counts as waiting only.
	const counts = stageCounts(items, settings.stages);
	const q = asString(extra?.q).trim();
	const needle = q.toLowerCase();
	const matched = needle
		? pending.filter((idea) => `${idea.title} ${idea.description}`.toLowerCase().includes(needle))
		: pending;
	const offset = Math.max(0, extra?.offset ?? 0);
	const pageRows = matched.slice(offset, offset + PAGE);
	const keepOptions = withChoice(items.map((item) => ({ label: item.title, value: item.id })));
	const sourceOptions = withChoice([
		...pending.map((idea) => ({
			label: `${idea.title} (waiting)`,
			value: mergeSourceValue({ kind: "idea", id: idea.id, stamp: idea.rev }),
		})),
		...items.map((item) => ({ label: item.title, value: mergeSourceValue({ kind: "item", id: item.id, stamp: item.stamp }) })),
	]);
	const rows = pageRows.map((idea) => ({
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
	const pager: BlockMap[] = [];
	if (offset > 0 || offset + PAGE < matched.length) {
		const elements: Array<Record<string, unknown>> = [];
		if (offset > 0) {
			elements.push({
				type: "button",
				label: "Previous",
				action_id: "ideas_page",
				value: `${Math.max(0, offset - PAGE)}|${q}`,
			});
		}
		if (offset + PAGE < matched.length) {
			elements.push({
				type: "button",
				label: "Next",
				action_id: "ideas_page",
				value: `${offset + PAGE}|${q}`,
			});
		}
		if (elements.length) pager.push({ type: "actions", elements });
	}
	const missing: BlockMap[] = [];
	if (!collections.roadmap) {
		missing.push({
			type: "banner",
			title: "Create the roadmap content type",
			description:
				"Copy the seed from the site kit, or create a roadmap content type with a title, a description and a stage. Comments should be on.",
			variant: "alert",
		});
	}
	if (!collections.changelog) {
		missing.push({
			type: "banner",
			title: "Create the changelog content type",
			description: "Copy the seed from the site kit, or create a changelog content type for release notes.",
			variant: "alert",
		});
	}
	const mergeBlocks: BlockMap[] = [
		{
			type: "context",
			text: "Pick the item to drop and the item to keep. Votes move across, one per person.",
		},
		...(extra?.mergeConfirm
			? [
					{
						type: "banner",
						variant: "alert" as const,
						title: `Merge ${extra.mergeConfirm.sourceTitle} into ${extra.mergeConfirm.keepTitle}?`,
						description: "The first item is unpublished. Its votes move to the second. You cannot undo this.",
					} as BlockMap,
					{
						type: "form",
						block_id: "merge_confirm",
						fields: [
							{
								type: "combobox",
								action_id: "source",
								label: "Merge this item",
								initial_value: extra.mergeConfirm.source,
								options: [{ label: extra.mergeConfirm.sourceTitle, value: extra.mergeConfirm.source }],
							},
							{
								type: "combobox",
								action_id: "keep",
								label: "Into this item",
								initial_value: extra.mergeConfirm.keep,
								options: [{ label: extra.mergeConfirm.keepTitle, value: extra.mergeConfirm.keep }],
							},
						],
						submit: {
							label: "Merge these two",
							action_id: "merge_items",
							confirm: {
								title: `Merge ${extra.mergeConfirm.sourceTitle} into ${extra.mergeConfirm.keepTitle}?`,
								text: "The first item is unpublished. Votes move to the second.",
								confirm: "Merge",
								deny: "Cancel",
							},
						},
					} as BlockMap,
				]
			: []),
		{
			type: "form",
			block_id: "merge_items",
			fields: [
				{
					type: "combobox",
					action_id: "source",
					label: "Merge this item",
					initial_value: "",
					placeholder: "Choose an item",
					options: sourceOptions,
				},
				{
					type: "combobox",
					action_id: "keep",
					label: "Into this item",
					initial_value: "",
					placeholder: "Choose an item",
					options: keepOptions,
				},
			],
			submit: { label: "Review merge", action_id: "merge_review" },
		},
	];
	return {
		blocks: [
			{ type: "header", text: "Ideas" },
			...(await kitBlocks(ctx)),
			{
				type: "stats",
				items: [
					{ label: "Ideas waiting", value: String(pending.length) },
					...settings.stages
						.filter((stage) => stage.shown)
						.map((stage) => ({ label: stage.name, value: String(counts.get(stage.id) ?? 0) })),
					{ label: "Votes this week", value: String(await votesThisWeek(ctx)) },
				],
			},
			...missing,
			{
				type: "form",
				block_id: "ideas_find",
				fields: [
					{
						type: "text_input",
						action_id: "q",
						label: "Find",
						initial_value: q,
						placeholder: "Word in the title or the description",
					},
				],
				submit: { label: "Find", action_id: "ideas_find" },
			},
			pageRows.length === 0
				? {
						type: "empty",
						title: q ? "No ideas match that search" : "No ideas waiting",
						description: q
							? "Try a different search."
							: "Suggestions from the site wait here. Approve one to put it on the board.",
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
			...pager,
			{
				type: "accordion",
				label: "Merge a duplicate",
				default_open: Boolean(extra?.mergeConfirm),
				blocks: mergeBlocks,
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
	const address = await guestAddressSeen(ctx);
	await ensureNotifyTask(ctx);
	const settings = await loadSettings(ctx);
	const items = await listRoadmapItems(ctx);
	const counts = stageCounts(items, settings.stages);
	const mailReady = EMAIL_RE.test(settings.notifyTo);
	return {
		blocks: [
			{ type: "header", text: "Settings" },
			{
				type: "tab",
				panels: [
					{
						label: "Who can take part",
						blocks: [
							{
								type: "context",
								text: "Suggestions always wait for you to approve them. Anyone can vote, or only signed-in members.",
							},
							...guestAddressBlocks(ctx, settings.who, address),
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
								submit: { label: "Save", action_id: "save_who" },
							},
						],
					},
					{
						label: "Stages",
						blocks: [
							{
								type: "context",
								text: "Rename a stage and its items stay with it. On a roadmap item, pick the stage from the Stage panel. Keep at least one stage on the board.",
							},
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
								submit: { label: "Add a stage", action_id: "add_stage" },
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
						],
					},
					{
						label: "Email",
						blocks: [
							{
								type: "context",
								text: mailReady
									? "One short notice an hour, with no idea text and no link. Notices go to the address below."
									: "One short notice an hour, with no idea text and no link. Enter an address or the notice stays off.",
							},
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
								submit: { label: "Save", action_id: "save_email" },
							},
						],
					},
				],
			},
		],
		toast: extra?.toast,
	};
}

/** What Settings says about guests and the visitor address, from what the last guest write carried. */
function guestAddressBlocks(ctx: PluginContext, who: string, address: "yes" | "no" | null): BlockMap[] {
	if (who !== "anyone" || address === "yes") return [];
	if (address === null) {
		return [
			{
				type: "context",
				text: "Guests can vote and suggest only when your host gives EmDash the visitor's address. This shows here after the first guest vote or idea.",
			},
			{ type: "actions", elements: [guestGuide(ctx)] },
		];
	}
	return [
		{
			type: "banner",
			variant: "alert",
			title: "Guests cannot vote or suggest on this host",
			description:
				"The last guest request came without a visitor address, so guests see a sign-in link. Members take part as usual. The guide says how to fix it.",
		},
		{ type: "actions", elements: [guestGuide(ctx)] },
	];
}

function guestGuide(ctx: PluginContext) {
	return {
		type: "link",
		label: "How to turn on guest voting",
		target: {
			kind: "external",
			url: `${REPO_URL}/blob/v${ctx.plugin.version}/docs/website/getting-started/install.md#guests-and-the-visitor-address`,
		},
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
	if (!next.some((stage) => stage.shown)) {
		return failed(ctx, "Keep at least one stage on the board. New and approved ideas go to the first one shown.");
	}
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
	if (result.state === "draft") {
		return saved(ctx, `Moved to ${stage.name} in the item's unpublished changes. Publish them to show it on the board.`);
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

async function handleMergeReview(ctx: PluginContext, values: Record<string, unknown>): Promise<BlockResponse> {
	const source = asString(values.source);
	const keep = asString(values.keep);
	const from = parseMergeSource(source);
	if (!from || !keep) {
		return renderIdeas(ctx, { toast: { message: "Choose both items.", type: "error" } });
	}
	const pending = await listPendingIdeas(ctx);
	const items = (await listRoadmapItems(ctx)).filter((item) => item.published);
	const sourceTitle =
		(from.kind === "idea" ? pending : items).find((row) => row.id === from.id)?.title || "";
	const keepTitle = items.find((item) => item.id === keep)?.title || "";
	if (!sourceTitle || !keepTitle) {
		return renderIdeas(ctx, { toast: { message: "Choose both items.", type: "error" } });
	}
	if (from.id === keep) {
		return renderIdeas(ctx, { toast: { message: "Pick two different items.", type: "error" } });
	}
	return renderIdeas(ctx, { mergeConfirm: { source, keep, sourceTitle, keepTitle } });
}

async function handleMerge(ctx: PluginContext, values: Record<string, unknown>): Promise<BlockResponse> {
	const result = await mergeItems(ctx, parseMergeSource(asString(values.source)), asString(values.keep));
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
		if (action === "ideas_find") return renderIdeas(ctx, { q: asString(values.q) });
		if (action === "merge_review") return handleMergeReview(ctx, values);
		if (action === "merge_items") return handleMerge(ctx, values);
		if (action.startsWith("save_stage:")) return handleStageSave(ctx, settings, action.slice(11), values);
	}

	if (type === "block_action") {
		const settings = await loadSettings(ctx);
		if (action === "kit_done") {
			await ctx.kv.set(KIT_DONE, "1");
			return renderIdeas(ctx, { toast: { message: "Noted. The install guide stays linked here.", type: "success" } });
		}
		if (action === "kit_again") {
			await ctx.kv.delete(KIT_DONE);
			return renderIdeas(ctx);
		}
		if (action === "idea_mod") return handleIdeaMod(ctx, raw.value);
		if (action === "ideas_page") {
			const [offset = "0", ...rest] = asString(raw.value).split("|");
			return renderIdeas(ctx, { q: rest.join("|"), offset: Number(offset) || 0 });
		}
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
