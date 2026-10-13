import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { changelogCollection, roadmapCollection } from "../site-kit/seed/collection.mjs";
import { ana, openSite } from "./site";

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
	await dispose?.();
	dispose = undefined;
});

async function openRoadmap() {
	const site = await openSite();
	dispose = site.dispose;
	await site.rt.fixtures.collection(roadmapCollection as never);
	await site.rt.fixtures.collection(changelogCollection as never);
	return site;
}

async function addItem(
	rt: Awaited<ReturnType<typeof openSite>>["rt"],
	title: string,
	stage = "Under review",
) {
	return rt.fixtures.content("roadmap", {
		data: { title, description: `${title} description`, stage },
		slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		status: "published",
	} as never);
}

function admin(
	call: Awaited<ReturnType<typeof openSite>>["call"],
	input: Record<string, unknown>,
) {
	return call("admin", input) as Promise<{
		blocks: Array<Record<string, unknown> & { type: string }>;
		toast?: { type: string; message: string };
	}>;
}

function textOf(page: { blocks: unknown }): string {
	return JSON.stringify(page.blocks);
}

describe("health and collections", () => {
	it("reports missing collections on an empty site", async () => {
		const site = await openSite();
		dispose = site.dispose;
		expect(await site.call("health")).toMatchObject({
			ok: true,
			plugin: "roadmap",
			collection: false,
			changelog: false,
		});
	});

	it("reports both collections once they exist and shows them on Ideas", async () => {
		const site = await openRoadmap();
		expect(await site.call("health")).toMatchObject({
			ok: true,
			collection: true,
			changelog: true,
		});
		const page = await site.rt.admin.loadPage("/ideas");
		const text = textOf(page);
		expect(text).toContain("Roadmap collection");
		expect(text).toContain("Changelog collection");
		expect(text).toContain("Ready");
		expect(page.blocks.map((block) => block.type)).toContain("empty");
	});
});

describe("stages", () => {
	it("starts with the four default stages and keeps items when a stage is renamed", async () => {
		const site = await openRoadmap();
		await addItem(site.rt, "Dark board", "Planned");
		const before = await admin(site.call, { type: "page_load", page: "/settings" });
		expect(textOf(before)).toContain("Under review");
		expect(textOf(before)).toContain("Planned");
		expect(textOf(before)).toContain("1 item is in this stage.");

		const renamed = await admin(site.call, {
			type: "form_submit",
			action_id: "save_stage:planned",
			page: "/settings",
			values: { name: "Coming up", shown: true },
		});
		expect(renamed.toast?.type).toBe("success");
		expect(textOf(renamed)).toContain("Coming up");
		expect(textOf(renamed)).toContain("1 item is in this stage.");
		expect(textOf(renamed)).not.toContain('"initial_value":"Planned"');
	});

	it("adds a hidden stage, moves an item there, and refuses to remove a stage that still has items", async () => {
		const site = await openRoadmap();
		const item = await addItem(site.rt, "Skip this one", "Under review");

		const added = await admin(site.call, {
			type: "form_submit",
			action_id: "add_stage",
			page: "/settings",
			values: { name: "Declined", shown: false },
		});
		expect(added.toast?.type).toBe("success");
		expect(textOf(added)).toContain("Declined");
		expect(textOf(added)).toContain("Hidden from the board");

		const declined = added.blocks
			.filter((block) => block.type === "form" && String(block.block_id).startsWith("stage_"))
			.map((block) => String(block.block_id).slice("stage_".length))
			.find((id) => !["under-review", "planned", "in-progress", "done"].includes(id));
		expect(declined).toBeTruthy();

		const moved = await admin(site.call, {
			type: "form_submit",
			action_id: "move_item",
			page: "/settings",
			values: { item: item.id, stage: declined },
		});
		expect(moved.toast?.type).toBe("success");
		expect(textOf(moved)).toMatch(/1 item is in this stage/);

		const refused = await admin(site.call, {
			type: "block_action",
			action_id: `stage_remove:${declined}`,
			page: "/settings",
		});
		expect(refused.toast?.type).toBe("error");
		expect(refused.toast?.message).toMatch(/1 item/);
	});

	it("reorders stages and removes an empty one", async () => {
		const site = await openRoadmap();
		await admin(site.call, {
			type: "form_submit",
			action_id: "add_stage",
			page: "/settings",
			values: { name: "Later", shown: true },
		});
		const up = await admin(site.call, {
			type: "block_action",
			action_id: "stage_up:later",
			page: "/settings",
		});
		expect(up.toast?.type).toBe("success");
		const removed = await admin(site.call, {
			type: "block_action",
			action_id: "stage_remove:later",
			page: "/settings",
		});
		expect(removed.toast?.type).toBe("success");
		expect(textOf(removed)).not.toContain('"text":"Later"');
	});
});

describe("settings, dashboard card and hourly email", () => {
	it("saves who can take part and email settings, and they survive reload", async () => {
		const site = await openRoadmap();
		const saved = await admin(site.call, {
			type: "form_submit",
			action_id: "save_who",
			page: "/settings",
			values: { allow_ideas: false, who: "members" },
		});
		expect(saved.toast?.type).toBe("success");
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: false, notify_to: "owner@example.com" },
		});
		const again = textOf(await site.rt.admin.loadPage("/settings"));
		expect(again).toContain('"action_id":"allow_ideas"');
		expect(again).toContain('"initial_value":false');
		expect(again).toContain('"initial_value":"members"');
		expect(again).toContain('"initial_value":"owner@example.com"');
	});

	it("refuses a bad notify address and leaves the saved one in place", async () => {
		const site = await openRoadmap();
		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: true, notify_to: "owner@example.com" },
		});
		const refused = await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: true, notify_to: "not-an-email" },
		});
		expect(refused.toast?.type).toBe("error");
		expect(textOf(refused)).toContain("owner@example.com");
	});

	it("shows waiting ideas on the dashboard card", async () => {
		const site = await openRoadmap();
		await site.rt.fixtures.plugin.storage("ideas", "idea-1", {
			title: "A guest idea",
			status: "pending",
			member_id: "",
			name: "Sam",
			rev: "r1",
			createdAt: "2026-10-13T00:00:00.000Z",
		});
		const card = textOf(await admin(site.call, { type: "page_load", widget: "waiting" }));
		expect(card).toContain("Ideas waiting");
		expect(card).toContain('"value":1');
		expect(card).toContain("plugin-page");
	});

	it("sends one hourly email for many waiting ideas, and none when the switch is off", async () => {
		const site = await openRoadmap();
		const tick = () =>
			site.rt.transport.invokeHook("cron", { name: "notify", scheduledAt: new Date().toISOString() });
		for (let i = 0; i < 20; i += 1) {
			await site.rt.fixtures.plugin.storage("ideas", `idea-${i}`, {
				title: `Idea ${i}`,
				status: "pending",
				member_id: ana.id,
				rev: `r${i}`,
				createdAt: "2026-10-13T00:00:00.000Z",
			});
		}

		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: true, notify_to: "owner@example.com" },
		});
		await tick();
		await tick();
		const mail = await site.rt.inspect.email();
		expect(mail).toHaveLength(1);
		expect(mail[0].to).toBe("owner@example.com");
		expect(mail[0].text).not.toMatch(/Idea |Sam|http/i);

		await admin(site.call, {
			type: "form_submit",
			action_id: "save_email",
			page: "/settings",
			values: { notify: false, notify_to: "owner@example.com" },
		});
		await site.rt.fixtures.plugin.kv("notify:last", "0");
		await tick();
		expect(await site.rt.inspect.email()).toHaveLength(1);
	});
});
