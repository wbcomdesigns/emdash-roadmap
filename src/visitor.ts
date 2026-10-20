import type { PluginContext } from "emdash/plugin";

import { spend, type Budget } from "./core";
import { GUEST_SEEN_KEY, SALT_KEY, type Settings } from "./settings";
import { guestKey } from "./visitor-key";

type Ctx = Pick<PluginContext, "kv" | "settings">;

/** Where 0.3.0 kept the salt. The 0.4.0 upgrade copies it into the settings record. */
export const OLD_SALT_KEY = "visitor-salt";

async function sha256(text: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The site's salt. From the settings already read (no call), else the 0.3.0 copy in kv (one call),
 * else a new one created in settings (one more). Null when another first guest created it at the
 * same moment: never a one-off salt, which would let the same guest vote twice.
 */
export async function siteSalt(ctx: Ctx, b: Budget, settings: Pick<Settings, "salt">): Promise<string | null> {
	if (settings.salt) return settings.salt;
	spend(b);
	const old = await ctx.kv.get<string>(OLD_SALT_KEY);
	if (typeof old === "string" && old) return old;
	spend(b);
	const next = crypto.randomUUID();
	return (await ctx.settings.compareAndSet(SALT_KEY, null, next)).applied ? next : null;
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
export async function visitorHash(salt: string, guest: string): Promise<string> {
	return sha256(`${salt}|ip|${guest}`);
}

export function visitorWho(hash: string): string {
	return `v-${hash}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_MS = 60 * 60 * 1000;

/**
 * When a guest write last came with a usable visitor address, and when one last came without, in
 * the settings record. Each time is rounded to the hour and written only when that changes and the
 * call has a request to spare, so a busy site does not write on every request. Never throws.
 */
export async function noteGuestAddress(ctx: Ctx, b: Budget, settings: Pick<Settings, "guestSeen">, usable: boolean, now = Date.now()): Promise<void> {
	const field = usable ? "with" : "without";
	const hour = Math.floor(now / STEP_MS) * STEP_MS;
	if (settings.guestSeen[field] === hour || !spend(b)) return;
	await ctx.settings.set(GUEST_SEEN_KEY, { ...settings.guestSeen, [field]: hour }).catch(() => undefined);
}

/**
 * "no" only when no guest write in the last 24 hours had a usable address and at least one lacked
 * it, so one stray request never flips the Settings notice. null: no guest write in that time.
 */
export function guestAddressSeen(settings: Pick<Settings, "guestSeen">, now = Date.now()): "yes" | "no" | null {
	const seen = settings.guestSeen;
	const recent = (at?: number) => typeof at === "number" && now - at < DAY_MS + STEP_MS;
	if (recent(seen.with)) return "yes";
	if (recent(seen.without)) return "no";
	return null;
}
