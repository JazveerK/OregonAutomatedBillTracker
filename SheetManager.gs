// ============================================================
// Oregon Bill Tracker — Google Sheets read/write operations
// ============================================================

const TRACKED_SHEET = 'Tracked Bills';
const SETTINGS_SHEET = 'Settings';

const COLUMNS = [
  'Bill', 'Session', 'Title', 'Status', 'Committee',
  'Chief Sponsor(s)', 'Fiscal Impact', 'Last 3 Actions',
  'Issue Tags', 'Priority', 'Email Alerts', 'OLIS Link', 'Last Updated'
];

const COL = {};
COLUMNS.forEach(function(c, i) { COL[c] = i + 1; });

const HEADER_COLOR = '#1a5276';
const ROW_ALT_COLOR = '#eaf2f8';
const PRIORITY_COLORS = { High: '#fce8e6', Medium: '#fef7e0', Low: '#e6f4ea' };

// ── Setup ──────────────────────────────────────────────────

function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupTrackedBillsSheet(ss);
  setupSettingsSheet(ss);
  SpreadsheetApp.getUi().alert('Oregon Bill Tracker sheets are ready.');
}

function setupTrackedBillsSheet(ss) {
  let sheet = ss.getSheetByName(TRACKED_SHEET);
  if (!sheet) sheet = ss.insertSheet(TRACKED_SHEET, 0);

  if (sheet.getLastRow() === 0) {
    const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
    headerRange.setValues([COLUMNS])
      .setBackground(HEADER_COLOR)
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(10);

    sheet.setColumnWidth(COL['Bill'], 80);
    sheet.setColumnWidth(COL['Session'], 80);
    sheet.setColumnWidth(COL['Title'], 240);
    sheet.setColumnWidth(COL['Status'], 200);
    sheet.setColumnWidth(COL['Committee'], 110);
    sheet.setColumnWidth(COL['Chief Sponsor(s)'], 150);
    sheet.setColumnWidth(COL['Fiscal Impact'], 150);
    sheet.setColumnWidth(COL['Last 3 Actions'], 280);
    sheet.setColumnWidth(COL['Issue Tags'], 120);
    sheet.setColumnWidth(COL['Priority'], 80);
    sheet.setColumnWidth(COL['Email Alerts'], 180);
    sheet.setColumnWidth(COL['OLIS Link'], 110);
    sheet.setColumnWidth(COL['Last Updated'], 110);

    // Wrap text in Last 3 Actions column
    sheet.getRange(1, COL['Last 3 Actions'], sheet.getMaxRows()).setWrap(true);

    sheet.setFrozenRows(1);
    try { sheet.getRange(1, 1, 1, COLUMNS.length).createFilter(); } catch(e) {}
  }

  return sheet;
}

function setupSettingsSheet(ss) {
  let sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SETTINGS_SHEET);
  sheet.getRange('A1:B1')
    .setValues([['Setting', 'Value']])
    .setFontWeight('bold')
    .setBackground(HEADER_COLOR)
    .setFontColor('#ffffff');

  sheet.getRange('A2:B5').setValues([
    ['Organization Name', ''],
    ['Default Session', '2025R1'],
    ['Tool Version', '1.0'],
    ['API Info', 'https://www.oregonlegislature.gov/citizen_engagement/Pages/data.aspx']
  ]);

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 350);
  return sheet;
}

// ── Read ───────────────────────────────────────────────────

function getTrackedBills() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKED_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS.length).getValues();
  return data
    .map(function(row, idx) { return { row: idx + 2, data: row }; })
    .filter(function(item) { return item.data[COL['Bill'] - 1] !== ''; })
    .map(function(item) {
      const row = item.data;
      const billCell = String(row[COL['Bill'] - 1]);
      const parts = billCell.split(' ');
      return {
        row: item.row,
        bill: billCell,
        prefix: parts[0] || '',
        number: parseInt(parts[1]) || 0,
        session: row[COL['Session'] - 1],
        title: row[COL['Title'] - 1],
        status: row[COL['Status'] - 1],
        committee: row[COL['Committee'] - 1],
        sponsors: row[COL['Chief Sponsor(s)'] - 1],
        fiscalImpact: row[COL['Fiscal Impact'] - 1],
        last3Actions: row[COL['Last 3 Actions'] - 1],
        tags: row[COL['Issue Tags'] - 1],
        priority: row[COL['Priority'] - 1],
        emailAlerts: row[COL['Email Alerts'] - 1],
        olisLink: row[COL['OLIS Link'] - 1],
        lastUpdated: row[COL['Last Updated'] - 1]
      };
    });
}

function isBillTracked(session, prefix, number) {
  return getTrackedBills().some(function(b) {
    return b.session === session && b.prefix === prefix && b.number === number;
  });
}

// ── Email alerts ────────────────────────────────────────────

