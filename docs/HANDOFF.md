# Bouman Romoser World Cup Pool 2026 — Agent Handoff

## Project Overview

This is a fully custom World Cup 2026 prediction pool built for a family and friends group (~35–50 participants), hosted by Sean David Romoser (SD) and his father John Bouman (JB). The pool is called **The Bouman Romoser World Cup Pool 2026**.

The system has three components:
1. A **web app** (single HTML file) hosted on GitHub Pages where participants submit their picks
2. A **Google Apps Script** that receives submissions and writes them to a Google Sheet
3. A **Google Sheets scoring grid** that auto-calculates points as the tournament progresses

---

## Live URLs and Credentials

- **Live site:** `https://seandavidromoser-del.github.io/br-pool-2026`
- **GitHub repo:** `github.com/seandavidromoser-del/br-pool-2026`
- **Google Apps Script URL:** `https://script.google.com/macros/s/AKfycbx-5XOSNW5OzQFbezL3SOhS_iSl9_-aZWTv9QR3V60v4XcQfjX_BztLXqJz_696lGHY/exec`
- **Google Sheet:** Contains two tabs — `Picks` (raw submissions) and `Pool Grid` (scoring)

To update the live site: edit `index.html` and upload it to the GitHub repo via the GitHub web UI (Add file → Upload files → Commit). GitHub Pages auto-deploys within ~60 seconds.

To update the Apps Script: go to Google Sheet → Extensions → Apps Script → paste new code → Save → Deploy → Manage deployments → pencil icon → New version → Deploy.

---

## Tournament Format

- 48 teams, 12 groups of 4 (Groups A–L)
- Top 2 from each group + 8 best third-place teams = 32 advance to knockout stage
- Knockout rounds: Round of 32, Round of 16, Quarterfinals, Semifinals, Final
- Tournament runs June 11 – July 19, 2026

### The 12 Groups

| Group | Teams |
|-------|-------|
| A | Mexico, South Korea, South Africa, Czechia |
| B | Canada, Switzerland, Qatar, Bosnia & Herzegovina |
| C | Brazil, Morocco, Scotland, Haiti |
| D | USA, Paraguay, Australia, Türkiye |
| E | Germany, Curaçao, Ivory Coast, Ecuador |
| F | Netherlands, Japan, Sweden, Tunisia |
| G | Belgium, Egypt, Iran, New Zealand |
| H | Spain, Cape Verde, Saudi Arabia, Uruguay |
| I | France, Senegal, Iraq, Norway |
| J | Argentina, Algeria, Austria, Jordan |
| K | Portugal, DR Congo, Uzbekistan, Colombia |
| L | England, Croatia, Ghana, Panama |

---

## Pool Scoring

| Round | Points per correct pick |
|-------|------------------------|
| Group stage (top 2 per group) | 1 pt each |
| 3rd place cut (4 eliminated) | 1 pt each |
| Round of 32 | 2 pts each |
| Round of 16 | 4 pts each |
| Quarterfinals | 8 pts each |
| Semifinals | 16 pts each |
| Winner | 32 pts |

Tiebreaker: closest prediction of total goals scored in the Final.

---

## Web App (index.html) — Flow

The form is a single HTML file with no dependencies. All logic is vanilla JavaScript.

### Step sequence:
- **Step 0:** Welcome screen with points overview, name + email entry
- **Steps 1–12:** Group stage — pick top 3 teams from each group (1st, 2nd, 3rd place) — one step per group
- **Step 13:** Eliminate 4 of the 12 third-place picks to get from 36 to 32
- **Step 14:** Round of 32 bracket — 16 matchups, official FIFA bracket structure
- **Step 15:** Round of 16 — 8 matchups, seeded from R32 winners
- **Step 16:** Quarterfinals — 4 matchups
- **Step 17:** Semifinals — 2 matchups
- **Step 18:** Final — pick the champion
- **Step 19:** Tiebreaker (goals in final)
- **Step 20:** Review screen
- **Step 21:** Success/confirmation screen with full bracket visual

