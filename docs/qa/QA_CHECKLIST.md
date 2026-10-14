# QA checklist: Product Roadmap

One living list of flow-level cases. Walk all of it before every release. When you add or fix behaviour, add or change its case in the same pull request. There are no per-release QA files.

**Last walk:** 2026-10-14, 0.1.1 on `0.1.1`. Isolated Chromium and routes against `emdash-lab-roadmap` :4335 after `./scripts/reset-lab.sh`. 30 tests pass. `./scripts/prove-lab.sh --all` pass.

Walked in a browser: G-1, G-2, G-4, G-6, G-9 (guest vote 1 to 2), G-10 path (suggest form), M-1 (subscriber vote 0 to 1), M-3 (reload after vote still shows count, not Voted 0), M-5 (subscriber suggest, thanks), M-8 (390 tabs, no sideways scroll), A-11 (Settings: Each group saves on its own; Stage panel wording; no collection-name line), P-1 at 1440 and 390, P-2 dark, P-4 visible vote and filter taps 40px.

Checked at route level only: G-7, G-11, prove-lab (member vote, guest vote, suggest, board filter, admin pages), editor_stage tests (choice list, move to Done, guests and members refused).

Checked in tests only: M-6, M-7, A-4, A-8, A-9, A-10, A-12, registry id `r_76xywti6l5cbxzos`, vote aria-label with count, taxonomy label Roadmap categories.

Not walked: G-5, G-8, G-12 comments thread, M-2 take-back in this pass (covered by prove-lab), M-9, M-10 (#8, 0.2.0), #18 in-text block, A-5 Stage panel expand in the live editor (route and tests cover the choice; the panel starts collapsed), second same-role member, hourly email firing on its own, VoiceOver, RTL, a second machine's registry install (kit id is unit-tested).

When you walk it, replace that line with the date, the version, and three lists: cases walked in the browser, cases checked at route level only, cases not walked. Do not claim a case you did not run.

## Setup

```bash
./scripts/reset-lab.sh             # clean data, lab running
./scripts/prove-lab.sh             # route-level smoke, must pass first
./scripts/lab-role.sh subscriber   # member cases as the lowest signed-in role
./scripts/lab-role.sh admin        # back to admin
```

Three roles, in this order: guest (private window), member (subscriber), admin. A case proven only as admin is not proven. Name test data `QA-RFT ...` and reset the lab afterwards.

## Guest

| ID | Steps | Expected |
| --- | --- | --- |
| G-1 | Open the roadmap | Four columns with items and vote counts |
| G-2 | Filter by a category | Only that category's items |
| G-3 | Setting members: click a vote button signed out | Sign-in link. Count unchanged |
| G-4 | Open an item page | Description, status, vote button |
| G-5 | Open an item url that does not exist | 404 page with a 404 status |
| G-6 | Open the changelog | Entries newest first, grouped by month |
| G-7 | Request `vote`, `suggest`, `mine`, `votes` directly | 401 |
| G-8 | Setting members: open the suggest page signed out | Sign-in prompt |
| G-9 | Setting anyone: vote signed out, then click again | Count goes up by one, then back |
| G-10 | Setting anyone: suggest an idea signed out with a name | Thanks message. It waits in the admin queue |
| G-11 | Setting members: call `vote_guest` and `suggest_guest` directly | Refused |
| G-12 | Open an idea page | EmDash comments show below the description, following the site's own comment settings |
| G-94 | Change three phrases in the wording file (a button, an empty state, an error), rebuild | Each change shows everywhere that phrase is used. No English left on screen that is not in the file |

## Member (subscriber role)

| ID | Steps | Expected |
| --- | --- | --- |
| M-1 | Vote on an item | Count goes up by one. Button shows voted |
| M-2 | Click again | Vote taken back. Count goes down |
| M-3 | Reload the board within two minutes of voting | Own votes are marked and the count is still at least 1, not "Voted 0" |
| M-4 | Send another member's id, or a draft item's id | Ignored, refused |
| M-5 | Suggest an idea | Thanks message. The idea is not on the board |
| M-6 | Suggest nine ideas in an hour | The ninth is refused |
| M-7 | Put markup in an idea, have it approved | Shown as plain text |
| M-8 | Use the board on a phone | Tabs switch columns. No sideways scroll |
| M-9 | Open My votes | Voted items by name, own ideas with status |
| M-10 | Delete my votes (two clicks) | List empties. Counts drop |

## Admin

| ID | Steps | Expected |
| --- | --- | --- |
| A-1 | Open Ideas with one pending | Full title, description and member name |
| A-2 | Approve it | It appears under Under review on the board |
| A-3 | Reject another | It never appears. It stays a draft in the content admin |
| A-4 | Load the page, member edits the idea, click Approve | Refused: changed after this page loaded |
| A-5 | On a roadmap item, pick Done from the Stage panel | A list of stage names, not a typed field. The item moves column on the board |
| A-6 | Turn ideas off | The suggest page says ideas are closed. The route refuses |
| A-7 | Open the queue with a guest idea waiting | It shows the guest's name and is marked as from a guest |
| A-8 | Rename the four stages in settings | The board, the idea page and the admin all use the new names. The order does not change |
| A-9 | Add a hidden stage named Declined, move an item there | The item leaves the public board. The stage name is shown, never an internal key |
| A-10 | Try to remove a stage that still has items | Refused. The page says how many items are in that stage |
| A-11 | Change who can take part and the email address, reload | The saved values are still there and take effect |
| A-12 | Twenty ideas waiting, hourly task runs twice; then switch email off | One email, no idea text and no link. Switch off sends none |

## Presentation, every screen

| ID | Steps | Expected |
| --- | --- | --- |
| P-1 | Every screen at 1440, 768 and 390 | No sideways scroll |
| P-2 | Switch the system to dark mode | All text readable. No white panel on a dark page |
| P-3 | Measure text contrast | Body text 4.5:1, large text 3:1 |
| P-4 | Measure buttons, inputs, tabs | At least 40px tall |
| P-5 | Tab through every control | Everything reachable, focus ring visible, forms usable by keyboard |
| P-6 | Empty, loading and error states | Each list has an empty state with a next step. A failed request shows a message |
| P-7 | Look for raw ids | No screen shows an id where a name belongs |
| P-8 | View page source as two different visitors | Kit markup is identical. No member data in the HTML |

## Known gaps

- My votes (`<MyVotes>`) is 0.2.0. M-9 and M-10 stay parked.
- The in-text Roadmap block (#18) needs a trusted install. The registry install is the whole product without it.
- This plugin has no `OWNER_INVENTORY.md`, `CORE_PATHS.md`, or `ROLE_MATRIX.md`. The contract is this checklist. Only one lab login exists, so two same-role members cannot be walked.
- Hourly email is proven in tests, not seen firing on its own on the lab.