function addEmailAlert(session, prefix, number, email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKED_SHEET);
  if (!sheet) return { success: false, message: 'Tracked Bills sheet not found.' };

  const match = getTrackedBills().find(function(b) {
    return b.session === session && b.prefix === prefix && b.number === number;
  });
  if (!match) return { success: false, message: 'Bill is not tracked yet. Track it first.' };

  // Get existing emails, add new one (no duplicates)
  const existing = match.emailAlerts
    ? match.emailAlerts.split(',').map(function(e) { return e.trim(); }).filter(Boolean)
    : [];

  if (existing.indexOf(email) !== -1) {
    return { success: false, message: email + ' is already subscribed to this bill.' };
  }

  existing.push(email);
  sheet.getRange(match.row, COL['Email Alerts']).setValue(existing.join(', '));
  return { success: true, message: 'Subscribed ' + email + ' to alerts for ' + prefix + ' ' + number + '.' };
}

function removeEmailAlert(session, prefix, number, email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKED_SHEET);
  if (!sheet) return false;

  const match = getTrackedBills().find(function(b) {
    return b.session === session && b.prefix === prefix && b.number === number;
  });
  if (!match) return false;

  const updated = (match.emailAlerts || '')
    .split(',')
    .map(function(e) { return e.trim(); })
    .filter(function(e) { return e && e !== email; })
    .join(', ');

  sheet.getRange(match.row, COL['Email Alerts']).setValue(updated);
  return true;
}

// ── Write ──────────────────────────────────────────────────

function formatLast3Actions(actions) {
  return actions.slice(0, 3).map(function(a) {
    return a.date + ': ' + a.action;
  }).join('\n');
}

function addTrackedBill(billData) {
  const prefix = billData.MeasurePrefix;
  const number = billData.MeasureNumber;
  const session = billData.SessionKey;

  if (isBillTracked(session, prefix, number)) {
    return { success: false, message: prefix + ' ' + number + ' is already tracked.' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRACKED_SHEET);
  if (!sheet) {
    setupTrackedBillsSheet(ss);
    sheet = ss.getSheetByName(TRACKED_SHEET);
  }

  // Fetch sponsors (non-fatal)
  let sponsorStr = '';
  try {
    const sponsors = getMeasureSponsors(session, prefix, number);
    const chiefs = sponsors.filter(function(s) { return s.level === 'Chief'; });
    sponsorStr = (chiefs.length > 0 ? chiefs : sponsors).map(function(s) { return s.name; }).join(', ');
  } catch(e) {
    Logger.log('Sponsor fetch failed: ' + e.message);
  }

  // Fetch last 3 history actions (non-fatal)
  let actionsStr = '';
  try {
    const history = getMeasureHistory(session, prefix, number);
    actionsStr = formatLast3Actions(history);
  } catch(e) {
    Logger.log('History fetch failed: ' + e.message);
  }

  const olisUrl = billData.olisUrl || formatOlisUrl(session, prefix, number);
  const nextRow = sheet.getLastRow() + 1;

  const rowValues = [
    prefix + ' ' + number,
    session,
    billData.CatchLine || billData.MeasureSummary || '',
    billData.CurrentLocation || '',
    billData.CurrentCommitteeCode || '',
    sponsorStr,
    billData.FiscalImpact || '',
    actionsStr,
    '',   // Issue Tags
    '',   // Priority
    '',   // Email Alerts
    '',   // OLIS Link (set as formula below)
    new Date().toLocaleDateString('en-US')
  ];

  sheet.getRange(nextRow, 1, 1, COLUMNS.length).setValues([rowValues]);
  sheet.getRange(nextRow, COL['OLIS Link'])
    .setFormula('=HYPERLINK("' + olisUrl + '","View on OLIS")');

  if (nextRow % 2 === 0) {
    sheet.getRange(nextRow, 1, 1, COLUMNS.length).setBackground(ROW_ALT_COLOR);
  }

  return { success: true, message: prefix + ' ' + number + ' added to Tracked Bills.' };
}

function removeTrackedBill(session, prefix, number) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKED_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const match = getTrackedBills().find(function(b) {
    return b.session === session && b.prefix === prefix && b.number === number;
  });
  if (!match) return false;

  sheet.deleteRow(match.row);
  return true;
}

function updateBillRow(sheet, row, updates) {
  if (updates.status !== undefined)       sheet.getRange(row, COL['Status']).setValue(updates.status);
  if (updates.committee !== undefined)    sheet.getRange(row, COL['Committee']).setValue(updates.committee);
  if (updates.fiscalImpact !== undefined) sheet.getRange(row, COL['Fiscal Impact']).setValue(updates.fiscalImpact);
  if (updates.last3Actions !== undefined) sheet.getRange(row, COL['Last 3 Actions']).setValue(updates.last3Actions);
  if (updates.lastUpdated !== undefined)  sheet.getRange(row, COL['Last Updated']).setValue(updates.lastUpdated);

  if (updates.priority !== undefined) {
    sheet.getRange(row, COL['Priority']).setValue(updates.priority);
    const bg = PRIORITY_COLORS[updates.priority] || null;
    if (bg) sheet.getRange(row, COL['Priority']).setBackground(bg);
  }
}