### Key data structure (the `picks` object):
```javascript
picks = {
  name: '',
  email: '',
  groups: { A: ['team1','team2','team3'], B: [...], ... },  // 12 groups, 3 picks each
  eliminated: ['team1','team2','team3','team4'],             // 4 third-place eliminations
  matchWinners: { 73: 'TeamName', 74: 'TeamName', ... },    // keyed by official match ID
  wildcards: { '74_wc2': 'TeamName', ... },                 // third-place wildcard assignments
  tiebreak: '3'
}
```

### Official R32 bracket (match IDs 73–88):
```
M73: Runner-up Group A vs Runner-up Group B
M74: Winner Group E vs 3rd place (A/B/C/D/F)
M75: Winner Group F vs Runner-up Group C
M76: Winner Group C vs Runner-up Group F
M77: Winner Group I vs 3rd place (C/D/F/G/H)
M78: Runner-up Group E vs Runner-up Group I
M79: Winner Group A vs 3rd place (C/E/F/H/I)
M80: Winner Group L vs 3rd place (E/H/I/J/K)
M81: Winner Group D vs 3rd place (B/E/F/I/J)
M82: Winner Group G vs 3rd place (A/E/H/I/J)
M83: Runner-up Group K vs Runner-up Group L
M84: Winner Group H vs Runner-up Group J
M85: Winner Group B vs 3rd place (E/F/G/I/J)
M86: Winner Group J vs Runner-up Group H
M87: Winner Group K vs 3rd place (D/E/I/J/L)
M88: Runner-up Group D vs Runner-up Group G
```

### R16 through Final paths:
```
M89: W74 vs W77   M90: W73 vs W75   M91: W76 vs W78   M92: W79 vs W80
M93: W83 vs W84   M94: W81 vs W82   M95: W86 vs W88   M96: W85 vs W87

M97: W89 vs W90   M98: W93 vs W94   M99: W91 vs W92   M100: W95 vs W96

M101: W97 vs W98   M102: W99 vs W100

M104 (Final): W101 vs W102
```

### Design system:
- FIFA 2026 color palette throughout
- Primary: `#7B00FF` (purple), `#CC0000` (red), `#CCFF00` (yellow-green for champion)
- Round colors: R32 = `#8B0000`, R16 = `#CC0000`, QF = `#FF5500`, SF = `#7B00FF`, Champion = `#CCFF00`
- Group pills: `#1A0080` background
- Bracket box: `#f5f5f5` background, `2px solid #1A0080` border
- Font: system sans-serif stack

---

## Google Apps Script — Payload Structure

The app POSTs JSON to the Apps Script. The script writes one row per submission to the `Picks` tab.

### Payload sent by the app:
```javascript
{
  name: "Player Name",
  email: "email@example.com",
  groups: {
    A: ["1st place team", "2nd place team", "3rd place team"],
    // ... all 12 groups
  },
  eliminated: ["team1", "team2", "team3", "team4"],
  r32: ["M73 winner", "M74 winner", ..., "M88 winner"],  // 16 items, match order
  r16: ["M89 winner", ..., "M96 winner"],                 // 8 items
  qf:  ["M97 winner", ..., "M100 winner"],                // 4 items
  sf:  ["M101 winner", "M102 winner"],                    // 2 items
  winner: "Champion team name",
  tiebreak: "3"
}
```

---

## Google Sheets — Column Map (Picks tab)

| Columns | Content |
|---------|---------|
| A | Timestamp |
| B | Name |
| C | Email |
| D–F | Group A (1st, 2nd, 3rd) |
| G–I | Group B |
| J–L | Group C |
| M–O | Group D |
| P–R | Group E |
| S–U | Group F |
| V–X | Group G |
| Y–AA | Group H |
| AB–AD | Group I |
| AE–AG | Group J |
| AH–AJ | Group K |
| AK–AM | Group L |
| AN–AQ | Eliminated 1–4 |
| AR–BG | R32 picks 1–16 (match order M73–M88) |
| BH–BO | R16 picks 1–8 (match order M89–M96) |
| BP–BS | QF picks 1–4 (match order M97–M100) |
| BT–BU | SF picks 1–2 (match order M101–M102) |
| BV | Winner |
| BW | Tiebreaker |

---

## Google Sheets — Pool Grid tab

