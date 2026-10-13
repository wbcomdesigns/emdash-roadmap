# QA checklist: Roadmap and Feature Voting

One living list of flow-level cases. Walk all of it before every release. When you add or fix behaviour, add or change its case in the same pull request. There are no per-release QA files.

**Last walk:** not walked yet.

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
| G-2 | Filter by a product label | Only that product's items |
| G-3 | Click a vote button signed out | Sign-in link. Count unchanged |
| G-4 | Open an item page | Description, status, vote button |
| G-5 | Open an item url that does not exist | 404 page with a 404 status |
| G-6 | Open the changelog | Entries newest first, grouped by month |
| G-7 | Request `vote`, `suggest`, `mine`, `votes` directly | 401 |
| G-8 | Open the suggest page signed out | Sign-in prompt |

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
