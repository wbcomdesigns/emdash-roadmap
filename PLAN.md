# Plan: Roadmap and Feature Voting

The plan for this plugin, kept in the repository so it travels with the code. `SCOPE.md` says what the plugin is. This file says in what order it gets built and what waits.

## Decisions made with the owner

| Question | Decision |
| --- | --- |
| Who can take part | The site owner chooses: signed-in members only, or anyone. Default is anyone. |
| Stages on the board | Four stages in a fixed order. The owner renames each one. |
| Discussion on an idea | Yes, using EmDash's own comments on the idea page. The plugin builds no comment system. |

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
12. **Lab, prove script, owner docs**. Proven by: tests
13. **Registry branding and release gate**. Proven by: the whole checklist

0.1.0 is done when every card is closed with a verification comment, `docs/qa/QA_CHECKLIST.md` has an honest last-walk line, and the gate in `CONTRIBUTING.md` passes. The owner publishes.

## 0.2.0: parked on purpose

Agreed as worth doing, not now. Do not start these during 0.1.0.

- Telling voters when an idea changes stage
- Merging duplicate ideas
- Owner-defined stages

## Not planned

See "Out of scope" in `SCOPE.md`. If a card seems to need one of those, stop and ask the owner.

## Before it goes on a live site

- Prove the kit on a preview deploy of one existing site, never on production first
- Check the site's EmDash version, its content security policy, and its page cache against what the kit does
- Findings from the first plugin are in `wbcomdesigns/emdash-listora` issue #23
