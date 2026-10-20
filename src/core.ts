import type { PluginContext } from "emdash/plugin";

// Lowest signed-in role (subscriber). Private routes get a host-verified routeCtx.user.
// A public route never gets a user, and a member id in the request is never trusted.
export const MEMBER = "content:read";

export type Member = { id: string; name: string | null; role: number };

export const SIGN_IN = { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
export const RATE_LIMITED = {
	ok: false,
	error: { code: "RATE_LIMITED", message: "Too many requests. Try again in an hour." },
};
export const MEMBERS_ONLY = { ok: false, error: { code: "MEMBERS_ONLY", message: "Sign in to continue." } };
export const SPAM = { ok: false, error: { code: "SPAM", message: "That request was not accepted." } };
/**
 * No usable visitor address: the guest is sent to sign in. The code is MEMBERS_ONLY because every
 * kit since 0.1 maps it to the sign-in path; the reason lets the 0.3.0 kit use its own wording.
 */
export const GUEST_UNAVAILABLE = {
	ok: false,
	error: { code: "MEMBERS_ONLY", reason: "GUEST_UNAVAILABLE", message: "Sign in to vote or suggest on this site." },
};
export const NO_VISITOR = { ok: false, error: { code: "NO_VISITOR", message: "Could not identify this visitor." } };
export const IDEAS_CLOSED = { ok: false, error: { code: "IDEAS_CLOSED", message: "Suggestions are closed." } };
export const INVALID = { ok: false, error: { code: "INVALID", message: "Check the form and try again." } };
export const STALE = { ok: false, error: { code: "STALE", message: "That idea changed after this page loaded." } };
export const NAME_REQUIRED = { ok: false, error: { code: "NAME_REQUIRED", message: "Give a name." } };
export const FAILED = { ok: false, error: { code: "FAILED", message: "Something went wrong. Try again." } };
/** Another request from the same visitor landed at the same moment. Nothing was written. */
export const BUSY = { ok: false, error: { code: "BUSY", message: "Busy. Try again in a moment." } };

export const ROADMAP = "roadmap";
export const CHANGELOG = "changelog";

export const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * Bridge calls one plugin call may make. On Cloudflare each route, hook, admin action and cron run
 * gets 10 requests to the site, and every ctx.storage, ctx.kv, ctx.settings, ctx.content,
 * ctx.schema, ctx.redirects and ctx.email call is one. One under the limit, for headroom
 * (tests/bridge-budget.test.ts holds every entry point to it).
 */
export const MAX_CALLS = 9;

/** Calls made so far in this plugin call. Optional work spends from it and stops when it is empty. */
export type Budget = { used: number };

export const budget = (used = 0): Budget => ({ used });

/** Take `n` calls. False, and nothing taken, when they would pass MAX_CALLS. */
export function spend(b: Budget, n = 1): boolean {
	if (b.used + n > MAX_CALLS) return false;
	b.used += n;
	return true;
}

/** Calls still free. */
export const left = (b: Budget) => MAX_CALLS - b.used;

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 8;

/**
 * The hourly limit, in two calls: read the counter and move it with one compare-and-set. A lost
 * compare-and-set means another request from the same person landed at the same moment: "busy",
 * never a retry loop. Kept in kv under `rate:<who>`, the same key and value 0.3.0 used.
 */
export async function rateLimit(ctx: Pick<PluginContext, "kv">, who: string): Promise<"ok" | "limited" | "busy"> {
	if (!who) return "ok";
	const key = `rate:${who}`;
	const seen = await ctx.kv.getVersioned<string>(key);
	const [start = 0, count = 0] = (seen?.value || "0|0").split("|").map(Number);
	const now = Date.now();
	const fresh = now - start > RATE_WINDOW_MS;
	if (!fresh && count >= RATE_MAX) return "limited";
	const next = fresh ? `${now}|1` : `${start}|${count + 1}`;
	return (await ctx.kv.compareAndSet(key, seen?.revision ?? null, next)).applied ? "ok" : "busy";
}

/** The answer for a rate limit that did not pass, or null when it passed. */
export function rateRefusal(result: "ok" | "limited" | "busy") {
	if (result === "limited") return RATE_LIMITED;
	if (result === "busy") return BUSY;
	return null;
}

/** Which content types exist. One call. Null when the read failed: never taken for "none". */
export async function collectionsHere(ctx: PluginContext): Promise<Set<string> | null> {
	try {
		return new Set(((await ctx.schema?.listCollections()) ?? []).map((item) => item.slug));
	} catch {
		return null;
	}
}

/**
 * Whether the roadmap content type exists, in one call. Every content read on a visitor route
 * checks this first (null: the check itself failed, so the caller answers FAILED, never NOT_FOUND): before the seed step, a content read on a missing collection fails inside
 * EmDash's sandbox bridge as an uncaught error (and on some hosts hangs until the runtime cancels).
 */
export async function roadmapReady(ctx: PluginContext, collection: string): Promise<boolean | null> {
	const here = await collectionsHere(ctx);
	return here ? here.has(collection) : null;
}
