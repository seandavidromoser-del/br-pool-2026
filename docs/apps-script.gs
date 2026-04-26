// ─────────────────────────────────────────────────────────────────────────────
// Bouman Romoser World Cup Pool 2026 — submit endpoint
//
// This is the canonical Apps Script source for the pool. To deploy:
//   1. Open the existing Apps Script project:
//      https://script.google.com/home/projects
//      (find the one linked to the pool's Google Sheet)
//   2. Replace the Code.gs contents with the code in this file.
//   3. Run `setupHeaderRow` once to write the column headers to the Picks tab.
//   4. Deploy → Manage deployments → pencil icon on the existing web-app
//      deployment → Version: "New version" → Deploy. Keep the same URL so
//      index.html doesn't need to change.
//
// Column layout (67 cols): Timestamp, Name, Email, then 24 group slots
// (A1,A2,B1,B2,…,L1,L2), 8 wildcards, 16 R16, 8 QF, 4 SF, 2 Final, 1 Winner,
// 1 Tiebreak.
// ─────────────────────────────────────────────────────────────────────────────

var SHEET_NAME = 'Picks';
var GROUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L'];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
    sheet.appendRow(buildRow(payload));
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, message: 'BR Pool 2026 endpoint is alive' });
}

function buildRow(p) {
  var row = [new Date(), p.name || '', p.email || ''];

  // 24 group-stage slots: A1, A2, B1, B2, ..., L1, L2
  var groups = p.groups || {};
  GROUP_ORDER.forEach(function(g) {
    var teams = groups[g] || [];
    row.push(teams[0] || '');
    row.push(teams[1] || '');
  });

  // Fixed-size knockout picks, padded to the expected length
  row = row.concat(fixedSize(p.wildcards, 8));
  row = row.concat(fixedSize(p.r16, 16));
  row = row.concat(fixedSize(p.qf, 8));
  row = row.concat(fixedSize(p.sf, 4));
  row = row.concat(fixedSize(p.final, 2));
  row.push(p.winner || '');
  row.push(p.tiebreak || '');

  return row;
}

