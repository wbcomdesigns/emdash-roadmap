import { api, esc, pluginFetch, signInUrl, type ApiResult } from "./wbcom-kit";
import { phrase, strings, voteCountLabel } from "./roadmap-strings";
import { readVotes, rememberVote, visitorToken } from "./roadmap-visitor";

let bound = false;

export function voteAriaLabel(voted: boolean, title: string, votes: number): string {
	const action = voted ? strings.voted : strings.vote;
	const count = voteCountLabel(votes);
	return title ? `${action}: ${title}, ${count}` : `${action}, ${count}`;
}

export function voteButtonHtml(id: string, votes: number, title: string): string {
	return `<button type="button" class="wb-btn wb-btn--quiet wb-vote" data-vote="${esc(id)}" data-votes="${votes}" data-title="${esc(title)}" aria-pressed="false" aria-label="${esc(voteAriaLabel(false, title, votes))}"><span class="wb-vote__label">${esc(strings.vote)}</span><span class="wb-vote__count">${votes}</span></button>`;
}

export function bindVoteButtons(): void {
	if (bound || typeof document === "undefined") return;
	bound = true;
	void markMine();
	document.addEventListener("click", onClick);
}

async function markMine(): Promise<void> {
	const [mine, counts] = await Promise.all([loadMine(), loadCounts()]);
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-vote]")) {
		const id = button.dataset.vote || "";
		const voted = mine.has(id);
		const votes = counts.get(id) ?? Number(button.dataset.votes || 0);
		paint(button, voted, voted ? Math.max(votes, 1) : votes);
	}
}

async function loadMine(): Promise<Set<string>> {
	const result = await api("roadmap", "votes");
	if (result.ok) return new Set(((result.ids as string[]) || []).filter(Boolean));
	return new Set(readVotes());
}

async function loadCounts(): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	const result = await fetchBoard(true);
	if (!result.ok || !Array.isArray(result.columns)) return counts;
	for (const column of result.columns as Array<{ items?: Array<{ id?: string; votes?: number }> }>) {
		for (const item of column.items || []) {
			if (item.id) counts.set(item.id, Number(item.votes) || 0);
		}
	}
	return counts;
}

export async function fetchBoard(fresh: boolean): Promise<ApiResult> {
	const root = document.getElementById("roadmap");
	const query = new URLSearchParams();
	const category = root?.dataset.category || "";
	const sort = root?.dataset.sort || "votes";
	if (category) query.set("category", category);
	if (sort !== "votes") query.set("sort", sort);
	const path = `board${query.toString() ? `?${query}` : ""}`;
	try {
		const response = await pluginFetch("roadmap", path, {
			method: "GET",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			cache: fresh || readVotes().length ? "no-store" : "default",
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

async function onClick(event: Event): Promise<void> {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-vote]");
	if (!button || button.getAttribute("aria-busy") === "true") return;
	const id = button.dataset.vote || "";
	const voted = button.getAttribute("aria-pressed") === "true";
	button.setAttribute("aria-busy", "true");
	const result = await sendVote(id, voted);
	button.removeAttribute("aria-busy");
	if (!result.ok) {
		showStatus(result);
		return;
	}
	rememberVote(id, Boolean(result.voted));
	paint(button, Boolean(result.voted), Number(result.votes) || 0);
}

async function sendVote(id: string, voted: boolean): Promise<ApiResult> {
	const member = voted
		? await api("roadmap", `vote?id=${encodeURIComponent(id)}`, undefined, "DELETE")
		: await api("roadmap", "vote", { id });
	if (member.ok || (member.error?.code && member.error.code !== "SIGN_IN_REQUIRED")) return member;
	const visitor = visitorToken();
	return voted
		? api(
				"roadmap",
				`vote_guest?id=${encodeURIComponent(id)}&visitor=${encodeURIComponent(visitor)}`,
				undefined,
				"DELETE",
			)
		: api("roadmap", "vote_guest", { id, visitor });
}

function paint(button: HTMLButtonElement, voted: boolean, votes: number): void {
	button.dataset.votes = String(votes);
	button.setAttribute("aria-pressed", voted ? "true" : "false");
	const label = button.querySelector(".wb-vote__label");
	const count = button.querySelector(".wb-vote__count");
	if (label) label.textContent = voted ? strings.voted : strings.vote;
	button.setAttribute("aria-label", voteAriaLabel(voted, button.dataset.title || "", votes));
	if (count) count.textContent = String(votes);
}

function showStatus(result: ApiResult): void {
	const code = result.error?.code || "FAILED";
	const box = document.getElementById("roadmap-status");
	if (!box) return;
	box.hidden = false;
	box.dataset.tone = "error";
	if (code === "SIGN_IN_REQUIRED" || code === "MEMBERS_ONLY") {
		box.innerHTML = `${esc(phrase(code))} <a href="${esc(signInUrl())}">${esc(strings.signIn)}</a>`;
		return;
	}
	box.textContent = phrase(code);
}
