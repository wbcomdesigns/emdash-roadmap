import type { PluginContext } from "emdash/plugin";

import {
	FAILED,
	GUEST_UNAVAILABLE,
	IDEAS_CLOSED,
	INVALID,
	MEMBERS_ONLY,
	NAME_REQUIRED,
	RATE_LIMITED,
	SIGN_IN,
	SPAM,
	collectionName,
	rateLimited,
	roadmapReady,
	type Member,
} from "./core";
import { firstStage, loadSettings } from "./settings";
import { asRecord, asString, nowIso, plainText } from "./util";
import { noteGuestAddress, requestGuest, visitorHash } from "./visitor";

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

async function createIdea(ctx: PluginContext, title: string, description: string, author: IdeaAuthor) {
	if (!title) return INVALID;
	if (!ctx.content?.create || !(await roadmapReady(ctx))) return FAILED;
	const settings = await loadSettings(ctx);
	const stage = firstStage(settings.stages);
	const collection = await collectionName(ctx);
	const created = await ctx.content.create(collection, {
		title,
		description,
		stage: stage.name,
	});
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

export async function handleSuggest(routeCtx: Route, ctx: PluginContext) {
	const user = routeCtx.user;
	if (!user) return SIGN_IN;
	const settings = await loadSettings(ctx);
	if (!settings.allowIdeas) return IDEAS_CLOSED;
	if (await rateLimited(ctx, `suggest:${user.id}`)) return RATE_LIMITED;
	const idea = readIdea(routeCtx.input);
	return createIdea(ctx, idea.title, idea.description, {
		memberId: user.id,
		name: asString(user.name) || idea.name,
		visitor: "",
	});
}

export async function handleSuggestGuest(routeCtx: Route, ctx: PluginContext) {
	const idea = readIdea(routeCtx.input);
	if (idea.honeypot) return SPAM;
	const settings = await loadSettings(ctx);
	if (!settings.allowIdeas) return IDEAS_CLOSED;
	if (settings.who === "members") return MEMBERS_ONLY;
	const guest = requestGuest(routeCtx);
	await noteGuestAddress(ctx, guest !== null);
	if (!guest) return GUEST_UNAVAILABLE;
	if (!idea.name) return NAME_REQUIRED;
	const hash = await visitorHash(ctx, guest);
	if (await rateLimited(ctx, `suggest:v-${hash}`)) return RATE_LIMITED;
	return createIdea(ctx, idea.title, idea.description, {
		memberId: "",
		name: idea.name,
		visitor: hash,
	});
}
