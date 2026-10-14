import { describe, expect, it } from "vitest";
// @ts-ignore plain JS module without type declarations
import { seed } from "../scripts/make-seed.mjs";
import shipped from "../site-kit/seed/roadmap-seed.json";

describe("kit seed file", () => {
	it("matches site-kit/seed/collection.mjs (run node scripts/make-seed.mjs after changing it)", () => {
		expect(shipped).toEqual(JSON.parse(JSON.stringify(seed)));
		expect((shipped as Record<string, unknown>).menus).toBeUndefined();
	});
});
