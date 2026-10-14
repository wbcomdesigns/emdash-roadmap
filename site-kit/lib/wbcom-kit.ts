/* wbcom-shared: 5 */
/* Browser helpers shared by every Wbcom EmDash plugin kit. Keep this file identical across plugins.
   Same rules as styles/wbcom-base.css: only ever add, and raise the number on the first line. */

import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape anything that came from the API before it goes into innerHTML. */
export function esc(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function signInUrl(): string {
	return `/_emdash/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}

export type ApiResult = { ok: boolean; error?: { code?: string; message?: string }; [key: string]: unknown };

/*
 * Where a plugin's routes live. Installed from the EmDash registry, a plugin does not keep its
 * name in the address: EmDash gives it the id "r_" + the first 16 base32 characters of
 * SHA-256(publisher DID + "\n" + slug) (emdash/src/registry/plugin-id.ts). Installed from local
 * files (a lab, a trusted install), it keeps its name. The kit cannot know which, so it tries the
 * registry id, falls back to the name when EmDash says the route does not exist, and remembers
 * the answer for the visit.
 */
export const PUBLISHER_DID = "did:plc:2o6axbe264shvyedyhycyhya";
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** The id EmDash gives this plugin when it is installed from the registry. Same on every site. */
export async function registryPluginId(slug: string, did = PUBLISHER_DID): Promise<string> {
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${did}\n${slug}`)));
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of hash) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += BASE32[(value >>> bits) & 31];
		}
	}
	return `r_${out.slice(0, 16)}`;
}

const chosen = new Map<string, string>();

function remembered(plugin: string): string | null {
	try {
		return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(`wb-plugin-id:${plugin}`);
	} catch {
		return null;
	}
}

/** EmDash's own answer for an address with no plugin behind it (not a plugin's answer). */
async function routeMissing(response: Response): Promise<boolean> {
	if (response.status !== 404) return false;
	const body = await response.clone().json().catch(() => null);
	return /route not found/i.test(String(body?.error?.message ?? ""));
}

function remember(plugin: string, id: string | null): void {
	if (id) chosen.set(plugin, id);
	else chosen.delete(plugin);
	try {
		if (typeof sessionStorage === "undefined") return;
		if (id) sessionStorage.setItem(`wb-plugin-id:${plugin}`, id);
		else sessionStorage.removeItem(`wb-plugin-id:${plugin}`);
	} catch {
		// Storage can be blocked. Nothing is lost but one extra request.
	}
}

/**
 * fetch() for a plugin route from the browser, at whichever address this site installed the
 * plugin under. Browser only (version 5): an Astro page's server code uses callPluginRoute, which
 * runs the route inside the server, so no address a visitor could influence is ever called.
 *
 * Only an address the plugin itself answered on is remembered. On the server this memory is
 * shared by every visitor, so a failure (the plugin switched off, a deploy in progress) must
 * never be remembered, and a remembered address that stops answering is forgotten.
 */
export async function pluginFetch(plugin: string, path: string, init: RequestInit = {}): Promise<Response> {
	if (typeof window === "undefined") {
		return new Response(null, { status: 503, statusText: "Server code calls plugin routes with callPluginRoute" });
	}
	const known = chosen.get(plugin) ?? remembered(plugin);
	if (known) {
		const response = await fetch(`/_emdash/api/plugins/${known}/${path}`, init);
		if (!(await routeMissing(response))) return response;
		remember(plugin, null);
	}
	let response: Response | null = null;
	for (const id of [await registryPluginId(plugin), plugin]) {
		response = await fetch(`/_emdash/api/plugins/${id}/${path}`, init);
		if (await routeMissing(response)) continue;
		remember(plugin, id);
		return response;
	}
	return response as Response;
}

/**
 * Call a plugin's public route from an Astro page's server code (pass Astro.locals). EmDash runs
 * the route inside the server: there is no HTTP request, so a visitor's Host header or any other
 * address can never be called (version 5). Tries the registry id, then the plugin's name.
 */
export async function callPluginRoute(
	locals: unknown,
	plugin: string,
	path: string,
	body?: unknown,
): Promise<ApiResult> {
	const handler = getPublicPluginApiRouteHandler(locals as Parameters<typeof getPublicPluginApiRouteHandler>[0]);
	if (!handler) return { ok: false, error: { code: "UNAVAILABLE", message: "Plugin routes are not available here." } };
	const method = body === undefined ? "GET" : "POST";
	const [route, query] = path.split("?");
	for (const id of [await registryPluginId(plugin), plugin]) {
		const request = new Request(`http://localhost/_emdash/api/plugins/${id}/${route}${query ? `?${query}` : ""}`, {
			method,
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const result = await handler(id, method, route, request).catch(() => null);
		if (!result || (!result.success && result.error?.code === "NOT_FOUND" && /plugin|route/i.test(result.error.message))) continue;
		if (!result.success) return { ok: false, error: result.error };
		const data = result.data;
		return data && typeof data === "object" ? (data as ApiResult) : { ok: true, value: data };
	}
	return { ok: false, error: { code: "NOT_FOUND", message: "That plugin is not installed." } };
}

/** Call a plugin route. Member routes answer SIGN_IN_REQUIRED for guests. */
export async function api(plugin: string, path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<ApiResult> {
	try {
		const response = await pluginFetch(plugin, path, {
			method,
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (response.status === 401) {
			return { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
		}
		const json = await response.json().catch(() => null);
		if (!response.ok || !json) {
			return { ok: false, error: { code: "FAILED", message: json?.error?.message || "Something went wrong. Try again." } };
		}
		return json.data ?? { ok: false };
	} catch {
		return { ok: false, error: { code: "OFFLINE", message: "Could not reach the site. Check your connection." } };
	}
}

/** Show a result in a status element: success text, the API's error, or a sign-in link for guests. */
export function notify(box: HTMLElement, result: ApiResult, success: string): void {
	box.hidden = false;
	box.dataset.tone = result.ok ? "success" : "error";
	if (result.ok) box.textContent = success;
	else if (result.error?.code === "SIGN_IN_REQUIRED") {
		box.innerHTML = `Sign in to continue. <a href="${esc(signInUrl())}">Sign in</a>`;
	} else box.textContent = result.error?.message || "Something went wrong. Try again.";
}

export function starText(stars: unknown): string {
	const n = Math.max(0, Math.min(5, Math.round(Number(stars) || 0)));
	return "★".repeat(n) + "☆".repeat(5 - n);
}
