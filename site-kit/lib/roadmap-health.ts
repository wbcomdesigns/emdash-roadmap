import { callPluginRoute } from "./wbcom-kit";

/**
 * Whether the owner is accepting suggestions, read inside the server from an Astro page
 * (pass Astro.locals). Fail open if health cannot be read.
 */
export async function ideasOpen(locals: unknown): Promise<boolean> {
	const data = await callPluginRoute(locals, "roadmap", "health");
	return data.allowIdeas !== false;
}
