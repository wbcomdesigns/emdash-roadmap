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

export function requestIp(routeCtx: { requestMeta?: unknown }): string | null {
	const meta = routeCtx.requestMeta as { ip?: string | null } | undefined;
	const ip = typeof meta?.ip === "string" ? meta.ip.trim() : "";
	return ip || null;
}

/** Hash of the IP, or of a kit cookie token when the host gives no IP. Never the IP itself. */
export async function visitorHash(ctx: Ctx, ip: string | null, token: string): Promise<string | null> {
	const secret = await salt(ctx);
	if (ip) return sha256(`${secret}|ip|${ip}`);
	const clean = token.replace(/[^a-zA-Z0-9]/g, "");
	if (clean.length < 32) return null;
	return sha256(`${secret}|cookie|${clean}`);
}

export function visitorWho(hash: string): string {
	return `v-${hash}`;
}
