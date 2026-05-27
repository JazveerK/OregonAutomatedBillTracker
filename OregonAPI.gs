// ============================================================
// Oregon Bill Tracker — OLIS OData API wrapper
// Docs: https://www.oregonlegislature.gov/citizen_engagement/Pages/data.aspx
// ============================================================

const OLIS_BASE = 'https://api.oregonlegislature.gov/odata/odataservice.svc/';
const OLIS_PORTAL = 'https://olis.oregonlegislature.gov/liz/';

// Measure prefix → bill type label
const PREFIX_LABELS = {
  HB: 'House Bill', SB: 'Senate Bill',
  HCR: 'House Concurrent Resolution', SCR: 'Senate Concurrent Resolution',
  HJR: 'House Joint Resolution', SJR: 'Senate Joint Resolution',
  HJM: 'House Joint Memorial', SJM: 'Senate Joint Memorial',
  HM: 'House Memorial', SM: 'Senate Memorial'
};

// House vs Senate prefix sets for chamber filtering
const HOUSE_PREFIXES = ['HB', 'HCR', 'HJR', 'HJM', 'HM'];
const SENATE_PREFIXES = ['SB', 'SCR', 'SJR', 'SJM', 'SM'];

function oDataFetch(url) {
  const options = {
    method: 'get',
    headers: { Accept: 'application/json' },
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('OLIS API error ' + code + ': ' + response.getContentText().substring(0, 300));
  }
  return JSON.parse(response.getContentText());
}

// ── Sessions ───────────────────────────────────────────────

function getSessions() {
  const data = oDataFetch(OLIS_BASE + 'LegislativeSessions?$format=json');
  return (data.value || [])
    .map(s => ({ key: s.SessionKey, name: formatSessionName(s.SessionKey) }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function formatSessionName(sessionKey) {
  const year = sessionKey.substring(0, 4);
  const suffix = sessionKey.substring(4);
  const labels = {
    R1: 'Regular Session',
    I1: 'Interim',
    S1: '1st Special Session',
    S2: '2nd Special Session',
    S3: '3rd Special Session',
    S4: '4th Special Session'
  };
  return year + ' ' + (labels[suffix] || suffix);
}

// ── Measures ───────────────────────────────────────────────

// Matches: "HB4111", "HB 4111", "hb 4111", or plain "4111" (when a type filter is set)
var BILL_NUMBER_RE = /^([A-Za-z]+)\s*(\d+)$|^(\d+)$/;

function searchMeasures(session, keyword, chamber, measureType) {
  const filters = ["SessionKey eq '" + session + "'"];
  const kw = keyword ? keyword.trim() : '';

  // Direct bill number lookup — much faster and more precise
  const billMatch = kw.match(BILL_NUMBER_RE);
  if (billMatch) {
    const detectedPrefix = billMatch[1] ? billMatch[1].toUpperCase() : null;
    const detectedNumber = parseInt(billMatch[2] || billMatch[3]);

    const prefix = detectedPrefix || (measureType !== 'All' ? measureType : null);
    if (prefix) {
      filters.push("MeasurePrefix eq '" + prefix + "'");
    } else if (chamber && chamber !== 'All') {
      const prefixes = chamber === 'House' ? HOUSE_PREFIXES : SENATE_PREFIXES;
      filters.push('(' + prefixes.map(p => "MeasurePrefix eq '" + p + "'").join(' or ') + ')');
    }
    filters.push('MeasureNumber eq ' + detectedNumber);

    const url = OLIS_BASE + 'Measures?$filter=' +
      encodeURIComponent(filters.join(' and ')) + '&$format=json';
    const data = oDataFetch(url);
    return (data.value || []).map(enrichMeasure);
  }

  // Keyword search against title/summary text
  if (kw) {
    const escaped = kw.toLowerCase().replace(/'/g, "''");
    filters.push(
      "(substringof('" + escaped + "', tolower(CatchLine)) or substringof('" + escaped + "', tolower(MeasureSummary)))"
    );
  }

  if (measureType && measureType !== 'All') {
    filters.push("MeasurePrefix eq '" + measureType + "'");
  } else if (chamber && chamber !== 'All') {
    const prefixes = chamber === 'House' ? HOUSE_PREFIXES : SENATE_PREFIXES;
    filters.push('(' + prefixes.map(p => "MeasurePrefix eq '" + p + "'").join(' or ') + ')');
  }

  const url = OLIS_BASE + 'Measures?$filter=' +
    encodeURIComponent(filters.join(' and ')) +
    '&$top=100&$orderby=MeasureNumber&$format=json';

  const data = oDataFetch(url);
  return (data.value || []).map(enrichMeasure);
}

function getMeasure(session, prefix, number) {
  const filter = "SessionKey eq '" + session +
    "' and MeasurePrefix eq '" + prefix +
    "' and MeasureNumber eq " + number;
  const url = OLIS_BASE + 'Measures?$filter=' + encodeURIComponent(filter) + '&$format=json';
  const data = oDataFetch(url);
  const measures = data.value || [];
  return measures.length > 0 ? enrichMeasure(measures[0]) : null;
}

function enrichMeasure(m) {
  return Object.assign({}, m, {
    displayName: m.MeasurePrefix + ' ' + m.MeasureNumber,
    billTypeFull: PREFIX_LABELS[m.MeasurePrefix] || m.PrefixMeaning || m.MeasurePrefix,
    olisUrl: formatOlisUrl(m.SessionKey, m.MeasurePrefix, m.MeasureNumber)
  });
}

// ── History ────────────────────────────────────────────────

function getMeasureHistory(session, prefix, number) {
  const filter = "SessionKey eq '" + session +
    "' and MeasurePrefix eq '" + prefix +
    "' and MeasureNumber eq " + number;
  const url = OLIS_BASE + 'MeasureHistoryActions?$filter=' +
    encodeURIComponent(filter) + '&$orderby=ActionDate desc&$format=json';
  const data = oDataFetch(url);
  return (data.value || []).map(h => ({
    date: h.ActionDate ? new Date(h.ActionDate).toLocaleDateString('en-US') : '',
    chamber: h.Chamber === 'H' ? 'House' : h.Chamber === 'S' ? 'Senate' : (h.Chamber || ''),
    action: h.ActionText || ''
  }));
}

// ── Sponsors ───────────────────────────────────────────────

function getMeasureSponsors(session, prefix, number) {
  const filter = "SessionKey eq '" + session +
    "' and MeasurePrefix eq '" + prefix +
    "' and MeasureNumber eq " + number;
  const url = OLIS_BASE + 'MeasureSponsors?$filter=' +
    encodeURIComponent(filter) + '&$orderby=SponsorLevel,PrintOrder&$format=json';
  const data = oDataFetch(url);
  // Note: API has a typo — field is "LegislatoreCode" not "LegislatorCode"
  return (data.value || [])
    .filter(s => s.LegislatoreCode)
    .map(s => ({
      name: s.LegislatoreCode,
      level: s.SponsorLevel,
      type: s.SponsorType
    }));
}

// ── Helpers ────────────────────────────────────────────────

function formatOlisUrl(session, prefix, number) {
  return OLIS_PORTAL + session + '/Measures/Overview/' + prefix + number;
}
