import type { PluginContext } from "emdash/plugin";

import { guestKey } from "./visitor-key";

type Ctx = Pick<PluginContext, "kv">;

const SALT = "visitor-salt";

async function sha256(text: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function salt(ctx: Ctx): Promise<string> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const seen = await ctx.kv.getVersioned<string>(SALT);
		if (seen?.value) return seen.value;
		const next = crypto.randomUUID();
		if ((await ctx.kv.compareAndSet(SALT, seen?.revision ?? null, next)).applied) return next;
	}
	return crypto.randomUUID();
}

/**
 * The guest's key from the address EmDash gives the route: on Cloudflare, or when the site sets
 * trustedProxyHeaders. Null on any other host, or for an address that does not parse; then
 * guests cannot write (owner, 2026-10-16). One key per IPv4 address or IPv6 /64.
 */
export function requestGuest(routeCtx: { requestMeta?: unknown }): string | null {
	const meta = routeCtx.requestMeta as { ip?: string | null } | undefined;
	const ip = typeof meta?.ip === "string" ? meta.ip.trim() : "";
	if (!ip || ip.toLowerCase() === "unknown") return null;
	return guestKey(ip);
}

/** Salted hash of the guest key. Never the address itself. */
export async function visitorHash(ctx: Ctx, guest: string): Promise<string> {
	return sha256(`${await salt(ctx)}|ip|${guest}`);
}

export function visitorWho(hash: string): string {
	return `v-${hash}`;
}

const ADDRESS_KEY = "guest:address-seen";
const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_MS = 60 * 60 * 1000;

type AddressSeen = { with?: number; without?: number };

/**
 * When a guest write last came with a usable visitor address, and when one last came without.
 * Each time is rounded to the hour and written only when that changes, so a busy site does not
 * write on every request.
 */
export async function noteGuestAddress(ctx: Ctx, usable: boolean, now = Date.now()): Promise<void> {
	const seen = (await ctx.kv.get<AddressSeen>(ADDRESS_KEY)) ?? {};
	const field = usable ? "with" : "without";
	const hour = Math.floor(now / STEP_MS) * STEP_MS;
	if (seen[field] === hour) return;
	await ctx.kv.set(ADDRESS_KEY, { ...seen, [field]: hour });
}

/**
 * "no" only when no guest write in the last 24 hours had a usable address and at least one lacked
 * it, so one stray request never flips the Settings notice. null: no guest write in that time.
 */
export async function guestAddressSeen(ctx: Ctx, now = Date.now()): Promise<"yes" | "no" | null> {
	const seen = (await ctx.kv.get<AddressSeen>(ADDRESS_KEY)) ?? {};
	const recent = (at?: number) => typeof at === "number" && now - at < DAY_MS + STEP_MS;
	if (recent(seen.with)) return "yes";
	if (recent(seen.without)) return "no";
	return null;
}
