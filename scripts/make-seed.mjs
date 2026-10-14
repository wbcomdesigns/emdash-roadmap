// Writes site-kit/seed/roadmap-seed.json from site-kit/seed/collection.mjs, so a site owner can
// create the roadmap and changelog collections with one command:
// npx emdash seed <kit>/seed/roadmap-seed.json --no-content
// Menus are left out on purpose: a seed must never touch the site's own menu.
import { writeFileSync } from "node:fs";
import { changelogCollection, roadmapCollection, roadmapTaxonomies } from "../site-kit/seed/collection.mjs";

export const seed = {
	version: "1",
	meta: { name: "Product Roadmap", description: "The roadmap and changelog collections and roadmap categories." },
	collections: [roadmapCollection, changelogCollection],
	taxonomies: roadmapTaxonomies,
};

if (import.meta.url === `file://${process.argv[1]}`) {
	writeFileSync(new URL("../site-kit/seed/roadmap-seed.json", import.meta.url), `${JSON.stringify(seed, null, "\t")}\n`);
	console.log("Wrote site-kit/seed/roadmap-seed.json");
}
