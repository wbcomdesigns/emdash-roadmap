/**
 * Counts the bridge calls one plugin call makes. Shared by every Wbcom plugin: copy this file byte
 * for byte, change it here first.
 *
 * On Cloudflare each route, hook or cron run of a sandboxed plugin gets 10 subrequests, and every
 * call to the site (ctx.storage, ctx.kv, ctx.content, ctx.media, ctx.schema, ctx.email, fetch)
 * is one, including the content and taxonomy writes that go through the runtime bridge since
 * EmDash 1.5. Node and the test hosts enforce nothing, so a route that needs 13 works everywhere but
 * on Cloudflare, where it fails part way, often after it has already written. Import this file
 * before the test host starts, wrap one call in countBridgeCalls(), and keep the worst case of
 * every route and hook at MAX_BRIDGE_CALLS or fewer.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import { CloudflareSandboxRunner, PluginBridge } from "@emdash-cms/cloudflare/sandbox";

/** One under the Cloudflare limit, for headroom. */
export const MAX_BRIDGE_CALLS = 9;

const nested = new AsyncLocalStorage<true>();
let calls: string[] | null = null;

// Every public bridge method is one RPC from the plugin. Methods the bridge calls on itself run
// inside the outer call's context and are not counted again.
function countMethods(target: object): void {
	const proto = target as Record<string, (...args: unknown[]) => unknown>;
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
}

countMethods(PluginBridge.prototype);

// Since EmDash 1.5 content creates, publishes and schedules, taxonomy writes and comment moderation
// go through a second bridge (PluginRuntimeBridge, one per invocation). The class is not exported,
// so patch its prototype through the first instance each loaded plugin makes.
const patched = new WeakSet<object>();
type Loaded = { createRuntimeBridge?: (invocationId: unknown) => object };
const runner = CloudflareSandboxRunner.prototype as unknown as { load: (...args: unknown[]) => Promise<Loaded> };
const load = runner.load;
runner.load = async function (this: unknown, ...args: unknown[]) {
	const plugin = await load.apply(this, args);
	const make = plugin.createRuntimeBridge;
	if (make && !(make as { counted?: true }).counted) {
		const wrapped = (invocationId: unknown) => {
			const bridge = make(invocationId);
			const proto = Object.getPrototypeOf(bridge) as object;
			if (!patched.has(proto)) {
				patched.add(proto);
				countMethods(proto);
			}
			return bridge;
		};
		(wrapped as { counted?: true }).counted = true;
		plugin.createRuntimeBridge = wrapped;
	}
	return plugin;
};

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
