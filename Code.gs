// ============================================================
// Oregon Bill Tracker — Entry point & UI handlers
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Oregon Bill Tracker')
    .addItem('Open Bill Tracker', 'showSidebar')
    .addSeparator()
    .addItem('Refresh All Tracked Bills', 'refreshAllTrackedBills')
    .addSeparator()
    .addItem('Enable Daily Email Alerts', 'enableDailyAlerts')
    .addItem('Disable Email Alerts', 'disableDailyAlerts')
    .addSeparator()
    .addItem('Initialize / Reset Sheets', 'initializeSheets')
    .addItem('Settings', 'openSettings')
    .addToUi();
}

function onInstall() {
  onOpen();
  initializeSheets();
}

// ── Sidebar & dialogs ──────────────────────────────────────

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Oregon Bill Tracker')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

function openSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Settings')
    .setWidth(480)
    .setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'Oregon Bill Tracker — Settings');
}

// ── Functions called by sidebar via google.script.run ──────

function getSessionsForUI() {
  return getSessions();
}

function searchBillsForUI(session, keyword, chamber, measureType) {
  return searchMeasures(session, keyword, chamber, measureType);
}

function trackBillFromUI(billData) {
  return addTrackedBill(billData);
}

function untrackBillFromUI(session, prefix, number) {
  return removeTrackedBill(session, prefix, number);
}

function getBillHistoryForUI(session, prefix, number) {
  return getMeasureHistory(session, prefix, number);
}

function addEmailAlertForUI(session, prefix, number, email) {
  return addEmailAlert(session, prefix, number, email);
}

function getSettingsForUI() {
  const props = PropertiesService.getUserProperties();
  return {
    defaultSession: props.getProperty('DEFAULT_SESSION') || '2025R1',
    orgName: props.getProperty('ORG_NAME') || '',
    alertsEnabled: !!getExistingTrigger_()
  };
}

function saveSettingsFromUI(settings) {
  const props = PropertiesService.getUserProperties();
  if (settings.defaultSession) props.setProperty('DEFAULT_SESSION', settings.defaultSession);
  if (settings.orgName !== undefined) props.setProperty('ORG_NAME', settings.orgName);
  return true;
}

// ── Refresh ────────────────────────────────────────────────

function refreshAllTrackedBills() {
  const bills = getTrackedBills();
  if (bills.length === 0) {
    SpreadsheetApp.getUi().alert('No bills are currently tracked. Use the sidebar to search and track bills.');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKED_SHEET);
  let updated = 0;
  let errors = 0;

  bills.forEach(function(bill) {
    try {
      const fresh = getMeasure(bill.session, bill.prefix, bill.number);
      if (fresh) {
        const history = getMeasureHistory(bill.session, bill.prefix, bill.number);
        updateBillRow(sheet, bill.row, {
          status: fresh.CurrentLocation || '',
          committee: fresh.CurrentCommitteeCode || '',
          fiscalImpact: fresh.FiscalImpact || '',
          last3Actions: formatLast3Actions(history),
          lastUpdated: new Date().toLocaleDateString('en-US')
        });
        updated++;
      }
    } catch(e) {
      errors++;
      Logger.log('Refresh error for ' + bill.prefix + ' ' + bill.number + ': ' + e.message);
    }
  });

  const msg = 'Updated ' + updated + ' of ' + bills.length + ' tracked bills.' +
    (errors > 0 ? ' (' + errors + ' failed — see Logs.)' : '');
  SpreadsheetApp.getUi().alert(msg);
}

// ── Email alert trigger ────────────────────────────────────

function enableDailyAlerts() {
  if (getExistingTrigger_()) {
    SpreadsheetApp.getUi().alert('Daily alerts are already enabled.');
    return;
  }
  ScriptApp.newTrigger('checkBillAlerts')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  SpreadsheetApp.getUi().alert('Daily email alerts enabled. Bills will be checked each morning at 8am.');
}

