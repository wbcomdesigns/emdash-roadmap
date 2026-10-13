import { api, esc, signInUrl, type ApiResult } from "./wbcom-kit";
import { phrase, strings } from "./roadmap-strings";
import { visitorToken } from "./roadmap-visitor";

export function bindSuggestForm(): void {
	const form = document.getElementById("roadmap-suggest") as HTMLFormElement | null;
	if (!form || form.dataset.bound) return;
	form.dataset.bound = "1";
	void prepare(form);
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		void send(form);
	});
}

async function prepare(form: HTMLFormElement): Promise<void> {
	const health = await api("roadmap", "health");
	if (health.ok && health.allowIdeas === false) {
		show(form, { ok: false, error: { code: "IDEAS_CLOSED" } }, true);
	}
}

async function send(form: HTMLFormElement): Promise<void> {
	const status = form.querySelector<HTMLElement>("#roadmap-status");
	const button = form.querySelector<HTMLButtonElement>("[type=submit]");
	if (button) button.setAttribute("aria-busy", "true");
	const data = new FormData(form);
	const body = {
		title: String(data.get("title") || ""),
		description: String(data.get("description") || ""),
		name: String(data.get("name") || ""),
		website: String(data.get("website") || ""),
		visitor: visitorToken(),
	};
	const member = await api("roadmap", "suggest", body);
	const result =
		member.ok || (member.error?.code && member.error.code !== "SIGN_IN_REQUIRED")
			? member
			: await api("roadmap", "suggest_guest", body);
	if (button) button.removeAttribute("aria-busy");
	show(form, result, false);
	if (status && result.ok) form.reset();
}

function show(form: HTMLFormElement, result: ApiResult, closed: boolean): void {
	const box = form.querySelector<HTMLElement>("#roadmap-status");
	if (!box) return;
	box.hidden = false;
	if (result.ok) {
		box.dataset.tone = "ok";
		box.textContent = strings.suggestThanks;
		return;
	}
	box.dataset.tone = "error";
	const code = result.error?.code || "FAILED";
	if (code === "IDEAS_CLOSED") {
		box.textContent = strings.suggestClosed;
		form.querySelectorAll("input, textarea, button").forEach((el) => {
			if (el instanceof HTMLElement) el.setAttribute("disabled", "true");
		});
		return;
	}
	if (code === "SIGN_IN_REQUIRED" || code === "MEMBERS_ONLY") {
		box.innerHTML = `${esc(phrase(code))} <a href="${esc(signInUrl())}">${esc(strings.signIn)}</a>`;
		return;
	}
	if (closed) return;
	box.textContent = phrase(code);
}
