# QA checklist: Roadmap and Feature Voting

One living list of flow-level cases. Walk all of it before every release. When you add or fix behaviour, add or change its case in the same pull request. There are no per-release QA files.

**Last walk:** 2026-10-14, 0.1.0. Route-level on the lab: Ideas, Settings, dashboard card, and `board` (four columns, category=docs shows only Changelog list and Setup guide). No board page yet, so G-1 and G-2 were not walked in a browser. Playwright MCP was locked earlier. Vote, suggest, guest, comments and wording cases are not built yet.

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
| M-3 | Reload the board | Own votes are marked |
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
| A-5 | Move an item to Done in the content admin | It moves column on the board |
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

None recorded yet. List anything a release ships without, here, in plain words.