function disableDailyAlerts() {
  const trigger = getExistingTrigger_();
  if (!trigger) {
    SpreadsheetApp.getUi().alert('No alert trigger is currently active.');
    return;
  }
  ScriptApp.deleteTrigger(trigger);
  SpreadsheetApp.getUi().alert('Email alerts disabled.');
}

function getExistingTrigger_() {
  return ScriptApp.getProjectTriggers().find(function(t) {
    return t.getHandlerFunction() === 'checkBillAlerts';
  }) || null;
}

// Runs daily via trigger — checks for status changes and emails subscribers
function checkBillAlerts() {
  const bills = getTrackedBills();
  if (bills.length === 0) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKED_SHEET);

  // Map: email → list of change objects
  const changesByEmail = {};

  bills.forEach(function(bill) {
    try {
      const fresh = getMeasure(bill.session, bill.prefix, bill.number);
      if (!fresh) return;

      const statusChanged = fresh.CurrentLocation && fresh.CurrentLocation !== bill.status;
      if (!statusChanged) return;

      // Fetch updated history
      const history = getMeasureHistory(bill.session, bill.prefix, bill.number);

      // Update sheet
      updateBillRow(sheet, bill.row, {
        status: fresh.CurrentLocation,
        committee: fresh.CurrentCommitteeCode || '',
        last3Actions: formatLast3Actions(history),
        lastUpdated: new Date().toLocaleDateString('en-US')
      });

      // Collect emails to notify
      if (!bill.emailAlerts) return;
      const emails = bill.emailAlerts.split(',').map(function(e) { return e.trim(); }).filter(Boolean);

      const change = {
        bill: bill.bill,
        session: bill.session,
        title: bill.title,
        oldStatus: bill.status,
        newStatus: fresh.CurrentLocation,
        last3Actions: history.slice(0, 3),
        olisUrl: fresh.olisUrl
      };

      emails.forEach(function(email) {
        if (!changesByEmail[email]) changesByEmail[email] = [];
        changesByEmail[email].push(change);
      });

    } catch(e) {
      Logger.log('Alert check error for ' + bill.bill + ': ' + e.message);
    }
  });

  // Send one digest email per subscriber
  Object.keys(changesByEmail).forEach(function(email) {
    sendAlertDigest_(email, changesByEmail[email]);
  });
}

function sendAlertDigest_(email, changes) {
  const orgName = PropertiesService.getUserProperties().getProperty('ORG_NAME') || 'Oregon Bill Tracker';
  const count = changes.length;
  const subject = '[' + orgName + '] ' + count + ' Oregon bill update' + (count !== 1 ? 's' : '');

  const bodyLines = [
    'Hello,',
    '',
    count + ' bill' + (count !== 1 ? 's' : '') + ' you are tracking in the Oregon Legislature ha' + (count !== 1 ? 've' : 's') + ' a new status.',
    ''
  ];

  changes.forEach(function(c) {
    bodyLines.push('────────────────────────────────');
    bodyLines.push(c.bill + ' — ' + c.title);
    bodyLines.push('Session: ' + formatSessionName(c.session));
    bodyLines.push('');
    bodyLines.push('Status change:');
    bodyLines.push('  Was: ' + c.oldStatus);
    bodyLines.push('  Now: ' + c.newStatus);
    if (c.last3Actions && c.last3Actions.length > 0) {
      bodyLines.push('');
      bodyLines.push('Recent actions:');
      c.last3Actions.forEach(function(a) {
        bodyLines.push('  • ' + a.date + ': ' + a.action);
      });
    }
    bodyLines.push('');
    bodyLines.push('View on OLIS: ' + c.olisUrl);
    bodyLines.push('');
  });

  bodyLines.push('────────────────────────────────');
  bodyLines.push('');
  bodyLines.push('To unsubscribe from a specific bill, remove your email from the');
  bodyLines.push('"Email Alerts" column in your Oregon Bill Tracker spreadsheet.');

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: bodyLines.join('\n')
    });
  } catch(e) {
    Logger.log('Failed to send alert to ' + email + ': ' + e.message);
  }
}
