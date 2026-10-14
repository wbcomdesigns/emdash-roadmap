# Wording and look

**Included in Free.** Product Roadmap has no paid version.

![The board on a phone in dark mode, with stage tabs](../images/board-phone-dark.webp)

## Change the words visitors see

Every phrase a visitor reads lives in one file your developer copied: `src/lib/roadmap-strings.ts`. Change a phrase there and rebuild the site. For example:

```ts
boardTitle: "Roadmap",
vote: "Vote",
voted: "Voted",
```

This is also how you translate the board into another language. The file holds one language at a time.

| Area | Examples of what you can change |
| --- | --- |
| Board | `boardTitle`, `boardIntro`, `suggestLink`, `changelogLink`, `filterCategory`, `filterSort`, `sortVotes`, `sortNewest`, `allCategories`, `columnEmpty`, `loading`, `loadError`, `needsJs` |
| Voting | `vote`, `voted`, `voteCountOne`, `voteCountMany` (keep the `{n}` where the number goes), `signIn` |
| Item page | `backToBoard`, `itemMissingTitle`, `itemMissingHint`, `commentsClosed` |
| Suggest form | `suggestTitle`, `suggestIntro`, `suggestName`, `suggestNameHint`, `suggestTitleLabel`, `suggestBodyLabel`, `suggestSubmit`, `suggestThanks`, `suggestClosed`, `suggestBusy` |
| Changelog | `changelogTitle`, `changelogIntro`, `changelogEmpty`, `changelogEmptyHint`, `releaseMissingTitle`, `releaseMissingHint`, `backToChangelog` |
| Messages | The `errors` list, such as `RATE_LIMITED` and `MEMBERS_ONLY`. Leave the capital-letter names as they are and change only the text after them |

Not in the file:

- **Stage names** (the column headings) come from **Settings** in admin.
- **Item titles, descriptions and release notes** are your content.
- **Admin screens** are in English and cannot be translated.

## Match your theme

The board takes its colours from your site's theme when it can:

- Text, borders and card backgrounds follow your theme's own colour settings.
- The selected filter, the selected phone tab and the **Voted** button follow your theme's brand colour.
- Light and dark mode follow the visitor's system setting.

To change only the board's look, edit `src/styles/roadmap.css`. Its rules use the board's own class names, so they never change other parts of your site.

Where the board sits on the page comes from `src/layouts/RoadmapLayout.astro`, which hands each page to your site's own layout. Change its one import line if your layout has another name. The board is up to 72rem wide, centred, with padding on both sides.

## Several Wbcom plugins on one site

Product Roadmap works on its own and next to any other Wbcom plugin. They share two small files (`wbcom-kit.ts` and `wbcom-base.css`). Keep the copy with the higher number on its first line. Each plugin works with a newer copy.
