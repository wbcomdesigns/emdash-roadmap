import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { CHANGELOG, ROADMAP, hasCollection } from "./core";
import { ensureNotifyTask, notifyOwners } from "./notify";
import { seedDefaults } from "./settings";

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
		health: {
			public: true,
			handler: async (_routeCtx, ctx) => {
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
				};
			},
		},
		admin: {
			handler: async (routeCtx, ctx) => handleAdmin(routeCtx.input, ctx),
		},
	},
};

export default plugin;
