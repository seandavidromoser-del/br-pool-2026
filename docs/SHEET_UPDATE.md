# Sheet + Apps Script update for the draft-style refactor

## What changed in the form

The pool is no longer asking entrants to predict specific matchups. Instead they draft teams through successive cuts:

1. **R32 draft** — 2 teams per group (24) + 8 wildcards (max 1 per group)
2. **R16 cut** — pick 16 of those 32
3. **QF cut** — pick 8 of those 16
4. **SF cut** — pick 4 of those 8
5. **Finalists** — pick 2 of those 4
6. **Champion** — pick 1 of those 2
7. **Tiebreaker** — total goals in Final

Scoring is per-team-advancement, not per-matchup.

## New payload posted to the Apps Script

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "tiebreak": "3",
  "groups": {
    "A": ["Mexico", "South Korea"],
    "B": ["Canada", "Switzerland"],
    "C": ["Brazil", "Morocco"],
    "D": ["USA", "Paraguay"],
    "E": ["Germany", "Ecuador"],
    "F": ["Netherlands", "Japan"],
    "G": ["Belgium", "Egypt"],
    "H": ["Spain", "Uruguay"],
    "I": ["France", "Senegal"],
    "J": ["Argentina", "Austria"],
    "K": ["Portugal", "Colombia"],
    "L": ["England", "Croatia"]
  },
  "wildcards": ["Morocco", "Japan", "Ghana", "Norway", "Senegal", "Ecuador", "Uruguay", "Australia"],
  "r16": ["...16 team names..."],
  "qf":  ["...8 team names..."],
  "sf":  ["...4 team names..."],
  "final": ["...2 team names..."],
  "winner": "Brazil"
}
```

Notes:
- The two teams inside each group array are unordered (the UI no longer distinguishes 1st vs 2nd).
- Every team in `r16` also appears in the R32 set (flatten of `groups` + `wildcards`). Every team in `qf` is in `r16`, and so on down to `winner`.
- A wildcard team never overlaps with its own group's advancing pair.

## Apps Script rewrite

Replace the current `doPost` logic. New version should:

1. Parse the JSON payload above.
2. Flatten into a single row with the column order below.
3. Append the row to the `Picks` tab.

Sheet column order (67 columns total):

| Col | Content |
|-----|---------|
| A | Timestamp |
| B | Name |
| C | Email |
| D–AA | 24 group-stage advancers, in group order A1, A2, B1, B2, ..., L1, L2 |
| AB–AI | 8 wildcards |
| AJ–AY | 16 R16 picks |
| AZ–BG | 8 QF picks |
| BH–BK | 4 SF picks |
| BL–BM | 2 Final picks |
| BN | Winner |
| BO | Tiebreaker |

Within the 2-team group slots (e.g. A1/A2), just write them in the order they appear in the array — order is not meaningful.

The canonical Apps Script is in [`docs/apps-script.gs`](./apps-script.gs). Paste the whole file into the Apps Script editor, run `setupHeaderRow` once to write the column headers, then deploy.

## Pool Grid rewrite

The grid no longer tracks match winners. It tracks "did this team reach round X?"

**Source of truth (column B on each row):** you enter the actual advancers as the tournament unfolds. For each row representing a pick slot, column B holds `TRUE`/`FALSE` (or the team name, matching the pick — either works; pick one and be consistent).

**Suggested row layout:**

- Rows 1–3: title + player names + PICK/PTS headers (same as current).
- Rows 4+: 1 row per pick slot, in column order (24 group + 8 wc + 16 R16 + 8 QF + 4 SF + 2 Final + 1 winner = **63 pick slots**).

**Scoring formula pattern** for each player's pick cell against the actual advancing set:

- Per-slot "did this player's pick actually advance to this round?": instead of equality-matching a winner, match a pick against a **set** of actual advancers.
- Maintain a small lookup block elsewhere (e.g., columns BR–BT) with the list of actual advancers per round: 32 for R32, 16 for R16, 8 for QF, 4 for SF, 2 for Final, 1 for Winner.
- A player's pts cell for a given round slot:
  `=IF(ISBLANK({pick_cell}), 0, IF(COUNTIF({round_actuals_range}, {pick_cell}) > 0, {pts_value}, 0))`

**Point values per round:**

| Round | Pick count | Pts each | Round total |
|-------|-----------|----------|-------------|
| R32 advancing | 24 | 1 | 24 |
| R32 wildcards | 8 | 1 | 8 |
| R16 | 16 | 2 | 32 |
| QF | 8 | 4 | 32 |
| SF | 4 | 8 | 32 |
| Final | 2 | 16 | 32 |
| Winner | 1 | 32 | 32 |
| **Total possible** | **63** | — | **192** |

**Tiebreaker:** same as before — goals in the Final; closest guess wins.

**Conditional formatting for eliminated teams:** still useful. When you mark a team as eliminated, any cell containing that team name across the grid should grey out. The 48-team grey-out rules from the current Pool Grid can be reused as-is.

## Migration steps

1. Deploy the new `index.html` to GitHub Pages.
2. In the Apps Script editor, replace the script with the new version and deploy a new version of the web app (keep the same URL).
3. In the Google Sheet: delete the old Picks tab header and replace with the new column layout. Clear any test submissions.
4. Rebuild the Pool Grid tab against the new column layout. The 63-row slot structure plus the round-actuals lookup block is the main work.
5. Test end-to-end: submit a pick from the live form, confirm the row lands correctly in Picks, confirm the Pool Grid calculates points after you enter actual advancers.
