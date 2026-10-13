import { api, esc } from "./wbcom-kit";
import { phrase, strings } from "./roadmap-strings";
import { bindVoteButtons, voteButtonHtml } from "./roadmap-vote";

type Card = { id: string; title: string; slug: string; votes: number };
type Column = { name: string; items: Card[]; empty: string | null };

export async function loadBoard(): Promise<void> {
	const root = document.getElementById("roadmap");
	const loading = document.getElementById("roadmap-loading");
	const board = document.getElementById("roadmap-board");
	const tabs = document.getElementById("roadmap-tabs");
	if (!root || !board) return;

	const query = new URLSearchParams();
	const category = root.dataset.category || "";
	const sort = root.dataset.sort || "votes";
	if (category) query.set("category", category);
	if (sort !== "votes") query.set("sort", sort);
	const result = await api("roadmap", `board${query.toString() ? `?${query}` : ""}`);
	if (loading) loading.hidden = true;
	if (!result.ok || !Array.isArray(result.columns)) {
		showError(result.error?.code);
		return;
	}

	const columns = result.columns as Column[];
	board.hidden = false;
	board.innerHTML = columns.map((column, index) => columnHtml(column, index === 0)).join("");
	if (tabs) {
		tabs.hidden = columns.length === 0;
		tabs.innerHTML = columns
			.map(
				(column, index) =>
					`<button type="button" class="wb-btn wb-btn--quiet" role="tab" data-tab="${esc(column.name)}" aria-selected="${index === 0 ? "true" : "false"}">${esc(column.name)}</button>`,
			)
			.join("");
	}
	bindVoteButtons();
	bindTabs();
}

function columnHtml(column: Column, active: boolean): string {
	const cards = column.items
		.map(
			(item) =>
				`<article class="wb-card roadmap-card"><h3><a href="/roadmap/${esc(item.slug || item.id)}/">${esc(item.title)}</a></h3>${voteButtonHtml(item.id, item.votes, item.title)}</article>`,
		)
		.join("");
	const empty = column.empty ? `<p class="wb-empty">${esc(strings.columnEmpty)}</p>` : "";
	return `<section class="roadmap-col${active ? " is-active" : ""}" data-col="${esc(column.name)}"><h2>${esc(column.name)}</h2>${cards}${empty}</section>`;
}

function bindTabs(): void {
	const tabs = document.getElementById("roadmap-tabs");
	if (!tabs || tabs.dataset.bound) return;
	tabs.dataset.bound = "1";
	tabs.addEventListener("click", (event) => {
		const tab = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
		if (!tab) return;
		const name = tab.dataset.tab || "";
		for (const button of tabs.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
			button.setAttribute("aria-selected", button === tab ? "true" : "false");
		}
		for (const column of document.querySelectorAll<HTMLElement>("[data-col]")) {
			column.classList.toggle("is-active", column.dataset.col === name);
		}
	});
}

function showError(code: string | undefined): void {
	const box = document.getElementById("roadmap-status");
	if (!box) return;
	box.hidden = false;
	box.dataset.tone = "error";
	box.textContent = code ? phrase(code) : strings.loadError;
}
