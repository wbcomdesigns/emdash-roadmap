/* Browser helpers shared by every Wbcom EmDash plugin kit. Keep this file identical across plugins. */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape anything that came from the API before it goes into innerHTML. */
export function esc(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function signInUrl(): string {
	return `/_emdash/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}

export type ApiResult = { ok: boolean; error?: { code?: string; message?: string }; [key: string]: unknown };

/** Call a plugin route. Member routes answer SIGN_IN_REQUIRED for guests. */
export async function api(plugin: string, path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<ApiResult> {
	try {
		const response = await fetch(`/_emdash/api/plugins/${plugin}/${path}`, {
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
