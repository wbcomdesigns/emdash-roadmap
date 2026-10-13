import type { PluginContext } from "emdash/plugin";

import { asBoolean, asNumber, asString, parseJson } from "./util";

export type Stage = {
	id: string;
	name: string;
	order: number;
	shown: boolean;
};

export type Settings = {
	allowIdeas: boolean;
	who: "anyone" | "members";
	notify: boolean;
	notifyTo: string;
	stages: Stage[];
};

export const DEFAULT_STAGES: Stage[] = [
	{ id: "under-review", name: "Under review", order: 0, shown: true },
	{ id: "planned", name: "Planned", order: 1, shown: true },
	{ id: "in-progress", name: "In progress", order: 2, shown: true },
	{ id: "done", name: "Done", order: 3, shown: true },
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
		});
	}
	return stages.length ? sortStages(stages) : DEFAULT_STAGES.map((stage) => ({ ...stage }));
}

export async function loadSettings(ctx: PluginContext): Promise<Settings> {
	const who = asString(await ctx.settings.get<string>("who"));
	return {
		allowIdeas: (await ctx.settings.get<boolean>("allow_ideas")) !== false,
		who: who === "members" ? "members" : "anyone",
		notify: (await ctx.settings.get<boolean>("notify")) !== false,
		notifyTo: asString(await ctx.settings.get<string>("notify_to")),
		stages: normalizeStages(await ctx.settings.get("stages")),
	};
}

export async function saveStages(ctx: PluginContext, stages: Stage[]): Promise<Stage[]> {
	const next = sortStages(stages).map((stage, order) => ({ ...stage, order }));
	await ctx.settings.set("stages", JSON.stringify(next));
	return next;
}

export function findStage(stages: Stage[], value: string): Stage | null {
	const raw = asString(value);
	if (!raw) return null;
	return (
		stages.find((stage) => stage.id === raw || stage.name === raw) ||
		stages.find((stage) => stage.id.toLowerCase() === raw.toLowerCase() || stage.name.toLowerCase() === raw.toLowerCase()) ||
		null
	);
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
	return { ok: true, stages: stages.map((stage) => (stage.id === id ? { ...stage, name: label } : stage)) };
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

export async function seedDefaults(ctx: PluginContext): Promise<void> {
	if ((await ctx.settings.get("stages")) == null) await ctx.settings.set("stages", JSON.stringify(DEFAULT_STAGES));
	if ((await ctx.settings.get("allow_ideas")) == null) await ctx.settings.set("allow_ideas", true);
	if ((await ctx.settings.get("who")) == null) await ctx.settings.set("who", "anyone");
	if ((await ctx.settings.get("notify")) == null) await ctx.settings.set("notify", true);
	if ((await ctx.settings.get("collection")) == null) await ctx.settings.set("collection", "roadmap");
}
