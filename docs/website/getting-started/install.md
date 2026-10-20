# Install Product Roadmap

**Included in Free.** Product Roadmap has no paid version.

## Before you install

**1. Your site needs a sandbox runner.** Registry plugins run in a sandbox. Until the site has one, Admin, Plugins shows "No plugins configured" and there is no Registry in the menu.

- **Node:** in your site, run `npm install @emdash-cms/sandbox-workerd workerd`, then add `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",` inside `emdash({ ... })` in `astro.config.mjs`.
- **Cloudflare: not supported yet.** On Cloudflare Workers EmDash gives each plugin call 10 requests to the site, and several of this plugin's pages and actions need more, so they fail. A release that fits is in progress. Node sites are not affected.

Stop the dev server and start it again. **Registry** now shows in the admin menu.

**2. The plugin is the engine. Visitor pages come from its site kit.** A registry plugin cannot add pages to your site. Until you copy the kit, its addresses (for example `/roadmap/`) show your site's 404 page. That is expected. The kit copy below takes one command.

**3. You need Node 22.16 or later** for the `npx emdash seed` step.

Checked on EmDash 1.3.1 with the `blog` template on Node.

## Install

1. Admin, Registry, search **Product Roadmap**, Install, then accept the permissions.
2. From your site's root folder, get the kit for the version you just installed and copy it in:

   ```bash
   kit="$(mktemp -d)" &&
     git clone --depth 1 \
       --branch v0.4.0 \
       https://github.com/wbcomdesigns/emdash-roadmap \
       "$kit/emdash-roadmap" &&
     "$kit/emdash-roadmap/scripts/add-to-site.sh" .
   ```

   (`mktemp -d` makes a fresh folder only you can write to, and `&&` runs the script only when the clone worked. Never clone into a fixed `/tmp/<name>`: on a shared machine someone else can create it first.)

   The script copies the kit, never replaces a newer shared file another Wbcom plugin already copied, keeps a backup of any kit file you changed yourself (and lists it), creates the content types the plugin needs (if any), and prints the exact lines to paste into your templates, with the file names.
3. Paste the lines it printed. Restart the dev server.
4. Add the menu links it printed in Admin, Menus.
5. Open the plugin in the admin and follow its first screen.

After every plugin update, run step 2 again with the new tag.

## What the permissions are for

Product Roadmap asks to read, write and publish your content, read retained content revision history (shown in the admin as "Read retained content revision history", so the Stage panel can see and move an item while it has unpublished changes), read your content types and categories, create redirects, and send email. It needs them to list items, save suggested ideas as drafts, publish an idea you approve, redirect a merged item, and send the hourly notice.

After the install, a **Roadmap** group with **Ideas** and **Settings** appears in the admin menu.

## What the script does on your site

| Part | Where it goes |
| --- | --- |
| Pages | `src/pages/roadmap/` (board, one item, suggest an idea), `src/pages/changelog/`, `src/pages/account/roadmap-votes.astro` (Roadmap votes) |
| Kit files | `src/lib/`, `src/styles/`, `src/components/`, including the two shared Wbcom files. A newer shared copy from another Wbcom plugin is kept; an older one is upgraded, and the script says which |
| Your edits | Any kit file you edited yourself (wording in `src/lib/roadmap-strings.ts`, a page, a component, the styles) is kept as `<file>.bak-YYYYMMDD` before the new one replaces it, and the script lists the backups. An untouched file from any release is replaced without a word |
| Layout | `src/layouts/RoadmapLayout.astro`, copied only the first time. Later runs never overwrite it |
| Content types | `.emdash/roadmap-seed.json`, then `npx emdash seed .emdash/roadmap-seed.json --no-content` (Node 22.16 or later). It creates the **roadmap** and **changelog** content types and the **Roadmap categories** taxonomy, and leaves anything you already have alone. It never changes your menus |
| Optional block | `src/roadmap-block/`, unused until you add it to `astro.config.mjs` (see below) |

**Templates:** nothing to paste. The kit brings its own pages, so the script says so instead of printing lines.

**Menus:** in Admin, Menus, add `/roadmap/` (Roadmap), `/changelog/` (Changelog) and `/account/roadmap-votes/` (Roadmap votes). WB Polls has its own My votes at `/account/votes`; both pages work side by side, so give them different labels.

