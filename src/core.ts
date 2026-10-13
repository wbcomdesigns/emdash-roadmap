import type { PluginContext } from "emdash/plugin";

import { asRecord, asString } from "./util";

// Lowest signed-in role (subscriber). Private routes get a host-verified routeCtx.user.
// A public route never gets a user, and a member id in the request is never trusted.
export const MEMBER = "content:read";

export type Member = { id: string; name: string | null; role: number };

export const SIGN_IN = { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
export const RATE_LIMITED = {
	ok: false,
	error: { code: "RATE_LIMITED", message: "Too many requests. Try again in an hour." },
};

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 8;

// ponytail: KV read-then-write is not atomic, so a burst of parallel requests can slip a few
// past the cap. Fine for throttling abuse; move to a host rate-limit primitive if one ships.
export async function rateLimited(ctx: PluginContext, who: string): Promise<boolean> {
	const key = `rate:${who}`;
	const [start, count] = ((await ctx.kv.get<string>(key)) || "0|0").split("|").map(Number);
	const now = Date.now();
	if (now - start > RATE_WINDOW_MS) {
		await ctx.kv.set(key, `${now}|1`);
		return false;
	}
	if (count >= RATE_MAX) return true;
	await ctx.kv.set(key, `${start}|${count + 1}`);
	return false;
}

export type EntryRef = { title: string; url: string; published: boolean };

export async function entryRef(ctx: PluginContext, collection: string, id: string): Promise<EntryRef | null> {
	const item = await ctx.content?.get?.(collection, id).catch(() => null);
	if (!item) return null;
	const published = item.status === "published";
	const url = published ? await ctx.content?.getPublicUrl?.(collection, id).catch(() => null) : null;
	return {
		title: asString(asRecord(item.data).title) || item.slug || id,
		url: url || "",
		published,
	};
}
