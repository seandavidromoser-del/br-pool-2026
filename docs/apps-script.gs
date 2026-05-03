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
var TEAMS_BY_GROUP = {
  A: ['Mexico','South Korea','South Africa','Czechia'],
  B: ['Canada','Switzerland','Qatar','Bosnia & Herzegovina'],
  C: ['Brazil','Morocco','Scotland','Haiti'],
  D: ['USA','Paraguay','Australia','Türkiye'],
  E: ['Germany','Curaçao','Ivory Coast','Ecuador'],
  F: ['Netherlands','Japan','Sweden','Tunisia'],
  G: ['Belgium','Egypt','Iran','New Zealand'],
  H: ['Spain','Cape Verde','Saudi Arabia','Uruguay'],
  I: ['France','Senegal','Iraq','Norway'],
  J: ['Argentina','Algeria','Austria','Jordan'],
  K: ['Portugal','DR Congo','Uzbekistan','Colombia'],
  L: ['England','Croatia','Ghana','Panama']
};

var TEAM_TO_GROUP_ = null;
function getTeamGroup(team) {
  if (!TEAM_TO_GROUP_) {
    TEAM_TO_GROUP_ = {};
    GROUP_ORDER.forEach(function(g) {
      TEAMS_BY_GROUP[g].forEach(function(t) { TEAM_TO_GROUP_[t] = g; });
    });
  }
  return TEAM_TO_GROUP_[team] || '';
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
    sheet.appendRow(buildRow(payload));
    // Email is best-effort — never let an email failure fail the submission
    try { sendPicksEmail(payload); } catch (mailErr) { Logger.log('Email failed: ' + mailErr); }
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var route = (e && e.parameter && e.parameter.route) || '';
  if (route === 'standings') {
    return jsonResponse(getStandings());
  }
  return jsonResponse({ ok: true, message: 'BR Pool 2026 endpoint is alive' });
}

// ─── Simple trigger: track when actuals were last edited ───────────────────
// Fires on any user edit. We record a timestamp only when the edit lands in
// Pool Grid!B5:B68 (the Actual-advancers column) so the standings page can
// show a real "Updated X minutes ago" instead of the current server time.
//
// Simple triggers can't call services that require auth, but PropertiesService
// is allowed — that's all this needs.
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== 'Pool Grid') return;
    var col = e.range.getColumn();
    var startRow = e.range.getRow();
    var endRow = startRow + e.range.getNumRows() - 1;
    // Actuals: column B (col 2), rows 5..68
    if (col !== 2) return;
    if (endRow < 5 || startRow > 68) return;
    PropertiesService.getScriptProperties().setProperty(
      'POOL_GRID_LAST_UPDATED', new Date().toISOString()
    );
  } catch (err) {
    // Simple triggers must never throw
  }
}

