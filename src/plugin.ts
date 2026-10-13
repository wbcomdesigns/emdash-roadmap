import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";

const plugin: SandboxedPlugin = {
	routes: {
		health: {
			public: true,
			handler: async (_routeCtx, ctx) => ({ ok: true, plugin: ctx.plugin.id, version: ctx.plugin.version }),
		},
		admin: {
			handler: async (routeCtx, ctx) => handleAdmin(routeCtx.input, ctx),
		},
	},
};

export default plugin;
