# Ziyarah — Ziyarath Travel Management

Mobile-first web app for managing expenses, budgets, itineraries and ratings for four college Ziyarath trips:

**Kerala · Tamil Nadu · Mumbai · Kashmir**

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 — deployable on Vercel
- **Backend:** Google Apps Script (Web App) — free, runs as your Google account
- **Database:** Google Sheets — one master spreadsheet + one spreadsheet per trip
- **Auth:** email + salted PBKDF2-hashed passwords (stored only in the private master sheet);
  stateless HMAC session tokens — **no Google Cloud, no OAuth, no external IdP**

> **Security model:** the Apps Script runs *as you* ("Execute as: Me"), so private spreadsheets
> stay private. Passwords are stored only as PBKDF2-HMAC-SHA256 hashes (120k iterations,
> 16-byte salt) in the master `Users` tab; plaintext passwords never touch the server or logs.
> Every request is authenticated and authorized on the backend (role + trip scope), and
> login attempts are rate-limited (5 fails → 5-minute lockout). Hiding UI buttons is never
> the only protection.

---

## 1. What you need

| Requirement | Notes |
|---|---|
| Google account | Acts as the "owner" of all spreadsheets and the backend |
| Node.js 20.9+ | `node --version` — needed to run/build the frontend |
| npm | Comes with Node.js |
| Vercel account (free) | For hosting the frontend |

---

## 2. Deploy the Google Apps Script backend

### 2.1 Create the script project

1. Open <https://script.google.com> → **New project**.
2. Rename it `Ziyarah Backend`.
3. For **every** `.gs` file in the `apps-script/` folder of this repo, create a file in the
   editor with the same name and paste its contents:
   `Config.gs`, `Sheets.gs`, `Auth.gs`, `Setup.gs`, `Expenses.gs`, `Trips.gs`, `Itinerary.gs`,
   `Ratings.gs`, `Users.gs`, `Reports.gs`, `Receipts.gs`, `Code.gs`
4. Click **Settings (gear) → Show "appsscript.json"** and replace its contents with
   `apps-script/appsscript.json` from this repo. (This sets timezone Asia/Kolkata, the V8
   runtime, and the web-app execution mode.)
5. Add the shared business rules as a file named `core.js` — paste the entire contents of
   `shared/core.js` from this repo (Apps Script loads it alongside the `.gs` files; the file
   already contains a safe CommonJS guard that Apps Script ignores). This file also contains
   the PBKDF2 password hashing used by `Auth.gs`.

### 2.2 Run the one-time setup

1. In the editor, select function **`setupAll`** and click **Run**.
2. Approve the permission prompts (spreadsheets, Drive, external requests).
3. Open **Executions** (or View → Logs) to see what was created:
   - Master spreadsheet: `Ziyarath Master - Travel Management`
   - Four trip spreadsheets: `Ziyarath Expenses - Kerala` etc., each with tabs
     `Expenses`, `TripPlan`, `Progress`, `Ratings`, `AuditLog`
   - Master tabs: `Trips`, `Users`, `Budgets`, `Categories`, `Settings`, `AuditLog`
   - Default categories and settings rows
4. `setupAll()` is **safe to re-run** — it never overwrites existing data; it only adds
   what is missing (including missing header columns such as `Password Hash`).

### 2.3 Script properties (secrets — never in the frontend)

In the Apps Script editor: **Project Settings → Script Properties** and set:

| Property | Value |
|---|---|
| `MASTER_SPREADSHEET_ID` | Already set by `setupAll()` (only re-add if you recreate the master) |

`SESSION_SECRET` and `RECEIPT_FOLDER_ID` are created automatically.

### 2.4 Create the first admin

1. In the Apps Script editor, open `Auth.gs` and run (from the function list, or paste into
   the editor):

   ```js
   createAdmin('you@example.com', 'StrongPass123')
   ```

2. Run it once, approve permissions, and the account is written to the master `Users` tab
   with a salted PBKDF2 hash. You can now sign in at `/login` with that email + password.
3. **Do not leave plaintext passwords in the script editor** — clear the function arguments
   after running, or delete the helper line.

### 2.5 Deploy as Web App

1. **Deploy → New deployment → ⚙ Web app**:
   - Description: `ziyarah-v1`
   - **Execute as: Me**
   - **Who has access: Anyone** (the anonymous HTTP endpoint; identity is still verified
     per-request via session tokens + the Users table)
