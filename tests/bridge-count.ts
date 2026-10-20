/**
 * Counts the bridge calls one plugin call makes. Shared by every Wbcom plugin: copy this file byte
 * for byte, change it here first.
 *
 * On Cloudflare each route, hook or cron run of a sandboxed plugin gets 10 subrequests, and every
 * call to the site (ctx.storage, ctx.kv, ctx.content, ctx.media, ctx.schema, ctx.email, fetch)
 * is one. Node and the test hosts enforce nothing, so a route that needs 13 works everywhere but
 * on Cloudflare, where it fails part way, often after it has already written. Import this file
 * before the test host starts, wrap one call in countBridgeCalls(), and keep the worst case of
 * every route and hook at MAX_BRIDGE_CALLS or fewer.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { PluginBridge } from "@emdash-cms/cloudflare/sandbox";

/** One under the Cloudflare limit, for headroom. */
export const MAX_BRIDGE_CALLS = 9;

const nested = new AsyncLocalStorage<true>();
let calls: string[] | null = null;

// Every public bridge method is one RPC from the plugin. Methods the bridge calls on itself run
// inside the outer call's context and are not counted again.
const proto = PluginBridge.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
for (const name of Object.getOwnPropertyNames(proto)) {
	const method = proto[name];
	if (name === "constructor" || typeof method !== "function") continue;
	proto[name] = function (this: unknown, ...args: unknown[]) {
		const run = () => method.apply(this, args);
		if (nested.getStore()) return run();
		calls?.push(name);
		return nested.run(true, run);
	};
}

/** Run one plugin call and return its result and the bridge calls it made, in order. */
export async function countBridgeCalls<T>(call: () => Promise<T>): Promise<{ result: T; calls: string[] }> {
	calls = [];
	try {
		const result = await call();
		return { result, calls };
	} finally {
		calls = null;
	}
}
