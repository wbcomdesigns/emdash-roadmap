import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { keepPanelStage, loadBoard } from "./content";
import { handleEditorPanel } from "./editor";
import { CHANGELOG, MEMBER, ROADMAP, hasCollection } from "./core";
import { forgetOldGuests } from "./ideas";
import { ensureNotifyTask, notifyOwners } from "./notify";
import { loadSettings, seedDefaults } from "./settings";
import { handleSuggest, handleSuggestGuest } from "./suggest";
import { handleVote, handleVoteGuest, listMyVotes } from "./vote";
import { requestGuest } from "./visitor";

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
		"content:beforeSave": {
			handler: async (event, ctx) => keepPanelStage(ctx, event),
		},
		cron: {
			handler: async (event, ctx) => {
				if (event.name !== "notify") return;
				await notifyOwners(ctx);
				await forgetOldGuests(ctx);
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