2. Authorize, then copy the **Web app URL** (`…/exec`).
   This is your backend API — it goes into the *server-side* env var `ZIYARAH_API_URL`.
3. **Every time you edit backend code**, create a new deployment version
   (**Deploy → Manage deployments → ✏ → New version**).

---

## 3. Run the frontend locally

```bash
# from the project folder
npm install
copy .env.example .env.local     # Windows: copy, macOS/Linux: cp
```

Edit `.env.local`:

```
NEXT_PUBLIC_APP_NAME=Ziyarah
NEXT_PUBLIC_POLL_INTERVAL_MS=60000
ZIYARAH_API_URL=https://script.google.com/macros/s/REPLACE_ME/exec
```

> `ZIYARAH_API_URL` is read **only on the server** by the relay route
> (`src/app/api/ziyarah/route.ts`). It never appears in the browser bundle, and it
> avoids CORS issues with Apps Script.

```bash
npm run dev        # http://localhost:3000
npm test           # 47 unit tests (auth, PBKDF2, validation, budget & delay math, formatting)
npm run build      # production build (also runs TypeScript checks)
```

Sign in with the admin email + password created in step 2.4.

---

## 4. Deploy to Vercel

1. Push this folder to a GitHub repository (or import directly from the folder).
2. On <https://vercel.com> → **Add New → Project** → import the repo.
3. **Environment Variables** (Production + Preview):

   | Name | Value |
   |---|---|
   | `ZIYARAH_API_URL` | your Apps Script `/exec` URL (server-only) |
   | `NEXT_PUBLIC_APP_NAME` | `Ziyarah` |
   | `NEXT_PUBLIC_POLL_INTERVAL_MS` | `60000` |

4. Deploy. No OAuth origins or Google Cloud configuration is needed.

---

## 5. Day-to-day administration

### Add coordinators
**People (sidebar) → Add person** → name, email, a temporary password (any non-empty
password — letters, numbers, or both), role *Coordinator*, tick their trip(s). They sign in with that email and
password; ask them to change it from the key icon in the header. No invite email is sent.

### Reset a password
**People** → next to the person, **Reset password** → enter a new password (any non-empty
value). The old session is invalidated immediately
(`session_version` bump).

### Set budgets
**Trips → pick a trip → Overview → Set total budget**. Warnings appear automatically at
75% (approaching), 90% (high) and 100%+ (exceeded) — always computed from saved records.

### Configure the itinerary
**Trips → trip → Itinerary** → add stops (location, planned arrival/departure, notes) →
**Save itinerary**. Coordinators then tap **Reached** on their phone; the backend records
the server time and computes delay vs the plan (tolerance configurable in Settings).

### Review expenses
**Expenses** — filter by trip, date range, category, status; open a row to edit, void
(cancel), restore, or record a **correction with a reason**. Every change is written to the
trip's `AuditLog` tab. Voided rows keep their history and are excluded from totals.

### Reports
**Reports** — totals, category/coordinator/daily breakdowns, budget utilization, trip
comparison; **CSV export** (Excel-compatible) and **Print** (browser PDF) both respect the
active filters.

### Settings page
Categories (add), arrival tolerance, session length, receipt uploads on/off, rating
updates on/off, delay-reason requirement, and a note on account recovery.

---

## 6. Backups & restore

- **Backups:** Google Drive keeps version history for Sheets — right-click a spreadsheet →
  *Version history*. For a full backup, download each spreadsheet as `.xlsx`
  (File → Download → Microsoft Excel) monthly, or use Google Takeout.
- **Restore:** File → Import a downloaded copy into a new spreadsheet, then point the master
  `Trips` tab's **Spreadsheet ID** column at the restored file (or run
  `attachTripSpreadsheet(tripId, spreadsheetId)` in the Apps Script editor).
- Never delete the master spreadsheet without first copying its `MASTER_SPREADSHEET_ID`.

---

## 7. How the pieces fit

```
Browser (Next.js on Vercel)
   │  POST /api/ziyarah  { action, token, data }
   ▼
Next.js route handler (server-only; holds ZIYARAH_API_URL)
   │  forwards JSON
   ▼
Google Apps Script web app (/exec)
   │  verifies HMAC session → role + trip scope
   │  validates input with shared/core.js (same rules unit-tested here)
   ▼
Google Sheets (master + 4 trip spreadsheets, private)
```

