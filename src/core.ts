import type { PluginContext } from "emdash/plugin";

import { asString } from "./util";

// Lowest signed-in role (subscriber). Private routes get a host-verified routeCtx.user.
// A public route never gets a user, and a member id in the request is never trusted.
export const MEMBER = "content:read";

export type Member = { id: string; name: string | null; role: number };

export const SIGN_IN = { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
export const RATE_LIMITED = {
	ok: false,
	error: { code: "RATE_LIMITED", message: "Too many requests. Try again in an hour." },
};

export const ROADMAP = "roadmap";
export const CHANGELOG = "changelog";

export const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 8;

/** Compare-and-set so requests arriving together cannot each slip under the limit. */
export async function rateLimited(ctx: Pick<PluginContext, "kv">, who: string): Promise<boolean> {
	if (!who) return false;
	const key = `rate:${who}`;
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const seen = await ctx.kv.getVersioned<string>(key);
		const [start, count] = (seen?.value || "0|0").split("|").map(Number);
		const now = Date.now();
		const fresh = now - start > RATE_WINDOW_MS;
		if (!fresh && count >= RATE_MAX) return true;
		const next = fresh ? `${now}|1` : `${start}|${count + 1}`;
		if ((await ctx.kv.compareAndSet(key, seen?.revision ?? null, next)).applied) return false;
	}
	return true;
}

export async function collectionName(ctx: PluginContext): Promise<string> {
	return asString(await ctx.settings.get<string>("collection")) || ROADMAP;
}

export async function listCollectionSlugs(ctx: PluginContext): Promise<string[]> {
	try {
		return ((await ctx.schema?.listCollections()) ?? []).map((item) => item.slug);
	} catch {
		return [];
	}
}

export async function hasCollection(ctx: PluginContext, slug: string): Promise<boolean> {
	return (await listCollectionSlugs(ctx)).includes(slug);
}
