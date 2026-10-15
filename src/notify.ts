import type { PluginContext } from "emdash/plugin";

import { EMAIL_RE } from "./core";
import { loadSettings } from "./settings";
import { asNumber, asString } from "./util";

/** The owner-notice task runs once an hour. */
export const NOTIFY_CRON = "7 * * * *";

const LAST_KEY = "notify:last";
const MIN_GAP_MS = 50 * 60 * 1000;

/** One notice for the owner. No idea text and no link. */
export function waitingNotice(siteName: string): { subject: string; text: string } {
	const site = siteName.replace(/\s+/g, " ").trim().slice(0, 80);
	return {
		subject: "Ideas are waiting for review",
		text: `Ideas are waiting for review${site ? ` on ${site}` : ""}. Sign in and open Ideas to decide what happens next.`,
	};
}

export async function ensureNotifyTask(ctx: PluginContext): Promise<void> {
	if (!ctx.cron) return;
	if ((await ctx.cron.list()).some((task) => task.name === "notify")) return;
	await ctx.cron.schedule("notify", { schedule: NOTIFY_CRON });
}

/**
 * Hourly task: tell the site admin that ideas are waiting. One notice per run,
 * nothing a visitor wrote, and no link. Silent when mail is off or missing.
 */
export async function notifyOwners(ctx: PluginContext): Promise<void> {
	const settings = await loadSettings(ctx);
	if (!settings.notify) return;
	const waiting = await ctx.storage.ideas.count({ status: "pending" });
	if (!waiting) return;
	if (!ctx.email) return;
	const to = settings.notifyTo;
	if (!EMAIL_RE.test(to)) return;

	const seen = await ctx.kv.getVersioned<string>(LAST_KEY);
	const last = asNumber(seen?.value) ?? 0;
	const now = Date.now();
	if (now - last < MIN_GAP_MS) return;
	if (!(await ctx.kv.compareAndSet(LAST_KEY, seen?.revision ?? null, String(now))).applied) return;

	const site = asString(ctx.site?.name);
	try {
		await ctx.email.send({ to, ...waitingNotice(site) });
	} catch {
		await ctx.kv.delete(LAST_KEY).catch(() => undefined);
	}
}
