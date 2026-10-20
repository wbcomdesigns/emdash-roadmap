import type { PluginContext } from "emdash/plugin";

import {
	BUSY,
	FAILED,
	GUEST_UNAVAILABLE,
	IDEAS_CLOSED,
	INVALID,
	MEMBERS_ONLY,
	NAME_REQUIRED,
	SIGN_IN,
	SPAM,
	budget,
	rateLimit,
	rateRefusal,
	roadmapReady,
	spend,
	type Budget,
	type Member,
} from "./core";
import { firstStage, loadSettings, type Settings } from "./settings";
import { asRecord, asString, nowIso, plainText } from "./util";
import { noteGuestAddress, requestGuest, siteSalt, visitorHash } from "./visitor";

export const TITLE_MAX = 120;
export const DESC_MAX = 4000;
export const NAME_MAX = 60;

type Route = {
	input: unknown;
	request: { method: string };
	user?: Member;
	requestMeta?: unknown;
};

type IdeaAuthor = {
	memberId: string;
	name: string;
	visitor: string;
};

/**
 * The draft item, then the waiting idea that names it: three calls (type check, create, idea).
 * The content create runs the plugin's own content:beforeSave hook, which returns at once for a
 * new entry. ponytail: if the idea write fails after the draft is made, the draft stays in Roadmap
 * content with no row in Ideas; the visitor is told it failed and can send it again.
 */
async function createIdea(ctx: PluginContext, b: Budget, settings: Settings, title: string, description: string, author: IdeaAuthor) {
	if (!title) return INVALID;
	if (!ctx.content?.create) return FAILED;
	spend(b);
	if ((await roadmapReady(ctx, settings.collection)) !== true) return FAILED;
	try {
		spend(b);
		const created = await ctx.content.create(settings.collection, {
			title,
			description,
			stage: firstStage(settings.stages).name,
		});
		spend(b);
		await ctx.storage.ideas.put(created.id, {
			member_id: author.memberId,
			title,
			description,
			status: "pending",
			rev: crypto.randomUUID(),
			createdAt: nowIso(),
			visitor: author.visitor,
			guest: Boolean(author.visitor),
			name: author.name,
		});
		return { ok: true, id: created.id, code: "THANKS" as const };
	} catch {
		return FAILED;
	}
}

function readIdea(input: unknown) {
	const raw = asRecord(input);
	return {
		title: plainText(raw.title, TITLE_MAX),
		description: plainText(raw.description, DESC_MAX),
		name: plainText(raw.name, NAME_MAX),
		honeypot: asString(raw.website) || asString(raw.honeypot),
	};
}

/** Six calls: settings, the hourly limit (two), then createIdea. */
export async function handleSuggest(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (!settings.allowIdeas) return IDEAS_CLOSED;
	const idea = readIdea(routeCtx.input);
	if (!idea.title) return INVALID;
	spend(b, 2);
	const limit = rateRefusal(await rateLimit(ctx, `suggest:${user.id}`));
	if (limit) return limit;
	return createIdea(ctx, b, settings, idea.title, idea.description, {
		memberId: user.id,
		name: asString(user.name) || idea.name,
		visitor: "",
	});
}

/** Eight calls at most: settings, the salt on a site's first guest (two), the hourly limit (two), createIdea. The address note only with a call to spare. */
export async function handleSuggestGuest(routeCtx: Route, ctx: PluginContext) {
	const idea = readIdea(routeCtx.input);
	if (idea.honeypot) return SPAM;
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (!settings.allowIdeas) return IDEAS_CLOSED;
	if (settings.who === "members") return MEMBERS_ONLY;
	const guest = requestGuest(routeCtx);
	if (!guest) {
		await noteGuestAddress(ctx, b, settings, false);
		return GUEST_UNAVAILABLE;
	}
	if (!idea.name) return NAME_REQUIRED;
	if (!idea.title) return INVALID;
	const salt = await siteSalt(ctx, b, settings);
	if (!salt) return BUSY;
	const hash = await visitorHash(salt, guest);
	spend(b, 2);
	const limit = rateRefusal(await rateLimit(ctx, `suggest:v-${hash}`));
	const answer = limit ?? (await createIdea(ctx, b, settings, idea.title, idea.description, { memberId: "", name: idea.name, visitor: hash }));
	await noteGuestAddress(ctx, b, settings, true);
	return answer;
}
