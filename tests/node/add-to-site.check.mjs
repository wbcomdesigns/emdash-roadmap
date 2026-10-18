import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const SCRIPT = new URL("../../scripts/add-to-site.sh", import.meta.url).pathname;
let site = "";
afterEach(() => site && rmSync(site, { recursive: true, force: true }));

function fakeSite() {
	site = mkdtempSync(join(tmpdir(), "roadmap-site-"));
	mkdirSync(join(site, "src/layouts"), { recursive: true });
	writeFileSync(join(site, "astro.config.mjs"), 'import emdash from "emdash/astro";\n');
	writeFileSync(join(site, "src/layouts/Base.astro"), "<slot />\n");
	return site;
}

const run = (dir) => execFileSync("bash", [SCRIPT, dir, "--no-seed"], { encoding: "utf8" });

describe("scripts/add-to-site.sh", () => {
	it("refuses a folder that is not an EmDash site", () => {
		site = mkdtempSync(join(tmpdir(), "not-a-site-"));
		const result = spawnSync("bash", [SCRIPT, site], { encoding: "utf8" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /is not an EmDash site/);
	});

	it("copies every page with its layout, the seed, and prints the next steps", () => {
		const out = run(fakeSite());
		for (const file of [
			"src/pages/roadmap/index.astro",
			"src/pages/roadmap/[slug].astro",
			"src/pages/roadmap/suggest.astro",
			"src/pages/changelog/index.astro",
			"src/pages/account/roadmap-votes.astro",
			"src/layouts/RoadmapLayout.astro",
			"src/lib/wbcom-kit.ts",
			"src/styles/wbcom-base.css",
			"src/components/RoadmapVotes.astro",
			".emdash/roadmap-seed.json",
		]) {
			assert.ok(existsSync(join(site, file)), file);
		}
		for (const text of [
			"npx emdash seed .emdash/roadmap-seed.json --no-content",
			"Node 22.16 or later",
			"open Menus",
			"/account/roadmap-votes/",
			"Restart the dev server",
		]) {
			assert.ok(out.includes(text), text);
		}
		assert.doesNotMatch(out, /\$K|path\/to\//);
	});

	it("never overwrites the site's layout or a newer shared file, and backs up changed wording", () => {
		run(fakeSite());
		writeFileSync(join(site, "src/layouts/RoadmapLayout.astro"), "MINE\n");
		writeFileSync(join(site, "src/styles/wbcom-base.css"), "/* wbcom-shared: 99 */\n");
		writeFileSync(join(site, "src/lib/roadmap-strings.ts"), "export const strings = { boardTitle: 'Ideas' };\n");
		const out = run(site);
		assert.equal(readFileSync(join(site, "src/layouts/RoadmapLayout.astro"), "utf8"), "MINE\n");
		assert.equal(readFileSync(join(site, "src/styles/wbcom-base.css"), "utf8"), "/* wbcom-shared: 99 */\n");
		const backups = readdirSync(join(site, "src/lib")).filter((name) => name.startsWith("roadmap-strings.ts.bak-"));
		assert.equal(backups.length, 1);
		assert.match(readFileSync(join(site, "src/lib", backups[0]), "utf8"), /Ideas/);
		assert.ok(out.includes("yours, left as it is"));
		assert.ok(out.includes(backups[0]));
	});
});
