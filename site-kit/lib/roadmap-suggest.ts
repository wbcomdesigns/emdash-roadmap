import { api, esc, signInUrl, type ApiResult } from "./wbcom-kit";
import { phrase, strings } from "./roadmap-strings";
import { SIGN_IN_CODES, refusalCode } from "./roadmap-vote";
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
		return;
	}
	// Guests can suggest only when the host gives the visitor's address (or the owner chose
	// members only). Then a guest gets the sign-in path instead of a form that cannot send.
	if (health.ok && health.guestWrites === false && !(await signedIn())) membersOnly(form);
}

/** The member list of votes answers a signed-in visitor and refuses a guest with a 401. */
async function signedIn(): Promise<boolean> {
	const mine = await api("roadmap", "votes");
	return mine.ok || mine.error?.code !== "SIGN_IN_REQUIRED";
}

function membersOnly(form: HTMLFormElement): void {
	const box = document.createElement("div");
	box.className = "wb-empty";
	box.innerHTML = `<p>${esc(strings.suggestSignInNeeded)}</p><p><a class="wb-btn" href="${esc(signInUrl())}">${esc(strings.signIn)}</a></p>`;
	form.replaceWith(box);
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
		// Ignored by the 0.2.2 engine; the 0.2.1 engine keys a guest by it (see visitorToken).
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
		form.querySelector("input[name=name]")?.removeAttribute("aria-invalid");
		box.dataset.tone = "ok";
		box.textContent = strings.suggestThanks;
		return;
	}
	box.dataset.tone = "error";
	const code = refusalCode(result);
	if (code === "IDEAS_CLOSED") {
		box.textContent = strings.suggestClosed;
		form.querySelectorAll("input, textarea, button").forEach((el) => {
			if (el instanceof HTMLElement) el.setAttribute("disabled", "true");
		});
		return;
	}
	if (SIGN_IN_CODES.has(code)) {
		box.innerHTML = `${esc(phrase(code))} <a href="${esc(signInUrl())}">${esc(strings.signIn)}</a>`;
		return;
	}
	if (closed) return;
	box.textContent = phrase(code);
	// A guest without a name: point at the field that needs it.
	const name = form.querySelector<HTMLInputElement>("input[name=name]");
	if (name) {
		if (code === "NAME_REQUIRED") {
			name.setAttribute("aria-invalid", "true");
			name.setAttribute("aria-describedby", "roadmap-status");
			name.focus();
		} else {
			name.removeAttribute("aria-invalid");
		}
	}
}
