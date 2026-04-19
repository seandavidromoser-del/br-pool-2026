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
