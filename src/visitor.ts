import type { PluginContext } from "emdash/plugin";

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
 * The visitor's address as EmDash gives it: on Cloudflare, or when the site sets
 * trustedProxyHeaders. Null on any other host, and then guests cannot write (owner, 2026-10-16).
 */
export function requestIp(routeCtx: { requestMeta?: unknown }): string | null {
	const meta = routeCtx.requestMeta as { ip?: string | null } | undefined;
	const ip = typeof meta?.ip === "string" ? meta.ip.trim() : "";
	if (!ip || ip.toLowerCase() === "unknown") return null;
	return ip;
}

/** One guest per IPv4 address, and one per IPv6 /64, so rotating addresses inside a /64 is one guest. */
export function guestKey(ip: string): string {
	if (!ip.includes(":")) return ip;
	const bare = ip.replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase();
	const [head = "", tail = ""] = bare.split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const fill = bare.includes("::") ? Array(Math.max(0, 8 - left.length - right.length)).fill("0") : [];
	const groups = [...left, ...fill, ...right].map((group) => (group.replace(/^0+/, "") || "0"));
	return `${groups.slice(0, 4).join(":")}::/64`;
}

/** Salted hash of the guest's address. Never the address itself. */
export async function visitorHash(ctx: Ctx, ip: string): Promise<string> {
	return sha256(`${await salt(ctx)}|ip|${guestKey(ip)}`);
}

export function visitorWho(hash: string): string {
	return `v-${hash}`;
}
