import { describe, expect, it } from "vitest";

import plugin from "../src/plugin";

type Handler = (event: unknown, ctx: unknown) => Promise<void>;
const hook = (name: string) => (plugin.hooks as Record<string, { handler: Handler }>)[name]!.handler;

/** A site whose scheduler is unavailable. */
function site() {
	const logged: string[] = [];
	const fail = async () => Promise.reject(new Error("scheduler unavailable"));
	const ctx = {
		cron: { list: fail, schedule: fail },
		kv: { get: async () => null },
		settings: { compareAndSet: async () => ({ applied: true }) },
		storage: { tallies: { count: async () => 0 } },
		log: { error: (message: string) => logged.push(message), info() {}, warn() {} },
	};
	return { ctx, logged };
}

describe("a failed setup never disables Product Roadmap (EmDash 1.5 disables a plugin whose install or activate throws)", () => {
	for (const name of ["plugin:install", "plugin:activate"]) {
		it(`${name} logs the error instead of throwing`, async () => {
			const { ctx, logged } = site();
			await expect(hook(name)({}, ctx)).resolves.toBeUndefined();
			expect(logged).toEqual(["Product Roadmap could not finish setting up. Deactivate and activate it again."]);
		});
	}
});
