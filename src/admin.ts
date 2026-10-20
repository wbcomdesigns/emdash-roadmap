import type { PluginContext } from "emdash/plugin";

import { CHANGELOG, EMAIL_RE, budget, collectionsHere, left, spend, type Budget } from "./core";
import { countInStage, listItems, patchStage, stageCounts, type RoadmapItem } from "./content";
import { guestAddressSeen } from "./visitor";
import {
	approveIdea,
	listPendingIdeas,
	mergeItems,
	mergeSourceValue,
	mergeStep,
	parseMergeSource,
	readJob,
	rejectIdea,
	settleIdea,
	type IdeaRow,
} from "./ideas";
import { ensureNotifyTask } from "./notify";
import {
	addStage,
	findStage,
	KIT_DONE_KEY,
	loadSettings,
	moveStage,
	removeStage,
	renameStage,
	saveStages,
	setStageShown,
	type Settings,
	type Stage,
} from "./settings";
import { upgradeDone, upgradeLabel, upgradeStep } from "./upgrade";
import { asBoolean, asRecord, asString } from "./util";

type Toast = { message: string; type: "success" | "error" | "info" };
export type BlockMap = Record<string, unknown> & { type: string };
export type BlockResponse = { blocks: BlockMap[]; toast?: Toast; refresh?: true };

const PAGE = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const lines = (items: string[]) => items.map((text) => ({ type: "context", text }));

/** One call, or null when the call has none to spare (the tile is then left out). */
async function votesThisWeek(ctx: PluginContext, b: Budget): Promise<number | null> {
	if (!spend(b)) return null;
	const since = new Date(Date.now() - WEEK_MS).toISOString();
	return ctx.storage.votes.count({ createdAt: { gte: since } }).catch(() => null);
}

/** Everything one admin call has read so far, so a screen drawn after an action reads nothing twice. */
type Admin = { ctx: PluginContext; b: Budget; settings: Settings };

function saved(a: Admin, message: string, items?: SettingsItems) {
	return renderSettings(a, { toast: { message, type: "success" }, items });
}

