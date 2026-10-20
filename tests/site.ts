import { validateBlockResponse } from "@emdash-cms/blocks/server";
import { createPluginRuntimeTestHost } from "@emdash-cms/plugin-test";

/**
 * Every admin page and editor panel answer in every test goes through EmDash's own Block Kit check,
 * the one the host runs before showing it. An invalid block passes the plugin's own tests but
 * breaks the screen on a real site (502 INVALID_BLOCK_RESPONSE; WB Reviews walk, 2026-10-20).
 */
const BLOCK_ROUTES = new Set(["admin", "editor_stage"]);
const POLICY = { pluginPagePaths: ["/ideas", "/settings"] };

export function assertValidBlocks(route: string, result: unknown): void {
	const check = validateBlockResponse(result, POLICY);
	if (!check.valid) throw new Error(`${route} returned invalid Block Kit: ${JSON.stringify(check.errors)}`);
}

export const member = (id: string, role = 10) => ({
	id,
	email: `${id}@example.com`,
	name: id,
	role,
	createdAt: "2026-01-01T00:00:00.000Z",
});
export const ana = member("ana");
export const ben = member("ben");
export const admin = member("root", 50);

/**
 * A real test site. The plain test host cannot publish content, so tests that need a
 * published entry use this. Call dispose() in afterEach.
 */
export async function openSite() {
	const rt = await createPluginRuntimeTestHost();
	const invoke = rt.transport.invokeRoute.bind(rt.transport);
	const call = (async (name: string, ...rest: unknown[]) => {
		const result = await (invoke as (...args: unknown[]) => Promise<unknown>)(name, ...rest);
		if (BLOCK_ROUTES.has(name)) assertValidBlocks(name, result);
		return result;
	}) as typeof invoke;
	const asGuest = { method: "POST" };
	const as = (user: ReturnType<typeof member>, method = "POST") => ({ method, user });
	return { rt, call, as, asGuest, dispose: () => rt.dispose() };
}

/** Add a posts collection with one public post and one draft. */
export async function withPosts(rt: Awaited<ReturnType<typeof openSite>>["rt"]) {
	await rt.fixtures.collection({
		slug: "posts",
		label: "Posts",
		labelSingular: "Post",
		urlPattern: "/posts/{slug}",
		supports: ["drafts", "revisions"],
		fields: [{ slug: "title", label: "Title", type: "string", required: true }],
	} as never);
	const live = await rt.fixtures.content("posts", { data: { title: "Good Soup" }, slug: "good-soup", status: "published" } as never);
	const draft = await rt.fixtures.content("posts", { data: { title: "Secret Draft" }, slug: "secret-draft" } as never);
	return { live: live.id, draft: draft.id };
}
