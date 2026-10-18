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

const ADDRESS_KEY = "guest:address";

/**
 * Remember whether the last guest write carried a usable visitor address ("yes" or "no"), written
 * only when it changes. Settings reads it to tell the owner whether guests can take part.
 */
export async function noteGuestAddress(ctx: Ctx, usable: boolean): Promise<void> {
	const next = usable ? "yes" : "no";
	if ((await ctx.kv.get<string>(ADDRESS_KEY)) !== next) await ctx.kv.set(ADDRESS_KEY, next);
}

export async function guestAddressSeen(ctx: Ctx): Promise<"yes" | "no" | null> {
	const seen = await ctx.kv.get<string>(ADDRESS_KEY);
	return seen === "yes" || seen === "no" ? seen : null;
}
