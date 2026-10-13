import { readFileSync, writeFileSync } from "node:fs";

import { changelogEntries, roadmapItems } from "../site-kit/seed/content.mjs";
import {
	changelogCollection,
	roadmapCollection,
	roadmapMenuItems,
	roadmapTaxonomies,
} from "../site-kit/seed/collection.mjs";
import { labRoot, labSeedPath } from "./paths.mjs";

const lab = labRoot();
const seedPath = labSeedPath(lab);
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

seed.collections ||= [];
for (const next of [roadmapCollection, changelogCollection]) {
	if (!seed.collections.some((item) => item.slug === next.slug)) {
		seed.collections.push(structuredClone(next));
	}
}

seed.taxonomies ||= [];
for (const next of roadmapTaxonomies) {
	const tax = seed.taxonomies.find((item) => item.name === next.name);
	if (tax) {
		tax.terms = next.terms;
		tax.collections = Array.from(new Set([...(tax.collections || []), "roadmap"]));
	} else {
		seed.taxonomies.push(structuredClone(next));
	}
}

seed.content ||= {};
seed.content.roadmap = roadmapItems;
seed.content.changelog = changelogEntries;

const menu = seed.menus?.[0];
if (menu) {
	const urls = new Set(menu.items.map((item) => item.url));
	for (const item of roadmapMenuItems) {
		if (!urls.has(item.url)) menu.items.push(item);
	}
}

writeFileSync(seedPath, `${JSON.stringify(seed, null, "\t")}\n`);
console.log(`Seeded ${roadmapItems.length} roadmap items and ${changelogEntries.length} releases into ${seedPath}`);
