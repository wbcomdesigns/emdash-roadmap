# Site kit: Product Roadmap

The plugin is the engine. EmDash plugins cannot add pages, so copy this kit into the site once.

## After you install the plugin

1. Confirm the permissions the plugin asks for.
2. Create the `roadmap` and `changelog` collections from the site root: `npx emdash seed $K/seed/roadmap-seed.json --no-content` (comments on for `roadmap`; existing collections are left alone; menus are never changed). `scripts/make-seed.mjs` rebuilds the file from `seed/collection.mjs`.
3. Copy `lib/`, `styles/`, `components/` and `pages/` into your site's `src/`.
4. Point `layouts/RoadmapLayout.astro` at your site layout if it is not `Base.astro`. Updating the kit never overwrites that file.
5. Add menu links to `/roadmap/`, `/changelog/`, and `/account/roadmap-votes/` (My votes).
6. Open Settings in the plugin admin and check who can take part, stages, and the hourly email.

On a fresh lab: `./scripts/setup-lab.sh` then `./scripts/reset-lab.sh`.

Visitor-facing words live in `lib/roadmap-strings.ts`. Change that file to reword or translate the kit.