- **Sessions:** stateless HMAC-SHA256 tokens (secret in Script Properties), expiry
  `session_hours` (default 12). Logout/deactivate/password-change bumps `session_version`
  → old tokens die.
- **Passwords:** PBKDF2-HMAC-SHA256, 120,000 iterations, 16-byte salt, stored in the master
`Users` tab as `pbkdf2-sha256$<iter>$<saltB64>$<hashB64>`. Policy: any non-empty password
(letters, numbers, symbols — whatever you choose).
- **Duplicates:** every expense carries a client request id; double-taps return the existing
  row instead of writing twice (checked again under a spreadsheet lock).
- **Timestamps:** submission time is generated on the server; the coordinator may pick a
  past *expense date* but can never set the submission timestamp.
- **Near-real-time:** dashboards poll every 60 s (configurable) plus refresh on focus;
  manual Refresh buttons everywhere. Apps Script has no WebSockets; polling is the
  supported strategy.
- **Receipts (optional):** photos are compressed on the phone, stored in a private Drive
  folder (`Ziyarath Receipts`) owned by you, and served back only through the authorized API.

---

## 8. Testing status

Automated tests actually executed in this repo (`npm test` → **47 passed**):

- Authorization: admin/coordinator/inactive/unknown actions, cross-trip blocking,
  scoped trip lists
- Expense validation: required fields, amount parsing/format rules, future/malformed dates,
  category allow-list, trip mismatch
- Duplicate detection by client request id
- Budget math: remaining, %, warning/high/exceeded levels, zero/unset budget (no division
  by zero), void exclusion
- Report aggregation, date/coordinator/search filters
- Arrival timing: on-time/late/early vs tolerance, overnight plans, duration formatting
- INR formatting (₹1,250, lakh grouping), Asia/Kolkata date handling
- Password hashing: PBKDF2 reference vectors vs Node `crypto`, verify/format/policy checks

Manual end-to-end checks (require your deployed backend — see §2): sign in as admin,
create a coordinator with a password, coordinator sign-in, save an expense from a phone and
confirm the row appears in the correct spreadsheet, budget warnings, void/edit totals, CSV
export, and a coordinator being blocked from another trip (backend returns `forbidden`).

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Backend URL is not configured` | Set `ZIYARAH_API_URL` in Vercel / `.env.local` and redeploy |
| `MASTER_SPREADSHEET_ID is not configured` | Run `setupAll()` once in the Apps Script editor |
| Cannot sign in on first use | Run `createAdmin('email', 'StrongPass123')` in the Apps Script editor (step 2.4) |
| Locked out after failed attempts | Wait 5 minutes, or run `resetUserPassword('email', 'NewPass123')` in the editor |
| Password rejected as empty | Any non-empty password is accepted |
| Coordinator can't see a trip | Assign the trip on the **People** page; scope is checked server-side |
| `config_error: … missing the "X" tab` | Re-run `setupAll()` — it only adds missing tabs |
| Edits to backend not taking effect | Create a **new deployment version** (Deploy → Manage deployments) |
| Receipt upload disabled | Settings → toggles, or `receipts_enabled` in master Settings tab |
| CORS / network errors in browser | Always go through `/api/ziyarah`; never call the `/exec` URL from client code |
| Rate/perf concerns | Sheets reads are cached ~45–60 s server-side; avoid lowering the poll interval below 60 s |

---

## 10. Known platform limitations (and what we do instead)

- **No WebSockets in Apps Script** → polling + manual refresh (§7).
- **No CORS headers from Apps Script** → same-origin Next.js relay route.
- **Sheets is not a real database** → header-mapped rows, script-lock on all writes,
  server-computed totals, no row numbers as IDs, 60 s server caches.
- **True .xlsx/PDF export** would need a library or extra backend step; we ship correct
  UTF-8 CSV (opens natively in Excel) and a clean print layout (browser → PDF) instead of
  shipping files with the wrong format.
- **Receipt image size** is capped (~1.5 MB after on-device compression) to stay within
  Apps Script request limits.
- **Password reset email** would need an SMTP/Gmail trigger; we ship an admin-driven reset
  (`resetUserPassword` in the editor, or the **Reset password** button on the People page)
  instead of shipping a half-working email flow.