function fixedSize(arr, n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push((arr && arr[i]) ? arr[i] : '');
  return out;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── One-time setup: write header row to the Picks tab ──────────────────────
function setupHeaderRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  var headers = buildHeaders();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function buildHeaders() {
  var row = ['Timestamp', 'Name', 'Email'];
  GROUP_ORDER.forEach(function(g) {
    row.push(g + '1');
    row.push(g + '2');
  });
  for (var i = 1; i <= 8;  i++) row.push('WC_' + i);
  for (var i = 1; i <= 16; i++) row.push('R16_' + i);
  for (var i = 1; i <= 8;  i++) row.push('QF_' + i);
  for (var i = 1; i <= 4;  i++) row.push('SF_' + i);
  for (var i = 1; i <= 2;  i++) row.push('Final_' + i);
  row.push('Winner');
  row.push('Tiebreak');
  return row;
}

// ─── Pool Grid: a top tab that tallies live standings ──────────────────────
// Run this whenever you want to (re)generate the Pool Grid tab with the
// current roster of players. Each player's picks are pulled live from the
// Picks sheet via formulas, so totals update as soon as you fill in the
// "Actual" column (B) with the teams that actually advanced each round.
//
// Layout:
//   Row 1: merged title
//   Row 2: headers — Slot, Actual, then one column per player
//   Row 3: Total points (formula) — max 192
//   Row 4: Rank (formula)
//   Rows 5–36:  R32 pick slots (24 top-2 + 8 wildcards, 1 pt each)
//   Rows 37–52: R16 slots (2 pts each)
//   Rows 53–60: QF slots (4 pts each)
//   Rows 61–64: SF slots (8 pts each)
//   Rows 65–66: Final slots (16 pts each)
//   Row 67:     Winner (32 pts)
//   Row 68:     Tiebreak (goals-in-Final guess; not auto-scored)
function buildPoolGrid() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var picks = ss.getSheetByName(SHEET_NAME);
  if (!picks) throw new Error('Sheet "' + SHEET_NAME + '" not found');

  var lastRow = picks.getLastRow();
  if (lastRow < 2) throw new Error('No player rows in Picks yet');

  // Read player names from Picks!B2:B<last>
  var nameValues = picks.getRange(2, 2, lastRow - 1, 1).getValues();
  var players = [];
  for (var i = 0; i < nameValues.length; i++) {
    var n = String(nameValues[i][0] || '').trim();
    if (n) players.push(n);
  }
  if (players.length === 0) throw new Error('No player names found in Picks');

  // Create or clear the Pool Grid sheet; move it to the first tab position
  var grid = ss.getSheetByName('Pool Grid');
  if (!grid) {
    grid = ss.insertSheet('Pool Grid', 0);
  } else {
    grid.clear();
    grid.clearConditionalFormatRules();
  }
  ss.setActiveSheet(grid);
  ss.moveActiveSheet(1);

  var totalCols = 2 + players.length;
  var lastColLetter = columnToLetter(totalCols);

  // Row 1: title banner. Not merged — a merge spanning the frozen-columns
  // boundary would throw. A1 holds the text and overflows into the empty
  // cells to its right; the background color is applied to the whole row
  // so it reads as one banner.
  grid.getRange(1, 1, 1, totalCols)
    .setBackground('#14532d').setFontColor('#ffffff');
  grid.getRange(1, 1)
    .setValue('The Bouman Romoser World Cup Pool 2026 · Standings')
    .setFontWeight('bold').setFontSize(14);

  // Row 2: headers
  var headerRow = ['Slot', 'Actual'].concat(players);
  grid.getRange(2, 1, 1, totalCols).setValues([headerRow])
    .setFontWeight('bold').setBackground('#f1f5f9');

  // Row 3: Total points per player
  var totalRow = ['Total pts', ''];
  for (var p = 0; p < players.length; p++) {
    var col = columnToLetter(3 + p);
    totalRow.push(
      '=SUMPRODUCT((COUNTIF($B$5:$B$36,'  + col + '$5:'  + col + '$36 )>0)*1) + ' +
      'SUMPRODUCT((COUNTIF($B$37:$B$52,' + col + '$37:' + col + '$52)>0)*2) + ' +
      'SUMPRODUCT((COUNTIF($B$53:$B$60,' + col + '$53:' + col + '$60)>0)*4) + ' +
      'SUMPRODUCT((COUNTIF($B$61:$B$64,' + col + '$61:' + col + '$64)>0)*8) + ' +
      'SUMPRODUCT((COUNTIF($B$65:$B$66,' + col + '$65:' + col + '$66)>0)*16) + ' +
      'IF(' + col + '$67=$B$67,32,0)'
    );
  }
  grid.getRange(3, 1, 1, totalCols).setValues([totalRow])
    .setFontWeight('bold').setBackground('#dcfce7');

  // Row 4: Rank
  var rankRow = ['Rank', ''];
  for (var p = 0; p < players.length; p++) {
    var col = columnToLetter(3 + p);
    rankRow.push('=IFERROR(RANK(' + col + '$3,$C$3:$' + lastColLetter + '$3),"")');
  }
  grid.getRange(4, 1, 1, totalCols).setValues([rankRow])
    .setFontStyle('italic').setFontColor('#64748b');

  // Slot labels (63 rows + 1 tiebreak = 64)
  var slotLabels = [];
  GROUP_ORDER.forEach(function(g) {
    slotLabels.push(g + '1');
    slotLabels.push(g + '2');
  });
  for (var i = 1; i <= 8;  i++) slotLabels.push('WC ' + i);
  for (var i = 1; i <= 16; i++) slotLabels.push('R16 ' + i);
  for (var i = 1; i <= 8;  i++) slotLabels.push('QF ' + i);
  for (var i = 1; i <= 4;  i++) slotLabels.push('SF ' + i);
  for (var i = 1; i <= 2;  i++) slotLabels.push('Final ' + i);
  slotLabels.push('Winner');
  slotLabels.push('Tiebreak');

  // Rows 5+: slot + actual + player-pick formulas
  // For each player column, the formula is identical across rows because
  // it uses ROW()-1 to derive the Picks-sheet column index (row 5 → col 4 = D,
  // row 67 → col 66 = BN, row 68 → col 67 = BO/Tiebreak).
  var rows = [];
  for (var r = 0; r < slotLabels.length; r++) {
    var row = [slotLabels[r], ''];
    for (var p = 0; p < players.length; p++) {
      var playerCol = columnToLetter(3 + p);
      row.push(
        '=IFERROR(INDEX(Picks!$A:$BO,MATCH(' + playerCol +
        '$2,Picks!$B:$B,0),ROW()-1),"")'
      );
    }
    rows.push(row);
  }
  grid.getRange(5, 1, rows.length, totalCols).setValues(rows);

  // Visual separator bands by round
  grid.getRange(5,  1, 32, totalCols).setBackground(null);              // R32
  grid.getRange(37, 1, 16, totalCols).setBackground('#f8fafc');         // R16
  grid.getRange(53, 1,  8, totalCols).setBackground(null);              // QF
  grid.getRange(61, 1,  4, totalCols).setBackground('#f8fafc');         // SF
  grid.getRange(65, 1,  2, totalCols).setBackground(null);              // Final
  grid.getRange(67, 1,  1, totalCols).setBackground('#dcfce7');         // Winner
  grid.getRange(68, 1,  1, totalCols).setBackground('#f1f5f9')          // Tiebreak
    .setFontStyle('italic');

  // Make slot and actual cols stand out
  grid.getRange(5, 1, rows.length, 1).setFontWeight('bold').setFontColor('#14532d');
  grid.getRange(5, 2, rows.length, 1).setBackground('#fef3c7'); // amber hint for truth column

  // Conditional formatting: green a pick cell when the team is in the round's actuals
  var picksRange = grid.getRange(5, 3, 63, players.length);
  var rules = grid.getConditionalFormatRules();
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(ROW()>=5,ROW()<=36,COUNTIF($B$5:$B$36,INDIRECT(ADDRESS(ROW(),COLUMN())))>0)')
      .setBackground('#bbf7d0')
      .setRanges([picksRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(ROW()>=37,ROW()<=52,COUNTIF($B$37:$B$52,INDIRECT(ADDRESS(ROW(),COLUMN())))>0)')
      .setBackground('#86efac')
      .setRanges([picksRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(ROW()>=53,ROW()<=60,COUNTIF($B$53:$B$60,INDIRECT(ADDRESS(ROW(),COLUMN())))>0)')
      .setBackground('#4ade80')
      .setRanges([picksRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(ROW()>=61,ROW()<=64,COUNTIF($B$61:$B$64,INDIRECT(ADDRESS(ROW(),COLUMN())))>0)')
      .setBackground('#22c55e')
      .setRanges([picksRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(ROW()>=65,ROW()<=66,COUNTIF($B$65:$B$66,INDIRECT(ADDRESS(ROW(),COLUMN())))>0)')
      .setBackground('#16a34a').setFontColor('#ffffff')
      .setRanges([picksRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        '=AND(ROW()=67,INDIRECT(ADDRESS(ROW(),COLUMN()))=$B$67,$B$67<>"")')
      .setBackground('#14532d').setFontColor('#ffffff').setBold(true)
      .setRanges([picksRange]).build()
  );
  grid.setConditionalFormatRules(rules);

  // Freeze title/header/total/rank rows and first two cols
  grid.setFrozenRows(4);
  grid.setFrozenColumns(2);

  // Column widths
  grid.setColumnWidth(1, 90);   // slot
  grid.setColumnWidth(2, 150);  // actual
  for (var p = 0; p < players.length; p++) {
    grid.setColumnWidth(3 + p, 140);
  }

  // Row height for title
  grid.setRowHeight(1, 36);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Pool Grid rebuilt: ' + players.length + ' players, 63 pick slots.',
    'Done', 5);
}

function columnToLetter(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod) / 26);
  }
  return letter;
}

// ─── Dev helper: test the doPost pipeline without a real HTTP request ──────
function testDoPost() {
  var payload = {
    name: 'Test User',
    email: 'test@example.com',
    tiebreak: '3',
    groups: {
      A: ['Mexico', 'South Korea'],
      B: ['Canada', 'Switzerland'],
      C: ['Brazil', 'Morocco'],
      D: ['USA', 'Paraguay'],
      E: ['Germany', 'Ecuador'],
      F: ['Netherlands', 'Japan'],
      G: ['Belgium', 'Egypt'],
      H: ['Spain', 'Uruguay'],
      I: ['France', 'Senegal'],
      J: ['Argentina', 'Austria'],
      K: ['Portugal', 'Colombia'],
      L: ['England', 'Croatia']
    },
    wildcards: ['Haiti','Sweden','Ghana','Norway','Uruguay','Ecuador','Japan','Morocco'],
    r16: ['Mexico','Brazil','USA','Germany','Netherlands','Belgium','Spain','France',
          'Argentina','Portugal','England','Canada','Japan','Morocco','Colombia','Uruguay'],
    qf: ['Brazil','Germany','Spain','France','Argentina','Portugal','England','Netherlands'],
    sf: ['Brazil','France','Argentina','England'],
    final: ['Brazil','Argentina'],
    winner: 'Brazil'
  };
  var res = doPost({ postData: { contents: JSON.stringify(payload) } });
  Logger.log(res.getContent());
}
