import { createPluginRuntimeTestHost } from "@emdash-cms/plugin-test";

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
	const call = rt.transport.invokeRoute.bind(rt.transport);
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
