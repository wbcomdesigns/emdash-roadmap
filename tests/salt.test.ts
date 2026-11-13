import { describe, expect, it } from "vitest";

import { budget } from "../src/core";
import { saveSalt, siteSalt } from "../src/visitor";

/** Settings and kv as plain maps, counting calls. */
function site(kv: Record<string, string> = {}, settings: Record<string, string> = {}) {
	let calls = 0;
	const ctx = {
		kv: { get: async (key: string) => (calls++, kv[key] ?? null) },
		settings: {
			compareAndSet: async (key: string, rev: null, value: string) => {
				calls++;
				if (rev !== null || key in settings) return { applied: false };
				settings[key] = value;
				return { applied: true };
			},
		},
	};
	return { ctx: ctx as never, settings, calls: () => calls };
}

describe("the guest salt survives every order install and the upgrade run in (EmDash 1.5)", () => {
	it("install on a 0.3.0 site keeps the old salt, so guests keep their votes", async () => {
		const s = site({ "visitor-salt": "old-salt" });
		expect(await saveSalt(s.ctx)).toBe("old-salt");
		expect(s.settings.visitor_salt).toBe("old-salt");
		expect(s.calls()).toBe(2);
	});

	it("running it again changes nothing", async () => {
		const s = site({ "visitor-salt": "old-salt" });
		await saveSalt(s.ctx);
		expect(await saveSalt(s.ctx)).toBeNull();
		expect(s.settings.visitor_salt).toBe("old-salt");
	});

	it("a new site gets a new salt", async () => {
		const s = site();
		expect(await saveSalt(s.ctx)).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("a registry update (no install) reads the 0.3.0 salt from kv for a guest, one call", async () => {
		const s = site({ "visitor-salt": "old-salt" });
		expect(await siteSalt(s.ctx, budget(0), { salt: "" })).toBe("old-salt");
		expect(s.calls()).toBe(1);
	});

	it("a site with no salt anywhere makes one for the first guest, two calls", async () => {
		const s = site();
		const salt = await siteSalt(s.ctx, budget(0), { salt: "" });
		expect(salt).toBe(s.settings.visitor_salt);
		expect(s.calls()).toBe(2);
	});
});
