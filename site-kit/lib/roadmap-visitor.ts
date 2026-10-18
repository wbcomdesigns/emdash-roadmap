/** Items this browser voted for as a guest, so the board can mark them after a cached page loads. */
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
