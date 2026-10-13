const KEY = "roadmap-visitor";

/** Per-browser token used only when the host gives the plugin no visitor address. */
export function visitorToken(): string {
	if (typeof localStorage === "undefined") return "";
	let token = localStorage.getItem(KEY) || "";
	if (token.replace(/[^a-zA-Z0-9]/g, "").length < 32) {
		const bytes = new Uint8Array(24);
		crypto.getRandomValues(bytes);
		token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
		localStorage.setItem(KEY, token);
	}
	return token;
}

export function rememberVote(id: string, voted: boolean): void {
	if (typeof localStorage === "undefined" || !id) return;
	const ids = new Set(readVotes());
	if (voted) ids.add(id);
	else ids.delete(id);
	localStorage.setItem("roadmap-votes", JSON.stringify([...ids]));
}

export function readVotes(): string[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = JSON.parse(localStorage.getItem("roadmap-votes") || "[]");
		return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
	} catch {
		return [];
	}
}
