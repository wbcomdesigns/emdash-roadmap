import { afterEach, describe, expect, it, vi } from "vitest";

import { pluginFetch, registryPluginId } from "../site-kit/lib/wbcom-kit";

const SLUG = "roadmap";

const missing = () =>
	new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Plugin route not found" } }), {
		status: 404,
	});
const ok = () => new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 });

async function fresh() {
	vi.resetModules();
	vi.stubGlobal("window", {});
	return (await import("../site-kit/lib/wbcom-kit")).pluginFetch as typeof pluginFetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("kit finds Roadmap routes on any install", () => {
	it("computes the registry id EmDash assigns this plugin", async () => {
		expect(await registryPluginId(SLUG)).toBe("r_76xywti6l5cbxzos");
	});

	it("uses the registry id on a registry install and remembers it", async () => {
		const call = await fresh();
		const id = await registryPluginId(SLUG);
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), url.includes(id) ? ok() : missing()));
		expect((await call(SLUG, "health")).status).toBe(200);
		await call(SLUG, "health");
		expect(seen).toEqual([`/_emdash/api/plugins/${id}/health`, `/_emdash/api/plugins/${id}/health`]);
	});
});

describe("server-side calls", () => {
	it("pluginFetch refuses every server-side call, so no address is ever fetched from server code", async () => {
		vi.resetModules();
		const kit = await import("../site-kit/lib/wbcom-kit");
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), ok()));
		expect((await kit.pluginFetch(SLUG, "health")).status).toBe(503);
		expect(seen).toHaveLength(0);
	});

	it("callPluginRoute falls back from the registry id to the plugin name, and says when it is not installed", async () => {
		vi.resetModules();
		const kit = await import("../site-kit/lib/wbcom-kit");
		const id = await kit.registryPluginId(SLUG);
		const routed: string[] = [];
		const handler = (installed: string) => async (pluginId: string, _method: string, path: string) => (
			routed.push(`${pluginId}/${path}`),
			pluginId === installed
				? { success: true, data: { ok: true, allowIdeas: true } }
				: { success: false, error: { code: "NOT_FOUND", message: "Plugin route not found" } }
		);
		expect(
			await kit.callPluginRoute({ emdash: { handlePublicPluginApiRoute: handler(SLUG) } }, SLUG, "health"),
		).toMatchObject({ ok: true, allowIdeas: true });
		expect(routed).toEqual([`${id}/health`, `${SLUG}/health`]);
		expect(await kit.callPluginRoute({}, SLUG, "health")).toMatchObject({
			ok: false,
			error: { code: "UNAVAILABLE" },
		});
	});
});
