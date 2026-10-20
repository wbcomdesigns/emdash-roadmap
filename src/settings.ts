import type { PluginContext } from "emdash/plugin";

import { asNumber, asString, parseJson } from "./util";

export type Stage = {
	id: string;
	name: string;
	order: number;
	shown: boolean;
	/** Previous names. Items keep the name they were saved with, so rename must still find them. */
	aliases: string[];
};

export type Settings = {
	allowIdeas: boolean;
	who: "anyone" | "members";
	notify: boolean;
	notifyTo: string;
	stages: Stage[];
	/** Content type that holds the items. Internal: never shown on the Settings page. */
	collection: string;
	/** Per-site salt for guest keys. Empty until the first guest or the 0.4.0 upgrade copies it from kv. */
	salt: string;
	/** When a guest write last came with and without a usable visitor address (hour starts). */
	guestSeen: { with?: number; without?: number };
	/** The owner said the visitor pages are set up. Null: not answered here yet (0.3.0 kept it in kv). */
	kitDone: boolean | null;
	/** Where the 0.3.0 to 0.4.0 data upgrade is (src/upgrade.ts). */
	upgrade: Record<string, unknown>;
	/** A merge whose votes are still moving (src/merge.ts), or null. */
	mergeJob: Record<string, unknown> | null;
};

export const SALT_KEY = "visitor_salt";
export const GUEST_SEEN_KEY = "guest_seen";
export const KIT_DONE_KEY = "kit_done";
export const UPGRADE_KEY = "upgrade_0_4";
export const MERGE_KEY = "merge_job";

export const DEFAULT_STAGES: Stage[] = [
	{ id: "under-review", name: "Under review", order: 0, shown: true, aliases: [] },
	{ id: "planned", name: "Planned", order: 1, shown: true, aliases: [] },
	{ id: "in-progress", name: "In progress", order: 2, shown: true, aliases: [] },
	{ id: "done", name: "Done", order: 3, shown: true, aliases: [] },
];

export const STAGE_NAME_MAX = 40;
export const STAGE_MAX = 20;

function sortStages(stages: Stage[]): Stage[] {
	return [...stages].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function normalizeStages(input: unknown): Stage[] {
	const raw = parseJson<unknown[]>(input, []);
	if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_STAGES.map((stage) => ({ ...stage }));
	const seen = new Set<string>();
	const stages: Stage[] = [];
	for (const [index, item] of raw.entries()) {
		if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
		const row = item as Record<string, unknown>;
		const name = asString(row.name).slice(0, STAGE_NAME_MAX);
		const legacy = DEFAULT_STAGES.find((stage) => stage.name === asString(row.id));
		const id = legacy?.id || asString(row.id) || name;
		if (!id || !name || seen.has(id)) continue;
		seen.add(id);
		stages.push({
			id,
			name,
			order: asNumber(row.order) ?? index,
			shown: row.shown !== false,
			aliases: aliasesOf(row, id, name),
		});
	}
	return stages.length ? sortStages(stages) : DEFAULT_STAGES.map((stage) => ({ ...stage }));
}

/**
 * Every setting in one call (ctx.settings.list). Read once per plugin call and passed down: no path
 * pays one call per key. Unset keys read as their defaults, so nothing has to be written at install.
 */
export async function loadSettings(ctx: PluginContext): Promise<Settings> {
	const all = new Map((await ctx.settings.list()).map((row) => [row.key, row.value]));
	const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
	const seen = record(all.get(GUEST_SEEN_KEY)) ?? {};
	const kit = all.get(KIT_DONE_KEY);
	return {
		allowIdeas: all.get("allow_ideas") !== false,
		who: asString(all.get("who")) === "members" ? "members" : "anyone",
		notify: all.get("notify") !== false,
		notifyTo: asString(all.get("notify_to")),
		stages: normalizeStages(all.get("stages")),
		collection: asString(all.get("collection")) || "roadmap",
		salt: asString(all.get(SALT_KEY)),
		guestSeen: {
			with: asNumber(seen.with) ?? undefined,
			without: asNumber(seen.without) ?? undefined,
		},
		kitDone: typeof kit === "boolean" ? kit : null,
		upgrade: record(all.get(UPGRADE_KEY)) ?? {},
		mergeJob: record(all.get(MERGE_KEY)),
	};
}

export async function saveStages(ctx: PluginContext, stages: Stage[]): Promise<Stage[]> {
	const next = sortStages(stages).map((stage, order) => ({ ...stage, order }));
	await ctx.settings.set("stages", JSON.stringify(next));
	return next;
}

function aliasesOf(row: Record<string, unknown>, id: string, name: string): string[] {
	const raw = Array.isArray(row.aliases) ? row.aliases.map(asString).filter(Boolean) : [];
	const skip = new Set([id.toLowerCase(), name.toLowerCase()]);
	const seen = new Set<string>();
	const aliases: string[] = [];
	for (const alias of raw) {
		const key = alias.toLowerCase();
		if (skip.has(key) || seen.has(key)) continue;
		seen.add(key);
		aliases.push(alias);
	}
	return aliases;
}

function matchesStage(stage: Stage, raw: string): boolean {
	if (stage.id === raw || stage.name === raw) return true;
	return stage.aliases.some((alias) => alias === raw);
}

function matchesStageLoose(stage: Stage, raw: string): boolean {
	const lower = raw.toLowerCase();
	if (stage.id.toLowerCase() === lower || stage.name.toLowerCase() === lower) return true;
	return stage.aliases.some((alias) => alias.toLowerCase() === lower);
}

export function findStage(stages: Stage[], value: string): Stage | null {
	const raw = asString(value);
	if (!raw) return null;
	return stages.find((stage) => matchesStage(stage, raw)) || stages.find((stage) => matchesStageLoose(stage, raw)) || null;
}

/** Where new and approved ideas go: the first stage visitors can see on the board. */
export function firstStage(stages: Stage[]): Stage {
	const sorted = sortStages(stages);
	return sorted.find((stage) => stage.shown) ?? sorted[0] ?? DEFAULT_STAGES[0]!;
}

function slugId(name: string, taken: Set<string>): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, STAGE_NAME_MAX) || "stage";
	let id = base;
	let n = 2;
	while (taken.has(id)) {
		id = `${base}-${n}`;
		n += 1;
	}
	return id;
}

