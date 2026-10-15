import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { loadBoard } from "./content";
import { handleEditorPanel } from "./editor";
import { CHANGELOG, MEMBER, ROADMAP, hasCollection } from "./core";
import { ensureNotifyTask, notifyOwners } from "./notify";
import { loadSettings, seedDefaults } from "./settings";
import { handleSuggest, handleSuggestGuest } from "./suggest";
import { handleVote, handleVoteGuest, listMyVotes } from "./vote";

const plugin: SandboxedPlugin = {
	hooks: {
		"plugin:install": {
			handler: async (_event, ctx) => {
				await seedDefaults(ctx);
				await ensureNotifyTask(ctx);
			},
		},
		"plugin:activate": {
			handler: async (_event, ctx) => {
				await seedDefaults(ctx);
				await ensureNotifyTask(ctx);
			},
		},
		cron: {
			handler: async (event, ctx) => {
				if (event.name === "notify") await notifyOwners(ctx);
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
			handler: async (_routeCtx, ctx) => {
				const settings = await loadSettings(ctx);
				const [roadmap, changelog] = await Promise.all([
					hasCollection(ctx, ROADMAP),
					hasCollection(ctx, CHANGELOG),
				]);
				return {
					ok: true,
					plugin: ctx.plugin.id,
					version: ctx.plugin.version,
					collection: roadmap,
					changelog,
					allowIdeas: settings.allowIdeas,
					who: settings.who,
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
