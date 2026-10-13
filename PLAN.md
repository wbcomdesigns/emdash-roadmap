# Plan: Roadmap and Feature Voting

**Status: LOCKED on 2026-10-13.** Scope and decisions were agreed with the owner. An agent does not add options or features. If a task cannot be done as written, stop, say why on its issue, and wait for the owner.

The plan for this plugin, kept in the repository so it travels with the code. `SCOPE.md` says what the plugin is. This file says in what order it gets built and what waits.

## Decisions made with the owner

| Question | Decision |
| --- | --- |
| Who can take part | The site owner chooses: signed-in members only, or anyone. Default is anyone. |
| Discussion on an idea | Yes, using EmDash's own comments on the idea page. The plugin builds no comment system. |
| Wording and language | One wording file per plugin kit. Every visitor-facing phrase lives there, so an owner can translate or reword the plugin by editing one file. |
| Who suggests ideas | Anyone, with a name, always with approval. A switch turns suggestions off. |
| Layout | Board with a column per stage. |
| Stages | The admin adds, removes, renames and reorders them, and can hide a stage from the board. Replaces "four fixed". |
| Emails | Only to the admin: one an hour when ideas are waiting. No emails to voters. |
| Duplicate ideas | Merge into an existing item. Votes move, one per person. |
| Changelog | List page plus a page per release. |
| Categories and sort | EmDash categories on roadmap items. Visitors filter by category and sort by Most votes or Newest. |
| Member pieces | My votes moves to 0.2.0. EmDash is not member-focused for now. |
| Setup and long lists | Developer guide plus one command. Next, Previous and find in admin. |

## 0.1.0: first release

Work the cards in this order. Each is a GitHub issue under milestone `0.1.0` with its build list, UX bar, function bar and QA cases. Later cards assume earlier ones.

1. **Schema, manifest and the collections**. Proven by: tests
2. **Board route**. Proven by: G-1, G-2
3. **Voting**. Proven by: M-1, M-2, M-3, M-4
4. **Suggest an idea**. Proven by: M-5, M-6, M-7
5. **Admin ideas queue**. Proven by: A-1, A-2, A-3, A-4
6. **Board page and vote button**. Proven by: G-3, M-8, P-1, P-2, P-3, P-4, P-5
7. **Item page, suggest page, changelog page**. Proven by: G-4, G-5, G-6
8. **My votes and erase**. Proven by: M-9, M-10
9. **Guest participation**. Proven by: G-9, G-10, G-11, A-7
10. **Rename the stages**. Proven by: A-8
11. **Comments on idea pages**. Proven by: G-12
12. **Wording file**. Proven by: G-94
13. **Lab, prove script, owner docs**. Proven by: tests
14. **Registry branding and release gate**. Proven by: the whole checklist

0.1.0 is done when every card is closed with a verification comment, `docs/qa/QA_CHECKLIST.md` has an honest last-walk line, and the gate in `CONTRIBUTING.md` passes. The owner publishes.

## 0.2.0: parked on purpose

Agreed as worth doing, not now. Do not start these during 0.1.0.

- Email the site admin when something is waiting for approval, on sites that have mail set up
- Telling voters when an idea changes stage
- Merging duplicate ideas
- Owner-defined stages

## Not planned

See "Out of scope" in `SCOPE.md`. If a card seems to need one of those, stop and ask the owner.

## Before it goes on a live site

- Prove the kit on a preview deploy of one existing site, never on production first
- Check the site's EmDash version, its content security policy, and its page cache against what the kit does
- Findings from the first plugin are in `wbcomdesigns/emdash-listora` issue #23

## Order after the owner review (2026-10-13)

#1 schema and collections, #15 stages, #16 settings page and admin email, #2 board route (categories, sort), #3 voting, #4 suggest, #11 guests, #5 ideas queue, #17 merge, #6 board page and vote button, #7 item, suggest and changelog pages, #13 comments, #18 in-text block (prove first), #14 wording file, #9 lab and docs, #10 branding and release gate. #8 (My votes) is 0.2.0.

One agent works this repo, in order, on a branch named `0.1.0`, opens a pull request into `main` and stops. It never merges, tags or publishes. Copy the proven patterns from `emdash-listora`, do not reinvent them.

## Before any task

Read `EMDASH-SUPPORT.md` in `~/code/emdash-plugin-starter` (`wbcomdesigns/emdash-plugin-starter`). If a task depends on a row marked "not proven", prove it on the lab first. If the proof fails, stop and tell the owner on the issue. Do not build around it.
