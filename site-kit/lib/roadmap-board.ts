import { esc } from "./wbcom-kit";
import { phrase, strings } from "./roadmap-strings";
import { bindVoteButtons, fetchBoard, voteButtonHtml } from "./roadmap-vote";

type Card = { id: string; title: string; slug: string; votes: number };
type Details = Record<string, { summary?: string; category?: string; comments?: number }>;
type Column = { name: string; items: Card[]; empty: string | null };

export async function loadBoard(): Promise<void> {
	const root = document.getElementById("roadmap");
	const loading = document.getElementById("roadmap-loading");
	const board = document.getElementById("roadmap-board");
	const tabs = document.getElementById("roadmap-tabs");
	if (!root || !board) return;

	root.setAttribute("aria-busy", "true");
	const result = await fetchBoard(false);
	if (loading) loading.hidden = true;
	root.setAttribute("aria-busy", "false");
	if (!result.ok || !Array.isArray(result.columns)) {
		showError(result.error?.code);
		return;
	}

	const columns = result.columns as Column[];
	let details: Details = {};
	try {
		details = JSON.parse(root.dataset.details || "{}") as Details;
	} catch {
		details = {};
	}
	board.hidden = false;
	board.innerHTML = columns.map((column, index) => columnHtml(column, index === 0, details)).join("");
	if (tabs) {
		tabs.hidden = columns.length === 0;
		tabs.innerHTML = columns
			.map((column, index) => {
				const id = colId(column.name);
				return `<button type="button" class="wb-btn wb-btn--quiet" role="tab" id="roadmap-tab-${id}" data-tab="${esc(column.name)}" aria-controls="roadmap-panel-${id}" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}">${esc(column.name)}</button>`;
			})
			.join("");
	}
	bindVoteButtons();
	bindTabs();
}

function colId(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "col";
}

function cardHtml(item: Card, extra: Details[string] = {}): string {
	const summary = extra.summary ? `<p class="roadmap-card-summary">${esc(extra.summary)}</p>` : "";
	const category = extra.category ? `<span class="roadmap-card-tag">${esc(extra.category)}</span>` : "";
	const comments = extra.comments ? `<span class="roadmap-card-comments">${esc(strings.commentCount(extra.comments))}</span>` : "";
	return `<article class="wb-card roadmap-card"><h3><a href="/roadmap/${esc(item.slug || item.id)}/">${esc(item.title)}</a></h3>${summary}<div class="roadmap-card-meta">${voteButtonHtml(item.id, item.votes, item.title)}${category}${comments}</div></article>`;
}

function columnHtml(column: Column, active: boolean, details: Details = {}): string {
	const id = colId(column.name);
	const cards = column.items.map((item) => cardHtml(item, details[item.id])).join("");
	const empty = column.empty ? `<p class="wb-empty">${esc(strings.columnEmpty)}</p>` : "";
	return `<section class="roadmap-col${active ? " is-active" : ""}" id="roadmap-panel-${id}" role="tabpanel" aria-labelledby="roadmap-tab-${id}" data-col="${esc(column.name)}"><h2>${esc(column.name)} <span class="roadmap-col-count">${column.items.length}</span></h2>${cards}${empty}</section>`;
}

function bindTabs(): void {
	const tabs = document.getElementById("roadmap-tabs");
	if (!tabs || tabs.dataset.bound) return;
	tabs.dataset.bound = "1";
	tabs.addEventListener("click", (event) => {
		const tab = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
		if (!tab) return;
		selectTab(tabs, tab);
	});
	tabs.addEventListener("keydown", (event) => {
		const buttons = [...tabs.querySelectorAll<HTMLButtonElement>("[data-tab]")];
		if (!buttons.length) return;
		const current = buttons.findIndex((button) => button === document.activeElement);
		if (current < 0) return;
		let next = -1;
		if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % buttons.length;
		else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = buttons.length - 1;
		if (next < 0) return;
		event.preventDefault();
		buttons[next].focus();
		selectTab(tabs, buttons[next]);
	});
}

function selectTab(tabs: HTMLElement, tab: HTMLButtonElement): void {
	const name = tab.dataset.tab || "";
	for (const button of tabs.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
		const selected = button === tab;
		button.setAttribute("aria-selected", selected ? "true" : "false");
		button.tabIndex = selected ? 0 : -1;
	}
	for (const column of document.querySelectorAll<HTMLElement>("[data-col]")) {
		column.classList.toggle("is-active", column.dataset.col === name);
	}
}

function showError(code: string | undefined): void {
	const box = document.getElementById("roadmap-status");
	if (!box) return;
	box.hidden = false;
	box.dataset.tone = "error";
	box.textContent = code ? phrase(code) : strings.loadError;
}