function failed(a: Admin, message: string, items?: SettingsItems) {
	return renderSettings(a, { toast: { message, type: "error" }, items });
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

export function kitBlocks(ctx: PluginContext, settings: Settings): BlockMap[] {
	const tag = `v${ctx.plugin.version}`;
	const guideUrl = `${REPO_URL}/blob/${tag}/docs/website/getting-started/install.md`;
	const guide = { type: "link", label: "Install guide", target: { kind: "external", url: guideUrl } };
	if (settings.kitDone === true) {
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
		// One line per address in context blocks, which wrap: a fields block cuts a long value
		// (/account/roadmap-votes/ was clipped at 390).
		{ type: "context", text: "The kit adds these pages:" },
		...lines([
			"Board: /roadmap/",
			"One item: /roadmap/<item>/",
			"Suggest an idea: /roadmap/suggest/",
			"Changelog: /changelog/",
			"Roadmap votes: /account/roadmap-votes/",
		]),
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
	/** Already read by the action: not read again. */
	pending?: { ideas: IdeaRow[]; more: boolean };
	items?: RoadmapItem[];
	/** The content types, when the action already knows the roadmap type exists. */
	here?: Set<string>;
	/** Run a step of a merge or the 0.3.0 upgrade with the calls left (page loads and Continue). */
	background?: boolean;
};

function withChoice(options: Array<{ label: string; value: string }>): Array<{ label: string; value: string }> {
	return [{ label: "Choose an item", value: "" }, ...options.filter((option) => option.value)];
}

/**
 * Waiting ideas whose draft was published from the content editor before 0.4.0 (since then the
 * content:afterPublish hook does it) are marked approved, one guarded write each, keeping a call
 * for the weekly count. Background work on a page load, like the upgrade steps.
 */
async function settleShown(a: Admin, ideas: IdeaRow[]): Promise<void> {
	for (const idea of ideas) {
		if (left(a.b) < 2) return;
		spend(a.b);
		await settleIdea(a.ctx, idea.id);
	}
}

/** The content types (one call), unless the caller already knows the roadmap type exists. */
async function typesHere(a: Admin, known?: Set<string>): Promise<Set<string> | null> {
	if (known) return known;
	spend(a.b);
	return collectionsHere(a.ctx);
}

/** Up to 100 published items, one call. Empty when the roadmap type is missing or the read failed. */
async function publishedItems(a: Admin, here: Set<string> | null): Promise<RoadmapItem[]> {
	if (!here?.has(a.settings.collection)) return [];
	spend(a.b);
	return listItems(a.ctx, a.settings.collection, "published").catch(() => []);
}

/**
 * The Ideas page. Settings (read by the caller), the content types, the waiting ideas and the
 * published items: four calls. On a page load a step of a running merge or of the 0.3.0 upgrade
 * then takes up to four more, and the weekly vote count takes the last one when it is free.
 */
export async function renderIdeas(a: Admin, extra?: IdeasExtra): Promise<BlockResponse> {
	const { ctx, settings } = a;
	const here = await typesHere(a, extra?.here);
	const collections = { roadmap: Boolean(here?.has(settings.collection)), changelog: Boolean(here?.has(CHANGELOG)) };
	let waiting = extra?.pending;
	if (!waiting) {
		spend(a.b);
		waiting = await listPendingIdeas(ctx).catch(() => ({ ideas: [] as IdeaRow[], more: false }));
	}
	const items = extra?.items ?? (await publishedItems(a, here));
	// An idea whose draft was published from the content editor before 0.4.0 is done: it is not
	// shown as waiting (since 0.4.0 the content:afterPublish hook marks it approved).
	const live = new Set(items.map((item) => item.id));
	const pending = waiting.ideas.filter((idea) => !live.has(idea.id));
	let job = readJob(settings.mergeJob);
	if (extra?.background) {
		if (job) job = await mergeStep(ctx, a.b, settings);
		else await upgradeStep(ctx, a.b, settings);
		await settleShown(a, waiting.ideas.filter((idea) => live.has(idea.id)));
	}
	const week = await votesThisWeek(ctx, a.b);
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
	const progress: BlockMap[] = [];
	if (job) {
		progress.push(
			{
				type: "banner",
				variant: "default",
				title: `Merging ${job.fromTitle} into ${job.keepTitle}`,
				description:
					job.phase === "count" || job.phase === "close"
						? "The votes have moved. The kept item's count is being checked. Continue, or the hourly task finishes it."
						: "Votes are still moving to the kept item, 100 at a time. Each Continue moves more, and the hourly task finishes it. Its count is right when the merge ends.",
			},
			{ type: "actions", elements: [{ type: "button", action_id: "bg_continue", label: "Continue" }] },
		);
	} else if (!upgradeDone(settings)) {
		progress.push(
			{
				type: "banner",
				variant: "default",
				title: "Updating roadmap data for 0.4.0",
				description: `${upgradeLabel(settings)}. Each visit to this page and the hourly task move it along. Until it ends, a vote count from before the update can be off by a few.`,
			},
			{ type: "actions", elements: [{ type: "button", action_id: "bg_continue", label: "Continue" }] },
		);
	}
	const mergeBlocks: BlockMap[] = job
		? [{ type: "context", text: "A merge is still moving votes. You can merge again when it ends." }]
		: [
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
			...kitBlocks(ctx, settings),
			...progress,
			{
				type: "stats",
				items: [
					{ label: "Ideas waiting", value: waiting.more ? `${pending.length}+` : String(pending.length) },
					...(week === null ? [] : [{ label: "Votes this week", value: String(week) }]),
				],
			},
			// Stage counts in a fields block: a stats row does not wrap, so one tile per stage ran
			// off the page on a phone and at 768 (a board can have up to 20 stages).
			{
				type: "fields",
				fields: settings.stages
					.filter((stage) => stage.shown)
					.map((stage) => ({ label: `${stage.name} (on the board)`, value: String(counts.get(stage.id) ?? 0) })),
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

/** Published and draft items, up to 100 of each, for stage counts and the Move an item list. */
type SettingsItems = { all: RoadmapItem[]; published: RoadmapItem[] };

/** The content types and two item reads: three calls (two when the roadmap type is known to exist). */
async function settingsItems(a: Admin, known = false): Promise<SettingsItems> {
	const here = known ? new Set([a.settings.collection]) : await typesHere(a);
	if (!here?.has(a.settings.collection)) return { all: [], published: [] };
	spend(a.b, 2);
	const [published, drafts] = await Promise.all([
		listItems(a.ctx, a.settings.collection, "published").catch(() => []),
		listItems(a.ctx, a.settings.collection, "draft").catch(() => []),
	]);
	return { all: [...published, ...drafts], published };
}

/** The Settings page: settings (read by the caller) and settingsItems. Four calls. */
export async function renderSettings(
	a: Admin,
	extra?: Pick<BlockResponse, "toast"> & { items?: SettingsItems },
): Promise<BlockResponse> {
	const { ctx, settings } = a;
	const address = guestAddressSeen(settings);
	const items = (extra?.items ?? (await settingsItems(a))).all;
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
				text: "Guests can vote and suggest only when your host gives EmDash the visitor's address. Whether it does shows here after guests vote or send ideas.",
			},
			{ type: "actions", elements: [guestGuide(ctx)] },
		];
	}
	return [
		{
			type: "banner",
			variant: "alert",
			title: "Guests cannot vote here",
			description:
				"In the last 24 hours no guest request came with a visitor address, so guests see a sign-in link. Members take part as usual. The guide says how to fix it.",
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

async function saveWho(a: Admin, values: Record<string, unknown>): Promise<BlockResponse> {
	spend(a.b, 2);
	const allowIdeas = asBoolean(values.allow_ideas);
	const who = asString(values.who) === "members" ? "members" : "anyone";
	await a.ctx.settings.set("allow_ideas", allowIdeas);
	await a.ctx.settings.set("who", who);
	a.settings.allowIdeas = allowIdeas;
	a.settings.who = who;
	return saved(a, "Who can take part was saved.");
}

/** Saving the email settings also makes sure the hourly task is scheduled (two calls). */
async function saveEmail(a: Admin, values: Record<string, unknown>): Promise<BlockResponse> {
	const to = asString(values.notify_to);
	if (to && !EMAIL_RE.test(to)) {
		return failed(a, "Enter a real email address, or leave it empty. Nothing was changed.");
	}
	spend(a.b, 4);
	const notify = asBoolean(values.notify);
	await a.ctx.settings.set("notify", notify);
	await a.ctx.settings.set("notify_to", to);
	a.settings.notify = notify;
	a.settings.notifyTo = to;
	await ensureNotifyTask(a.ctx).catch(() => undefined);
	return saved(a, "Email settings were saved.");
}

async function storeStages(a: Admin, stages: Stage[]): Promise<void> {
	spend(a.b);
	a.settings.stages = await saveStages(a.ctx, stages);
}

async function handleStageSave(a: Admin, id: string, values: Record<string, unknown>): Promise<BlockResponse> {
	const renamed = renameStage(a.settings.stages, id, asString(values.name));
	if (!renamed.ok) return failed(a, renamed.error);
	const next = setStageShown(renamed.stages, id, asBoolean(values.shown));
	if (!next) return failed(a, "That stage is no longer on the list.");
	if (!next.some((stage) => stage.shown)) {
		return failed(a, "Keep at least one stage on the board. New and approved ideas go to the first one shown.");
	}
	await storeStages(a, next);
	return saved(a, "Stage saved.");
}

async function handleAddStage(a: Admin, values: Record<string, unknown>): Promise<BlockResponse> {
	const added = addStage(a.settings.stages, asString(values.name), values.shown !== false);
	if (!added.ok) return failed(a, added.error);
	await storeStages(a, added.stages);
	return saved(a, "Stage added.");
}

async function handleRemoveStage(a: Admin, id: string): Promise<BlockResponse> {
	const stage = a.settings.stages.find((item) => item.id === id);
	if (!stage) return failed(a, "That stage is no longer on the list.");
	const items = await settingsItems(a);
	const count = countInStage(items.all, stage);
	if (count > 0) {
		return failed(
			a,
			`This stage still has ${count} ${count === 1 ? "item" : "items"}. Move ${count === 1 ? "it" : "them"} first.`,
			items,
		);
	}
	const removed = removeStage(a.settings.stages, id);
	if (!removed.ok) return failed(a, removed.error, items);
	await storeStages(a, removed.stages);
	return saved(a, "Stage removed.", items);
}

async function handleMoveStage(a: Admin, id: string, direction: "up" | "down"): Promise<BlockResponse> {
	const moved = moveStage(a.settings.stages, id, direction);
	if (!moved.ok) return failed(a, moved.error);
	await storeStages(a, moved.stages);
	return saved(a, "Stage order saved.");
}

/** Settings, the move (six calls at most), then the two item reads: nine. */
async function handleMoveItem(a: Admin, values: Record<string, unknown>): Promise<BlockResponse> {
	const id = asString(values.item);
	const stage = findStage(a.settings.stages, asString(values.stage));
	if (!id || !stage) return failed(a, "Pick an item and a stage.");
	spend(a.b, 6);
	const result = await patchStage(a.ctx, a.settings.collection, id, stage.name);
	if (result.state === "missing") return failed(a, "That item is no longer there.");
	// The item exists, so the roadmap type does: the page reads its items without checking again.
	const items = await settingsItems(a, true);
	if (result.state === "draft") {
		return saved(a, `Moved to ${stage.name} in the item's unpublished changes. Publish them to show it on the board.`, items);
	}
	return saved(a, `Moved to ${stage.name}.`, items);
}

/** The roadmap type exists whenever an idea or an item was just read from it. */
const known = (a: Admin) => new Set([a.settings.collection]);

async function handleIdeaMod(a: Admin, value: unknown): Promise<BlockResponse> {
	const { action, rev, id } = parseStamped(value);
	if (action === "approve") {
		// The draft read, the claim, the update, the revision and the publish (one more on a failure).
		spend(a.b, 5);
		const result = await approveIdea(a.ctx, a.settings, id, rev);
		if (!result.ok) {
			spend(a.b);
			return renderIdeas(a, { toast: { message: result.error, type: "error" }, here: known(a) });
		}
		const message = result.settled ? "That idea was already published. It left the list." : "Idea published to the board.";
		return renderIdeas(a, { toast: { message, type: "success" }, here: known(a) });
	}
	if (action === "reject") {
		spend(a.b);
		const result = await rejectIdea(a.ctx, id, rev);
		if (!result.ok) return renderIdeas(a, { toast: { message: result.error, type: "error" }, here: known(a) });
		return renderIdeas(a, { toast: { message: "Idea rejected. It stays a draft.", type: "info" }, here: known(a) });
	}
	return renderIdeas(a, { toast: { message: "Unknown decision.", type: "error" } });
}

async function handleMergeReview(a: Admin, values: Record<string, unknown>): Promise<BlockResponse> {
	const source = asString(values.source);
	const keep = asString(values.keep);
	const from = parseMergeSource(source);
	if (!from || !keep) {
		return renderIdeas(a, { toast: { message: "Choose both items.", type: "error" } });
	}
	const here = await typesHere(a);
	spend(a.b);
	const pending = await listPendingIdeas(a.ctx).catch(() => ({ ideas: [] as IdeaRow[], more: false }));
	const items = await publishedItems(a, here);
	const sourceTitle = (from.kind === "idea" ? pending.ideas : items).find((row) => row.id === from.id)?.title || "";
	const keepTitle = items.find((item) => item.id === keep)?.title || "";
	const reuse = { here: here ?? undefined, pending, items };
	if (!sourceTitle || !keepTitle) {
		return renderIdeas(a, { toast: { message: "Choose both items.", type: "error" }, ...reuse });
	}
	if (from.id === keep) {
		return renderIdeas(a, { toast: { message: "Pick two different items.", type: "error" }, ...reuse });
	}
	return renderIdeas(a, { mergeConfirm: { source, keep, sourceTitle, keepTitle }, ...reuse });
}

/** Settings, the start of the merge (five calls at most), then the page: its votes move in later steps. */
async function handleMerge(a: Admin, values: Record<string, unknown>): Promise<BlockResponse> {
	spend(a.b, 5);
	const result = await mergeItems(a.ctx, a.settings, parseMergeSource(asString(values.source)), asString(values.keep));
	if (!result.ok) return renderIdeas(a, { toast: { message: result.error, type: "error" }, here: known(a) });
	a.settings.mergeJob = result.job;
	return renderIdeas(a, {
		toast: { message: "Merge started. Its votes move to the item you kept over the next steps.", type: "success" },
		here: known(a),
	});
}

async function setKitDone(a: Admin, done: boolean): Promise<void> {
	spend(a.b);
	await a.ctx.settings.set(KIT_DONE_KEY, done);
	a.settings.kitDone = done;
}

export async function handleAdmin(input: unknown, ctx: PluginContext): Promise<BlockResponse> {
	const raw = asRecord(input);
	const type = asString(raw.type);
	const page = asString(raw.page);
	const action = asString(raw.action_id);
	const values = asRecord(raw.values);

	if (asString(raw.widget) === "waiting" || page.includes("waiting") || page.includes("widget:waiting")) {
		return renderWaiting(ctx);
	}
	const a: Admin = { ctx, b: budget(1), settings: await loadSettings(ctx) };

	if (type === "form_submit") {
		if (action === "save_who") return saveWho(a, values);
		if (action === "save_email") return saveEmail(a, values);
		if (action === "add_stage") return handleAddStage(a, values);
		if (action === "move_item") return handleMoveItem(a, values);
		if (action === "ideas_find") return renderIdeas(a, { q: asString(values.q) });
		if (action === "merge_review") return handleMergeReview(a, values);
		if (action === "merge_items") return handleMerge(a, values);
		if (action.startsWith("save_stage:")) return handleStageSave(a, action.slice(11), values);
	}

	if (type === "block_action") {
		if (action === "kit_done") {
			await setKitDone(a, true);
			return renderIdeas(a, { toast: { message: "Noted. The install guide stays linked here.", type: "success" } });
		}
		if (action === "kit_again") {
			await setKitDone(a, false);
			return renderIdeas(a);
		}
		if (action === "bg_continue") return renderIdeas(a, { background: true });
		if (action === "idea_mod") return handleIdeaMod(a, raw.value);
		if (action === "ideas_page") {
			const [offset = "0", ...rest] = asString(raw.value).split("|");
			return renderIdeas(a, { q: rest.join("|"), offset: Number(offset) || 0 });
		}
		if (action.startsWith("stage_up:")) return handleMoveStage(a, action.slice(9), "up");
		if (action.startsWith("stage_down:")) return handleMoveStage(a, action.slice(11), "down");
		if (action.startsWith("stage_remove:")) return handleRemoveStage(a, action.slice(13));
	}

	if (page.includes("settings")) return renderSettings(a);
	return renderIdeas(a, { background: true });
}
