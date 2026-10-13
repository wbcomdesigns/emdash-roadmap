import { api, esc, signInUrl, type ApiResult } from "./wbcom-kit";
import { phrase, strings } from "./roadmap-strings";
import { readVotes, rememberVote, visitorToken } from "./roadmap-visitor";

let bound = false;

export function voteButtonHtml(id: string, votes: number, title: string): string {
	return `<button type="button" class="wb-btn wb-btn--quiet wb-vote" data-vote="${esc(id)}" data-votes="${votes}" aria-pressed="false" aria-label="${esc(strings.vote)}: ${esc(title)}"><span class="wb-vote__label">${esc(strings.vote)}</span><span class="wb-vote__count">${votes}</span></button>`;
}

export function bindVoteButtons(): void {
	if (bound || typeof document === "undefined") return;
	bound = true;
	void markMine();
	document.addEventListener("click", onClick);
}

async function markMine(): Promise<void> {
	const result = await api("roadmap", "votes");
	const ids = result.ok
		? new Set(((result.ids as string[]) || []).filter(Boolean))
		: new Set(readVotes());
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-vote]")) {
		paint(button, ids.has(button.dataset.vote || ""), Number(button.dataset.votes || 0));
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
	const title = (button.getAttribute("aria-label") || "").split(": ").slice(1).join(": ");
	button.setAttribute("aria-label", `${voted ? strings.voted : strings.vote}${title ? `: ${title}` : ""}`);
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
