1. Install Product Roadmap from the registry and confirm the permissions. Use the site kit from this release (0.1.1 or later). The 0.1.0 kit cannot reach a registry install.
2. Create a `roadmap` collection and a `changelog` collection. The kit ships the field list in `site-kit/seed/collection.mjs`. Turn comments on for roadmap items.
3. Copy the site kit into your site: `site-kit/lib`, `site-kit/styles`, `site-kit/components` and `site-kit/pages` into `src/`.
4. Point `layouts/RoadmapLayout.astro` at your site layout if it is not `Base.astro`.
5. Add menu links to `/roadmap/`, `/changelog/`, and `/account/roadmap-votes/` (My votes).
6. Open Admin, then Settings. Choose who can take part, and set the hourly email if the site has a mail provider.

Your site needs a sandbox runner in `astro.config.mjs`. Without one, EmDash skips sandboxed plugins at startup.

Full steps: https://github.com/wbcomdesigns/emdash-roadmap/blob/main/site-kit/README.md