The Pool Grid is a separate tab that pulls all picks from the Picks tab via formulas. It is **not** fed by direct data entry — everything flows from the Picks tab automatically.

### Key layout:
- **Column A:** Round/pick label
- **Column B:** Actual result (Sean enters the real winners here as the tournament progresses)
- **Column C:** Point value for that round
- **Column D:** Spacer
- **Column E onward:** Player pick/pts pairs (2 columns per player, up to 50 players)

### How scoring works:
- Each player's PICK column uses `=IF(Picks!{col}{row}="","",Picks!{col}{row})`
- Each PTS column uses `=IF(OR($B{row}="",{pick_cell}=""),0,IF(UPPER({pick_cell})=UPPER($B{row}),{pts_value},0))`
- Points are only awarded when Sean enters a result in column B AND the player's pick matches

### Row structure:
```
Row 1:  Title
Row 2:  Player names (from Picks tab, submission order)
Row 3:  PICK / PTS subheaders
Row 4:  GROUP STAGE header
Rows 5–40:   Group stage picks (36 rows, 12 groups × 3)
Row 41: 3RD PLACE CUT header
Rows 42–45:  Elimination picks (4 rows)
Row 46: TOTAL GROUP STAGE
Row 48: ROUND OF 32 header
Rows 49–64:  R32 match winners (16 rows, M73–M88 in order)
Row 65: TOTAL ROUND OF 32
Row 67: ROUND OF 16 header
Rows 68–75:  R16 match winners (8 rows)
Row 76: TOTAL ROUND OF 16
Row 78: QUARTERFINALS header
Rows 79–82:  QF match winners (4 rows)
Row 83: TOTAL QUARTERFINALS
Row 85: SEMIFINALS header
Rows 86–87:  SF match winners (2 rows)
Row 88: TOTAL SEMIFINALS
Row 90: FINAL header
Row 91: Final winner
Row 92: Goals in Final (tiebreaker display)
Row 93: TOTAL FINAL
Rows 95–103: Summary section with round totals and TOTAL POINTS row
```

### Conditional formatting:
- All 48 team names are set up as grey-out rules (`#B7B7B7`) across the picks range — when Sean marks a team as eliminated, any pick cell containing that team name greys out automatically
- Total points row (row 103) has gold/silver/bronze highlighting for 1st/2nd/3rd place

---

## Outstanding / Known Issues

1. **Pool Grid import:** The latest Pool Grid file (`BR_Pool_Grid_v2.xlsx`) needs to be imported into the Google Sheet as a new tab. The previous Pool Grid had incorrect column references (pulling from the wrong Picks columns for knockout round picks). The v2 file fixes this.

2. **Test submissions:** There are test entries in the Picks tab from development. These should be deleted before the real invite goes out.

3. **Invite email:** Not yet drafted. Should include the live URL, brief explanation of how it works, and a deadline for submissions (before June 11 kickoff).

4. **Deadline enforcement:** The form currently has no cutoff date — anyone can submit at any time including after the tournament starts. Consider adding a date check in the Apps Script that rejects submissions after June 11, 2026.

5. **Duplicate submissions:** No deduplication logic exists. If someone submits twice, both rows land in the Picks tab. Worth adding an email-based duplicate check in the Apps Script.

6. **Pool Grid column headers:** After importing the new Pool Grid tab, row 2 will show player names pulling from the Picks tab. The old Pool Grid tab should be deleted to avoid confusion.

---

## Files in This Handoff

| File | Description |
|------|-------------|
| `index.html` | Complete web app — upload to GitHub repo root |
| `AppsScript.js` | Google Apps Script code — paste into Apps Script editor |
| `BR_Pool_Grid_v2.xlsx` | Corrected Pool Grid — import into Google Sheet as new tab |
| `br_pool_headers_v2.csv` | Column headers for Picks tab (75 columns) |
| `HANDOFF.md` | This file |

---

## Owner Context

Sean is a Production Lead at Ampersand (in-house agency at Church & Dwight). He is moderately technical — comfortable following step-by-step instructions, not a developer. His husband co-founded Aboard (AI/software agency). He prefers direct, clear communication without unnecessary preamble. Avoid m-dashes in all writing.