// ─── Standings endpoint ─────────────────────────────────────────────────────
// Reads the Pool Grid tab and returns a JSON snapshot of every player's picks,
// their total points, their rank, and the actual round-by-round advancers.
// The standings page hits this on load via fetch.
function getStandings() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var grid = ss.getSheetByName('Pool Grid');
    if (!grid) {
      return { ok: false, error: 'Pool Grid sheet not found. Run buildPoolGrid() first.' };
    }

    var lastCol = grid.getLastColumn();
    if (lastCol < 3) {
      return { ok: true, players: [], actuals: emptyActuals_(), updated: new Date().toISOString() };
    }
    var numPlayers = lastCol - 2;

    // Rows 2/3/4 of player columns: name, total points, rank
    var meta = grid.getRange(2, 3, 3, numPlayers).getValues();
    var nameRow  = meta[0];
    var totalRow = meta[1];
    var rankRow  = meta[2];

    // Actual advancers in column B, rows 5..68 (64 slots: 32 R32, 16 R16, 8 QF,
    // 4 SF, 2 Final, 1 Winner, 1 Tiebreak goals).
    var actualsCol = grid.getRange(5, 2, 64, 1).getValues().map(function(r) {
      return String(r[0] || '').trim();
    });

    // All player picks for those same 64 rows.
    var picksBlock = grid.getRange(5, 3, 64, numPlayers).getValues();

    function nonEmpty(arr) { return arr.filter(function(s) { return s !== ''; }); }

    var actuals = {
      r32:      nonEmpty(actualsCol.slice(0, 32)),
      r16:      nonEmpty(actualsCol.slice(32, 48)),
      qf:       nonEmpty(actualsCol.slice(48, 56)),
      sf:       nonEmpty(actualsCol.slice(56, 60)),
      final:    nonEmpty(actualsCol.slice(60, 62)),
      winner:   actualsCol[62] || '',
      tiebreak: actualsCol[63] || ''
    };

    var players = [];
    for (var i = 0; i < numPlayers; i++) {
      var name = String(nameRow[i] || '').trim();
      if (!name) continue;
      var col = picksBlock.map(function(r) { return String(r[i] || '').trim(); });

      // Group picks: rows 0..23 are A1, A2, B1, B2, …, L1, L2
      var groups = {};
      GROUP_ORDER.forEach(function(g, gi) {
        groups[g] = [col[gi * 2], col[gi * 2 + 1]];
      });

      players.push({
        name:   name,
        total:  Number(totalRow[i]) || 0,
        rank:   Number(rankRow[i])  || 0,
        picks: {
          groups:    groups,
          wildcards: col.slice(24, 32),
          r16:       col.slice(32, 48),
          qf:        col.slice(48, 56),
          sf:        col.slice(56, 60),
          final:     col.slice(60, 62),
          winner:    col[62] || '',
          tiebreak:  col[63] || ''
        }
      });
    }

    // Sort by total desc, then alpha so ties are stable.
    players.sort(function(a, b) {
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    // "Updated" reflects the last time an actual advancer was entered into
    // Pool Grid!B5:B68 (recorded by the onEdit trigger). If that property
    // hasn't been set yet (e.g. before any actuals are filled in), return
    // null so the page can hide the timestamp instead of showing a misleading
    // "now".
    var lastUpdated = PropertiesService.getScriptProperties()
      .getProperty('POOL_GRID_LAST_UPDATED') || null;

    return {
      ok: true,
      players: players,
      actuals: actuals,
      updated: lastUpdated
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function emptyActuals_() {
  return { r32: [], r16: [], qf: [], sf: [], final: [], winner: '', tiebreak: '' };
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

// ─── Confirmation email ─────────────────────────────────────────────────────
function sendPicksEmail(p) {
  if (!p || !p.email) return;
  var subject = "Your Bouman Romoser Pool 2026 picks";
  GmailApp.sendEmail(p.email, subject, buildPicksEmailPlain(p), {
    htmlBody: buildPicksEmailHtml(p),
    name: 'Bouman Romoser Pool 2026'
  });
}

function buildPicksEmailHtml(p) {
  var name = escapeHtml_(p.name || 'there');
  var winner = escapeHtml_(p.winner || '—');
  var tiebreak = escapeHtml_(String(p.tiebreak || '—'));
  var winnerGroup = p.winner ? getTeamGroup(p.winner) : '';

  // R32 by group
  var groupBlocks = '';
  GROUP_ORDER.forEach(function(g) {
    var top2 = (p.groups && p.groups[g]) || [];
    var wcs = (p.wildcards || []).filter(function(t) { return getTeamGroup(t) === g; });
    if (top2.length === 0 && wcs.length === 0) return;
    var rows = '';
    top2.forEach(function(t) {
      rows += '<tr><td style="padding:4px 0;color:#0f172a;">' + escapeHtml_(t) + '</td>' +
              '<td style="padding:4px 0;text-align:right;font-size:11px;color:#64748b;letter-spacing:0.06em;text-transform:uppercase;">Top 2</td></tr>';
    });
    wcs.forEach(function(t) {
      rows += '<tr><td style="padding:4px 0;color:#0f172a;">' + escapeHtml_(t) + '</td>' +
              '<td style="padding:4px 0;text-align:right;font-size:11px;color:#b87a1f;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">WC</td></tr>';
    });
    groupBlocks +=
      '<div style="margin-bottom:14px;">' +
        '<div style="font-size:12px;font-weight:700;color:#14a85c;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Group ' + g + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>' +
      '</div>';
  });

  var koSections =
    koSectionHtml('Round of 16', '2 pts each', p.r16) +
    koSectionHtml('Quarterfinals', '4 pts each', p.qf) +
    koSectionHtml('Semifinals', '8 pts each', p.sf) +
    koSectionHtml('Finals', '16 pts each', p.final);

  return [
    '<!doctype html>',
    '<html><body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">',
    '<tr><td align="center">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">',

    '<tr><td style="padding:28px 28px 20px;border-bottom:1px solid #e5e7eb;">',
    '<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.18em;text-transform:uppercase;">Submission received</div>',
    '<div style="font-size:24px;font-weight:800;color:#0f172a;margin-top:6px;">Your picks are in, ' + name + '.</div>',
    '<div style="font-size:14px;color:#475569;margin-top:8px;line-height:1.5;">Here\'s what we recorded. The tournament kicks off June 11, 2026. Standings updates will land in your inbox as the rounds play out.</div>',
    '</td></tr>',

    '<tr><td style="padding:24px 28px;">',
    '<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">Round of 32 · 1 pt each</div>',
    groupBlocks,
    '</td></tr>',

    '<tr><td style="padding:0 28px 8px;">',
    koSections,
    '</td></tr>',

    '<tr><td style="padding:8px 28px 24px;">',
    '<div style="background:#f0fdf4;border:1px solid #14a85c;border-radius:8px;padding:18px;text-align:center;">',
      '<div style="font-size:11px;font-weight:700;color:#14a85c;letter-spacing:0.18em;text-transform:uppercase;">Champion · 32 pts</div>',
      '<div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:6px;">' + winner + (winnerGroup ? ' <span style="font-size:13px;font-weight:600;color:#64748b;">· Group ' + winnerGroup + '</span>' : '') + '</div>',
      '<div style="font-size:12px;color:#64748b;margin-top:10px;">Tiebreaker: ' + tiebreak + ' goals in the Final</div>',
    '</div>',
    '</td></tr>',

    '<tr><td style="padding:18px 28px 24px;border-top:1px solid #e5e7eb;font-size:13px;color:#64748b;line-height:1.5;">',
    'See something off? Reply to this email and we\'ll fix it. You can also resubmit at <a href="https://seandavidromoser-del.github.io/br-pool-2026/" style="color:#14a85c;text-decoration:underline;">the form</a> any time before kickoff.',
    '<div style="margin-top:14px;">— JB &amp; SD</div>',
    '</td></tr>',

    '</table>',
    '</td></tr>',
    '</table>',
    '</body></html>'
  ].join('');
}

function koSectionHtml(title, sub, teams) {
  if (!teams || teams.length === 0) return '';
  var rows = teams.map(function(t) {
    var g = getTeamGroup(t);
    return '<tr>' +
      '<td style="padding:4px 0;color:#0f172a;">' + escapeHtml_(t) + '</td>' +
      '<td style="padding:4px 0;text-align:right;font-size:11px;color:#94a3b8;letter-spacing:0.06em;">' + (g ? 'Group ' + g : '') + '</td>' +
    '</tr>';
  }).join('');
  return '<div style="margin-bottom:18px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">' +
      '<span style="font-size:13px;font-weight:700;color:#0f172a;">' + title + '</span>' +
      '<span style="font-size:11px;font-weight:700;color:#14a85c;letter-spacing:0.08em;text-transform:uppercase;">' + sub + '</span>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>' +
  '</div>';
}

function buildPicksEmailPlain(p) {
  var lines = [];
  lines.push('Your picks are in, ' + (p.name || 'there') + '.');
  lines.push('');
  lines.push('Round of 32 (1 pt each):');
  GROUP_ORDER.forEach(function(g) {
    var top2 = (p.groups && p.groups[g]) || [];
    var wcs = (p.wildcards || []).filter(function(t) { return getTeamGroup(t) === g; });
    if (top2.length === 0 && wcs.length === 0) return;
    lines.push('  Group ' + g + ':');
    top2.forEach(function(t) { lines.push('    - ' + t + ' (Top 2)'); });
    wcs.forEach(function(t) { lines.push('    - ' + t + ' (Wildcard)'); });
  });
  lines.push('');
  ['Round of 16:2', 'Quarterfinals:4', 'Semifinals:8', 'Finals:16'].forEach(function(s) {
    var parts = s.split(':');
    var key = parts[0] === 'Round of 16' ? 'r16' : parts[0] === 'Quarterfinals' ? 'qf' : parts[0] === 'Semifinals' ? 'sf' : 'final';
    var teams = p[key] || [];
    if (teams.length === 0) return;
    lines.push(parts[0] + ' (' + parts[1] + ' pts each):');
    teams.forEach(function(t) { lines.push('  - ' + t); });
    lines.push('');
  });
  lines.push('Champion (32 pts): ' + (p.winner || '—'));
  lines.push('Tiebreaker: ' + (p.tiebreak || '—') + ' goals in the Final');
  lines.push('');
  lines.push('See something off? Reply to this email and we\'ll fix it.');
  lines.push('You can resubmit at https://seandavidromoser-del.github.io/br-pool-2026/ any time before kickoff.');
  lines.push('');
  lines.push('— JB & SD');
  return lines.join('\n');
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
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

// ─── Dev helper: send a sample picks email to yourself (no sheet write) ────
// Run from the Apps Script editor to preview the confirmation email layout.
function testEmail() {
  var payload = sampleTestPayload_();
  payload.email = Session.getActiveUser().getEmail();
  payload.name = 'Sean';
  sendPicksEmail(payload);
  Logger.log('Sent sample picks email to ' + payload.email);
}

function sampleTestPayload_() {
  return {
    name: 'Test User',
    email: 'test@example.com',
    tiebreak: '3',
    groups: {
      A: ['Mexico', 'South Korea'], B: ['Canada', 'Switzerland'],
      C: ['Brazil', 'Morocco'], D: ['USA', 'Paraguay'],
      E: ['Germany', 'Ecuador'], F: ['Netherlands', 'Japan'],
      G: ['Belgium', 'Egypt'], H: ['Spain', 'Uruguay'],
      I: ['France', 'Senegal'], J: ['Argentina', 'Austria'],
      K: ['Portugal', 'Colombia'], L: ['England', 'Croatia']
    },
    wildcards: ['Haiti','Sweden','Ghana','Norway','Uruguay','Ecuador','Japan','Morocco'],
    r16: ['Mexico','Brazil','USA','Germany','Netherlands','Belgium','Spain','France',
          'Argentina','Portugal','England','Canada','Japan','Morocco','Colombia','Uruguay'],
    qf: ['Brazil','Germany','Spain','France','Argentina','Portugal','England','Netherlands'],
    sf: ['Brazil','France','Argentina','England'],
    final: ['Brazil','Argentina'],
    winner: 'Brazil'
  };
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