export function addStage(
	stages: Stage[],
	name: string,
	shown = true,
): { ok: true; stages: Stage[] } | { ok: false; error: string } {
	const label = asString(name).slice(0, STAGE_NAME_MAX);
	if (!label) return { ok: false, error: "Give the stage a name." };
	if (stages.length >= STAGE_MAX) return { ok: false, error: `The board can have at most ${STAGE_MAX} stages.` };
	if (findStage(stages, label)) return { ok: false, error: "A stage with that name already exists." };
	const next = sortStages(stages);
	next.push({
		id: slugId(label, new Set(next.map((stage) => stage.id))),
		name: label,
		order: next.length,
		shown,
		aliases: [],
	});
	return { ok: true, stages: next };
}

export function renameStage(
	stages: Stage[],
	id: string,
	name: string,
): { ok: true; stages: Stage[] } | { ok: false; error: string } {
	const label = asString(name).slice(0, STAGE_NAME_MAX);
	if (!label) return { ok: false, error: "Give the stage a name." };
	const current = stages.find((stage) => stage.id === id);
	if (!current) return { ok: false, error: "That stage is no longer on the list." };
	const clash = findStage(stages, label);
	if (clash && clash.id !== id) return { ok: false, error: "A stage with that name already exists." };
	return {
		ok: true,
		stages: stages.map((stage) => {
			if (stage.id !== id) return stage;
			const aliases = aliasesOf({ aliases: [...stage.aliases, stage.name] }, stage.id, label);
			return { ...stage, name: label, aliases };
		}),
	};
}

export function setStageShown(stages: Stage[], id: string, shown: boolean): Stage[] | null {
	if (!stages.some((stage) => stage.id === id)) return null;
	return stages.map((stage) => (stage.id === id ? { ...stage, shown } : stage));
}

export function moveStage(
	stages: Stage[],
	id: string,
	direction: "up" | "down",
): { ok: true; stages: Stage[] } | { ok: false; error: string } {
	const ordered = sortStages(stages);
	const index = ordered.findIndex((stage) => stage.id === id);
	if (index === -1) return { ok: false, error: "That stage is no longer on the list." };
	const swap = direction === "up" ? index - 1 : index + 1;
	if (swap < 0 || swap >= ordered.length) return { ok: true, stages: ordered };
	const next = [...ordered];
	[next[index], next[swap]] = [next[swap]!, next[index]!];
	return { ok: true, stages: next };
}

export function removeStage(stages: Stage[], id: string): { ok: true; stages: Stage[] } | { ok: false; error: string } {
	if (stages.length <= 1) return { ok: false, error: "Keep at least one stage." };
	if (!stages.some((stage) => stage.id === id)) return { ok: false, error: "That stage is no longer on the list." };
	return { ok: true, stages: stages.filter((stage) => stage.id !== id) };
}
