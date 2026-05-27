# Oregon Automated Bill Tracker

A Google Sheets add-on for nonprofits and advocacy organizations to track Oregon legislation in real time — no coding required.

Built on the [Oregon Legislative Information System (OLIS) OData API](https://www.oregonlegislature.gov/citizen_engagement/Pages/data.aspx).

---

## Features

- **Search bills** by keyword or bill number (e.g. `HB 4111`, `housing`, `mental health`)
- **Filter** by session, chamber (House/Senate), and bill type (HB, SB, HCR, etc.)
- **Track bills** directly to a structured Google Sheet with key fields auto-populated
- **Last 3 Actions** — see the most recent legislative history for every tracked bill
- **One-click refresh** — pull the latest status for all tracked bills from OLIS
- **Email alerts** — subscribe any email address to a bill and get a daily digest when its status changes
- **Full legislative history** — expand any bill in the sidebar to view its complete action history

---

## Setup

### Option A — Use a copy of the template spreadsheet *(recommended for most orgs)*

1. Make a copy of the template Google Sheet *(link coming soon)*
2. Open the sheet → the **Oregon Bill Tracker** menu will appear automatically
3. Click **Oregon Bill Tracker → Initialize / Reset Sheets** if prompted

### Option B — Deploy from source using clasp

> Requires [Node.js](https://nodejs.org) and a Google account.

```bash
# Install the Google Apps Script CLI
npm install -g @google/clasp

# Log in to your Google account
clasp login

# Clone this repo
git clone https://github.com/JazveerK/OregonAutomatedBillTracker.git
cd OregonAutomatedBillTracker

# Create a new Apps Script project bound to a new Google Sheet
clasp create --title "Oregon Bill Tracker" --type sheets

# Push the code
clasp push

# Open the script editor and run onInstall to initialize
clasp open-script
```

In the Apps Script editor: select `onInstall` from the function dropdown → click **Run** → approve permissions.

---

## How to use

### Searching for bills
1. Open **Oregon Bill Tracker → Open Bill Tracker** from the menu
2. Select a legislative session
3. Enter a keyword (e.g. `housing`) or a specific bill number (e.g. `HB 4111`)
4. Click **Search Bills**

### Tracking a bill
1. Click any search result to expand it
2. Click **+ Track** — the bill is added to your **Tracked Bills** sheet with:
   - Current status and committee
   - Chief sponsor(s)
   - Fiscal impact
   - Last 3 legislative actions

### Setting up email alerts
1. After tracking a bill, an email field appears in the expanded card
2. Enter an email address and click **Subscribe**
3. Go to **Oregon Bill Tracker → Enable Daily Email Alerts**
4. Each morning at 8am, the tracker checks for status changes and sends a digest email to all subscribers

> Multiple people can subscribe to the same bill — each gets their own digest. Emails are stored in the **Email Alerts** column and can be edited directly in the sheet.

### Refreshing tracked bills
Click **Oregon Bill Tracker → Refresh All Tracked Bills** to pull the latest status, committee, and last 3 actions for every bill in your sheet.

---

## Sheet structure

| Column | Description |
|---|---|
| Bill | Bill number (e.g. HB 4111) |
| Session | Legislative session (e.g. 2026R1) |
| Title | Bill catch line / short title |
| Status | Current location in the legislative process |
| Committee | Current committee code |
| Chief Sponsor(s) | Primary sponsor(s) |
| Fiscal Impact | Fiscal impact statement |
| Last 3 Actions | Three most recent legislative actions with dates |
| Issue Tags | Custom tags for your org (e.g. Housing, Healthcare) |
| Priority | High / Medium / Low — set by your team |
| Email Alerts | Comma-separated emails subscribed to this bill |
| OLIS Link | Direct link to the bill on OLIS |
| Last Updated | Date the row was last refreshed |

---

## Data source

All legislative data comes from the **Oregon Legislative Information System (OLIS) OData API** — a free, public API maintained by the Oregon Legislature.

- API base: `https://api.oregonlegislature.gov/odata/odataservice.svc/`
- Docs: [oregonlegislature.gov/citizen_engagement/Pages/data.aspx](https://www.oregonlegislature.gov/citizen_engagement/Pages/data.aspx)
- OLIS portal: [olis.oregonlegislature.gov](https://olis.oregonlegislature.gov/liz/)

---

## File structure

```
OregonAutomatedBillTracker/
├── appsscript.json     # Apps Script manifest
├── Code.gs             # Menu, UI handlers, email trigger
├── OregonAPI.gs        # OLIS OData API wrapper
├── SheetManager.gs     # Sheet read/write operations
├── Sidebar.html        # Sidebar search UI
└── Settings.html       # Settings dialog
```

---

## Contributing

Pull requests welcome. This tool is designed for Oregon-based nonprofits and advocacy organizations — if you work in civic tech or policy, we'd love your input.

Please review the [OLIS Data Acceptable Use Agreement](https://www.oregonlegislature.gov/citizen_engagement/Documents/OLODataAcceptableUseAgreement.pdf) before deploying.

---

## License

MIT
