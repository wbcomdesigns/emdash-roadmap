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

/** Who the page load found: "member", "guest", or "" when the check could not answer. */
let visitor: "member" | "guest" | "" = "";

async function prepare(form: HTMLFormElement): Promise<void> {
	const [health, who] = await Promise.all([api("roadmap", "health"), whoIsHere()]);
	visitor = who;
	if (health.ok && health.allowIdeas === false) {
		show(form, { ok: false, error: { code: "IDEAS_CLOSED" } }, true);
		return;
	}
	// Guests can suggest only when the host gives the visitor's address (or the owner chose
	// members only). Then a guest gets the sign-in path instead of a form that cannot send.
	if (health.ok && health.guestWrites === false && who === "guest") {
		membersOnly(form);
		return;
	}
	// A member's account name is used: they are not asked for one (#81).
	if (who === "member") form.querySelector("input[name=name]")?.closest("label")?.remove();
}

/** The member list of votes answers a signed-in visitor and refuses a guest with a 401. */
async function whoIsHere(): Promise<"member" | "guest" | ""> {
	const mine = await api("roadmap", "votes");
	if (mine.ok) return "member";
	return mine.error?.code === "SIGN_IN_REQUIRED" ? "guest" : "";
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
		// Ignored by the 0.3.0 engine; the 0.2.1 engine keys a guest by it (see visitorToken).
		visitor: visitorToken(),
	};
	// A blank title, or a guest's blank name (spaces only), is named here before anything is sent (#81).
	const blank = !body.title.trim() ? "INVALID" : visitor === "guest" && !body.name.trim() ? "NAME_REQUIRED" : "";
	if (blank) {
		if (button) button.removeAttribute("aria-busy");
		show(form, { ok: false, error: { code: blank } }, false);
		return;
	}
	// A visitor the page load found signed out goes straight to the guest route (#70).
	const member = visitor === "guest" ? null : await api("roadmap", "suggest", body);
	const result =
		member && (member.ok || (member.error?.code && member.error.code !== "SIGN_IN_REQUIRED"))
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
		form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
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
	// The engine sends INVALID only for a missing title.
	box.textContent = code === "INVALID" ? strings.suggestTitleNeeded : phrase(code);
	// Point at the field that needs fixing: the title, or a guest's name.
	const wrong = code === "INVALID" ? "title" : code === "NAME_REQUIRED" ? "name" : "";
	for (const field of form.querySelectorAll<HTMLInputElement>("input[name=title], input[name=name]")) {
		if (field.name === wrong) {
			field.setAttribute("aria-invalid", "true");
			field.setAttribute("aria-describedby", "roadmap-status");
			field.focus();
		} else {
			field.removeAttribute("aria-invalid");
		}
	}
}
