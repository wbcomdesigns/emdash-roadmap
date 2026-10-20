import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { keepPanelStage, loadBoard } from "./content";
import { handleEditorPanel } from "./editor";
import { CHANGELOG, MEMBER, ROADMAP, budget, collectionsHere, left } from "./core";
import { forgetGuestIdeas, forgetGuestVotes, forgetRateKeys, mergeStep, readJob, settleIdea } from "./ideas";
import { ensureNotifyTask, notifyOwners } from "./notify";
import { loadSettings, SALT_KEY, UPGRADE_KEY } from "./settings";
import { handleSuggest, handleSuggestGuest } from "./suggest";
import { ensureTally, setLive } from "./tally";
import { upgradeDone, upgradeStep, UPGRADE_STEP } from "./upgrade";
import { handleVote, handleVoteGuest, listMyVotes } from "./vote";
import { requestGuest } from "./visitor";
import { asRecord, asString } from "./util";

/** The entry id a content hook is about, for roadmap items only. */
function roadmapEntry(event: { collection?: string; id?: string; content?: unknown }): string {
	if (event.collection !== ROADMAP) return "";
	return asString(event.id) || asString(asRecord(event.content).id);
}

/**
 * Hourly, within the call's budget, most important first: the owner notice (five calls at most),
 * a step of a running merge or of the 0.3.0 upgrade, then dropping guest hashes older than 30 days
 * and finished hourly-limit counters a batch at a time. What does not fit waits for the next hour.
 */
async function hourly(ctx: Parameters<typeof notifyOwners>[0]): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	await notifyOwners(ctx, b, settings);
	if (readJob(settings.mergeJob)) await mergeStep(ctx, b, settings);
	else if (!upgradeDone(settings) && left(b) >= UPGRADE_STEP) await upgradeStep(ctx, b, settings);
	if ((await forgetGuestVotes(ctx, b)) === null) return;
	if ((await forgetGuestIdeas(ctx, b)) === null) return;
	await forgetRateKeys(ctx, b);
}

const plugin: SandboxedPlugin = {
	hooks: {
		// Settings need no defaults written: an unset key reads as its default. Five calls: the hourly
		// task (two), the guest salt, and on a site with no 0.3.0 counts the upgrade is marked done.
		"plugin:install": {
			handler: async (_event, ctx) => {
				await ensureNotifyTask(ctx);
				await ctx.settings.compareAndSet(SALT_KEY, null, crypto.randomUUID()).catch(() => undefined);
				if ((await ctx.storage.tallies.count({ v: null })) === 0) {
					await ctx.settings.compareAndSet(UPGRADE_KEY, null, { phase: "done", after: "", big: "" }).catch(() => undefined);
				}
			},
		},
		"plugin:activate": {
			handler: async (_event, ctx) => ensureNotifyTask(ctx),
		},
		"content:beforeSave": {
			handler: async (event, ctx) => keepPanelStage(ctx, event),
		},
		// Published: the item's count row is marked live (made, at zero, when it has none) so a
		// vote can skip the content read, and a waiting idea for it is done. Three calls at most.
		"content:afterPublish": {
			handler: async (event, ctx) => {
				const id = roadmapEntry(event);
				if (!id) return;
				if (!(await setLive(ctx, id, true))) await ensureTally(ctx, id);
				await settleIdea(ctx, id);
			},
		},
		"content:afterUnpublish": {
			handler: async (event, ctx) => {
				const id = roadmapEntry(event);
				if (id) await setLive(ctx, id, false);
			},
		},
		"content:afterDelete": {
			handler: async (event, ctx) => {
				const id = roadmapEntry(event);
				if (id) await setLive(ctx, id, false);
			},
		},
		// Restored from the trash: live again only when it comes back published.
		"content:afterRestore": {
			handler: async (event, ctx) => {
				const id = roadmapEntry(event);
				if (id) await setLive(ctx, id, asRecord(event.content).status === "published");
			},
		},
		cron: {
			handler: async (event, ctx) => {
				if (event.name !== "notify") return;
				await hourly(ctx);
			},
		},
	},
	routes: {
		board: {
			public: true,
			cacheControl: "public, max-age=30, stale-while-revalidate=120",
			handler: async (routeCtx, ctx) => loadBoard(ctx, routeCtx.input),
		},
		health: {
			public: true,
			handler: async (routeCtx, ctx) => {
				const settings = await loadSettings(ctx);
				const here = await collectionsHere(ctx);
				return {
					ok: true,
					plugin: ctx.plugin.id,
					version: ctx.plugin.version,
					collection: Boolean(here?.has(ROADMAP)),
					changelog: Boolean(here?.has(CHANGELOG)),
					allowIdeas: settings.allowIdeas,
					who: settings.who,
					// Guests can vote and suggest only when the host gives the visitor's address.
					guestWrites: settings.who === "anyone" && requestGuest(routeCtx) !== null,
				};
			},
		},
		vote: {
			permission: MEMBER,
			methods: ["POST", "DELETE"],
			handler: handleVote,
		},
		votes: {
			permission: MEMBER,
			methods: ["GET", "DELETE"],
			handler: listMyVotes,
		},
		vote_guest: {
			public: true,
			methods: ["POST", "DELETE"],
			handler: handleVoteGuest,
		},
		suggest: {
			permission: MEMBER,
			methods: ["POST"],
			handler: handleSuggest,
		},
		suggest_guest: {
			public: true,
			methods: ["POST"],
			handler: handleSuggestGuest,
		},
		admin: {
			handler: async (routeCtx, ctx) => handleAdmin(routeCtx.input, ctx),
		},
		editor_stage: {
			handler: async (routeCtx, ctx) => handleEditorPanel(routeCtx, ctx),
		},
	},
};

export default plugin;