The script runs the seed only when `astro.config.mjs` uses `sqlite(` and its database file is there. If the seed step could not run on such a site (an older Node), run it yourself from the site root with Node 22.16 or later: `npx emdash seed .emdash/roadmap-seed.json --no-content -d ./data.db` (use your database file). On any other database, Cloudflare D1 included, the script prints "Seed not run: this site's database is not a local SQLite file." and you create the types in the admin: see [Content types](#content-types).

## Content types

On a site whose database is not a local SQLite file (Cloudflare D1, a hosted database), the seed cannot write to it, so create these in the admin once. The names and slugs must match: the plugin and the kit look for them.

**1. Roadmap.** Admin, **Content Types**, **New Content Type**:

| Box | Enter |
| --- | --- |
| Slug | `roadmap` |
| Label (Singular) | Roadmap item |
| Label (Plural) | Roadmap |
| URL Pattern | `/roadmap/{slug}` |

Turn on **Drafts**, **Revisions** and **Comments**, then **Create Content Type**. Then **Add Field** three times:

| Field Label | Slug | Type | Also |
| --- | --- | --- | --- |
| Title | `title` | Short Text | Required, Searchable |
| Description | `description` | Long Text | Searchable |
| Stage (set it in the Stage panel) | `stage` | Short Text | Indexed |

**2. Changelog.** **New Content Type** again: Slug `changelog`, Label (Singular) Release, Label (Plural) Changelog, URL Pattern `/changelog/{slug}`, **Drafts** and **Revisions** on. Fields:

| Field Label | Slug | Type | Also |
| --- | --- | --- | --- |
| Title | `title` | Short Text | Required, Searchable |
| Summary | `summary` | Long Text | Searchable |
| Released | `released` | Date & Time | |

**3. Roadmap categories.** Admin, **Taxonomies**, **New Taxonomy**: Label Roadmap categories, singular Roadmap category, name `roadmap_category`, used by **Roadmap**. Add the categories you want (for example Core, Mobile, Docs).

Open Ideas in the plugin's admin: the "Create the roadmap content type" notice is gone once the slug matches.

**Layout:** `src/layouts/RoadmapLayout.astro` hands every roadmap page to `src/layouts/Base.astro`, the blog template's layout. If your layout has another name or place, change the import on that one line.

## Check it worked

1. Open `/roadmap/`. You see the board with your stages as columns, lined up with your site's header.
2. Open Admin, Roadmap, **Ideas**. When both content types exist you see **Ideas waiting**, a count for each stage and **Votes this week**. Press **Visitor pages are set up** on the card at the top.
3. Open Admin, Roadmap, **Settings**: who can take part, stages, and the hourly email. See the [Settings reference](../settings/settings-reference.md).

**Expected in the browser console:** a guest on `/roadmap/`, an item page or `/account/roadmap-votes/` gets one `401` from the plugin's `votes` address. So does `/roadmap/suggest/` on a host that gives no visitor address, where guests must sign in to suggest. That is the check for a signed-in member; the page is fine. On a site where the plugin was installed from local files rather than the registry, you also see one `404` the first time a page asks the plugin anything (the kit tries the registry address first).

If a page is a 404 or the board says it could not load, see [Troubleshooting](../troubleshooting/troubleshooting.md).

## Guests and the visitor address

EmDash gives a plugin the visitor's address only on Cloudflare, or when the site sets `trustedProxyHeaders` inside `emdash({ ... })` in `astro.config.mjs` (for example `trustedProxyHeaders: ["x-real-ip"],`). Without an address, guests are asked to sign in before they can vote or post, so one person cannot vote many times.

Set `trustedProxyHeaders` only to a header that **your proxy writes itself and replaces** on every request. EmDash reads the first address in that header. Many proxies **add** to `X-Forwarded-For` instead of replacing it (nginx `$proxy_add_x_forwarded_for`, most load balancers), so the first address is whatever the visitor typed, and a guest could vote again and again. Behind nginx, set `proxy_set_header X-Real-IP $remote_addr;` and use `trustedProxyHeaders: ["x-real-ip"]`. Behind another proxy, use the header it overwrites with the connecting address. If you are not sure, leave it unset: members can still take part.

Without an address, guests see "Sign in to vote or suggest on this site." with a **Sign in** link instead of active vote buttons and the suggest form. Members take part as usual. Admin, Roadmap, Settings says so when no guest request in the last 24 hours came with an address.

## Move an item to another stage

Open the item in Admin, Content, Roadmap, and use the **Stage** panel on the right: one button per stage. The panel is the one place to set the stage. An editor page opened before a move cannot undo it; a different stage typed in the Stage box is kept, and retyping a stage the panel just replaced is refused with a message. Visitors see the move on the board within about two minutes (the board is cached briefly). If the item has unpublished changes, the move goes into those changes and shows on the board when you publish.

## The in-text block (optional)

The registry plugin works without it. It needs a trusted install of the block code, which the script already copied to `src/roadmap-block/`. In `astro.config.mjs`:

```js
import { roadmapBlock } from "./src/roadmap-block/descriptor.mjs";

emdash({
	plugins: [roadmapBlock()],
	// sandboxed: [roadmap] stays as it is
});
```

Restart the site. In a post or page, type `/roadmap` and choose **Roadmap**. The block shows the board, and visitors can vote from it.

## After you update the plugin

Run step 2 of Install again with the new version's tag. The kit and the plugin are released together, and an older kit may not reach a newer plugin. Your `RoadmapLayout.astro` is kept, and a changed wording file is backed up first.
