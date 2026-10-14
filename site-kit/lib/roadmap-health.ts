import { pluginFetch } from "./wbcom-kit";

/** Whether the owner is accepting suggestions. Fail open if health cannot be read. */
export async function ideasOpen(origin = ""): Promise<boolean> {
	try {
		const response = await pluginFetch("roadmap", "health", {}, origin);
		const json = await response.json().catch(() => null);
		const data = (json?.data ?? json) as { allowIdeas?: boolean } | null;
		return data?.allowIdeas !== false;
	} catch {
		return true;
	}
}
