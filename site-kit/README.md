# Site kit: Product Roadmap

The plugin is the engine. A registry plugin cannot add pages to a site, so the visitor pages live in this kit and are copied into the site with one script.

## Add it to your site

Checked on EmDash 1.3.1 with the `blog` template on Node. The site needs a sandbox runner first (see the install guide's "Before you install").

1. Admin, Registry, search **Product Roadmap**, Install, then accept the permissions.
2. From your site's root folder, get the kit for the version you installed and copy it in:

   ```bash
   kit="$(mktemp -d)" &&
     git clone --depth 1 \
       --branch v0.4.0 \
       https://github.com/wbcomdesigns/emdash-roadmap \
       "$kit/emdash-roadmap" &&
     "$kit/emdash-roadmap/scripts/add-to-site.sh" .
   ```

   It copies `lib/`, `styles/`, `components/`, `pages/` and `layouts/RoadmapLayout.astro` into `src/`, never replaces a newer shared Wbcom file, never overwrites your `RoadmapLayout.astro` once it exists, backs up any kit file you edited yourself to `<file>.bak-YYYYMMDD` before replacing it (its hash is not one a release shipped, listed in `kit.sums`) and lists the backups, and creates the `roadmap` and `changelog` content types with `npx emdash seed .emdash/roadmap-seed.json --no-content` (Node 22.16 or later). It prints what is left.
3. Nothing to paste into templates. Restart the dev server.
4. In Admin, Menus, add `/roadmap/`, `/changelog/` and `/account/roadmap-votes/` (Roadmap votes).
5. Open Admin, Roadmap, Settings: who can take part, stages, and the hourly email.

A guest's browser console shows one `401` from the plugin's `votes` address on the board, item and Roadmap votes pages: the page checks for a signed-in member first. That is expected.

Visitor-facing words live in `lib/roadmap-strings.ts`. Change that file to reword or translate the kit; the script backs it up before an update replaces it. Run `node scripts/make-kit-sums.mjs` after changing any kit file in this repo.

Full guide: [docs/website/getting-started/install.md](../docs/website/getting-started/install.md).

## The in-text block (optional)

The script also copies `blocks/` to `src/roadmap-block/`. Add `roadmapBlock()` under `plugins` in `astro.config.mjs` to insert the board inside a post. The install guide has the lines. The registry plugin does not need this.

## Working on this plugin

For the plugin's own lab only, not for a site: `./scripts/setup-lab.sh`, then `./scripts/reset-lab.sh` (port in `package.json`). `scripts/make-seed.mjs` rebuilds `seed/roadmap-seed.json` from `seed/collection.mjs`.
