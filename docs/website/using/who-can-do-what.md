# Who can do what

**Included in Free.** Product Roadmap has no paid version.

Three kinds of people use the board: guests, signed-in members and you, the admin. A guest is anyone not signed in. A member is anyone signed in to your site, at the lowest role (subscriber) or above.

## Public pages

These pages are open to everyone:

| Page | Address | Who can open it |
| --- | --- | --- |
| Board | `/roadmap/` | Everyone |
| Item page | `/roadmap/<slug>/` | Everyone, for published items |
| Suggest page | `/roadmap/suggest/` | Everyone. Sending needs the right setting |
| Changelog list | `/changelog/` | Everyone |
| Release page | `/changelog/<slug>/` | Everyone |

## Actions

| Action | Guest | Member | Admin |
| --- | --- | --- | --- |
| View the board, items and changelog | Yes | Yes | Yes |
| Vote and take a vote back | Only when **Who can vote and suggest** is **Anyone** | Yes | Yes |
| Suggest an idea, with a name | Only when set to **Anyone** and **Allow suggestions** is on | Yes, when **Allow suggestions** is on | Yes |
| Comment on an item | As EmDash comment settings allow | As EmDash comment settings allow | Yes |
| See other people's votes | No | No | No |
| Approve or reject ideas | No | No | Yes |
| Merge a duplicate | No | No | Yes |
| Change stages and settings | No | No | Yes |
| Move an item to another stage | No | No | Yes |
| Publish items and releases | No | No | Yes |

## Good to know

- A suggestion from a guest or member never goes live by itself. It is saved as a draft until you approve it.
- Visitors never see the list of who voted. Votes are kept in the plugin with a person id or a scrambled visitor code, and there is no screen that lists them.
- Taking part as a guest needs no account. Guests have no list of their own votes. A signed-in member opens **My votes** at `/account/roadmap-votes/` to see items they voted for and take those votes back.
- Where the hosting gives no visitor address, guests are identified by a browser code instead. See [Voting](voting.md#how-a-guest-vote-is-counted).
