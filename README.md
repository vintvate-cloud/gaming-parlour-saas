# Gaming Parlour - Station Management System

A full rebuild of your gaming zone management app: login-based access,
audit trails, a rule-based pricing engine with minimum rates and grace
periods, full per-transaction history, and reconciliation views for cash
and UPI.

## What's inside

```
gaming-parlour/
├── backend/      Node.js + Express API
└── frontend/     React (Vite) + Tailwind UI
```

The backend stores data through a swappable adapter:
- **`mongo`** (recommended for deployment) — MongoDB Atlas free tier. No
  Service Account setup, just a connection string. Handles multiple
  employees writing concurrently far better than a Sheet or local file.
- **`local`** (default for local dev) — a JSON file on disk. Zero setup.
- **`sheets`** — your own Google Sheet, via a Service Account, if you
  still want that later.

---

## 1. Running it on your own computer

> **If you're updating from an earlier version**: run `npm install` again
> in `backend/` (picks up the `mongodb` driver), and run `npm run seed`
> again if you want the latest station layout - it only adds what's
> missing, so it's safe to re-run on an existing database.

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run seed     # creates the Owner login + all game types/stations/rates
npm run dev
```

The seed script prints your starting Owner login:
```
username: owner
password: owner123
```
**Change this password (via the Users page, once logged in) before real use.**

The backend runs on `http://localhost:5000`.

### Frontend

In a second terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`, log in with the owner credentials above.

---

## 2. Deploying today (MongoDB Atlas + Render + Vercel)

> **If you tried this before and got "Cannot GET /" or owner login
> failed**: that was a real gap in the app, now fixed. Render's free tier
> doesn't give shell access, so the old instruction to "run `npm run seed`
> via a Render shell" was actually impossible to follow - which meant the
> database stayed empty and the owner login never existed. The backend
> now **seeds itself automatically the first time it starts up** if the
> database is empty, so this can't happen again. Pull the latest code and
> redeploy (steps below) and it'll work without any manual seeding step.

### Step 1: Upload the code to GitHub

If this is your first time pushing this project:

1. Create a new repository on [github.com](https://github.com/new) (keep it private if you'd like - both Render and Vercel can deploy from private repos).
2. On your computer, inside the unzipped `gaming-parlour` folder:
   ```bash
   git init
   git add .
   git commit -m "Gaming Parlour app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```
   (GitHub will show you these exact commands, pre-filled with your repo's
   URL, right after you create the empty repository - you can copy them
   from there instead of typing the above by hand.)

If you already have this pushed and are **updating** to this newer
version: replace the files in your existing project folder with the ones
from this download, then:
```bash
git add .
git commit -m "Bug fixes and deployment fixes"
git push
```
Render and Vercel will both pick up the new commit and redeploy
automatically within a minute or two - no need to touch their dashboards
for an update like this.

### Step 2: Database - MongoDB Atlas (5 min)

1. Go to mongodb.com/cloud/atlas, sign up free, create a free (M0) cluster.
2. **Database Access** (left sidebar) - add a database user with a password (write these down).
3. **Network Access** (left sidebar) - add IP address - allow access from anywhere (0.0.0.0/0). This is fine here since the connection string's password is the real secret, not the IP restriction.
4. Back on the cluster page, click **Connect** - **Drivers** - copy the connection string. It looks like:
   `mongodb+srv://yourusername:<password>@cluster0.xxxxx.mongodb.net/`
   Replace `<password>` with the actual password from step 2.

### Step 3: Backend - Render (5 min)

1. [render.com](https://render.com) - **New** - **Web Service** - connect your GitHub account and select the repo from Step 1.
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add these environment variables (Render's "Environment" tab):
   ```
   DB_PROVIDER=mongo
   MONGODB_URI=<the connection string from Step 2>
   JWT_SECRET=<any long random string - e.g. mash your keyboard>
   CORS_ORIGIN=*
   ```
6. Deploy. Watch the **Logs** tab as it starts up - you should see lines
   like `DB_PROVIDER: mongo`, `MONGODB_URI: set`, and then `No users
   found - running first-time setup (seeding)...` followed by `Gaming
   Parlour backend running on port ...`. If something's wrong with your
   connection string, the logs will say so clearly instead of just
   hanging or crashing silently.
7. Once it's live, visit your Render URL directly in a browser (e.g.
   `https://your-app.onrender.com`) - you should see a small JSON message
   confirming the API is running, not a "Cannot GET /" error.

### Step 4: Frontend - Vercel (5 min)

1. [vercel.com](https://vercel.com) - **New Project** - same GitHub repo.
2. Root Directory: `frontend`
3. Framework Preset: Vite (should auto-detect)
4. Environment variable: `VITE_API_URL` = your Render URL from Step 3 (no trailing slash needed, but it's handled either way now).
5. Deploy.

### Step 5: Tighten CORS

Go back to Render's environment variables and change `CORS_ORIGIN` from
`*` to your actual Vercel URL (e.g. `https://your-app.vercel.app`), so
only your frontend can call the API. Save - Render will redeploy
automatically.

### Step 6: Log in

Visit your Vercel URL. Log in with:
```
username: owner
password: owner123
```
**Change this password immediately** (click your name in the top-right
corner - Change Password) - this default is in the README, so anyone who
finds this project could guess it otherwise.

This whole setup is genuinely free at the scale of one gaming parlour
(MongoDB Atlas M0, Render's free web service tier, Vercel's free tier all
comfortably cover this). One caveat: Render's free tier sleeps after
inactivity and takes a few seconds to wake on the first request of the
day - fine for testing, worth a paid tier later if that wait bothers you
in production.

---

## 3. How the two roles work

- **Owner** - full access: Dashboard, Pending Payments, Analytics,
  History, Settings, Users.
- **Employee** - Dashboard and Pending Payments only (start/update/end
  sessions, mark payments collected).

Everyone who's logged in sees the same live data - the Dashboard polls
every 15 seconds, so the owner and every employee, on any device, see
roughly-live station status simultaneously. There's no separate "owner
view" of the floor; it's the same screen for everyone, just with more
pages unlocked for the owner.

Create employee logins from the **Users** page once logged in as Owner.

---

## 4. The pricing engine

Every game type bills according to one of three rule families, fully
editable in **Settings -> Game Types & Rates**:

**Player-tiered with minimum** (PS5, Gaming Room): rate depends on player
count; a 1-hour minimum applies unless switched off. If players change
mid-session, the minimum becomes the highest rate touched at any point.

**Flat fee tiers + overflow** (VR, Car Simulator, Pool Table): a ladder of
flat fees up to a duration boundary, then per-minute billing past the
last tier.

**Simple hourly** (PC Gaming): flat hourly rate, per-minute overflow past
the grace boundary.

**Grace period** (editable in Settings -> General, default 5 min) is the
buffer before the next tier kicks in. When it saves the customer money,
that shows up as an explicit "Grace period" line - never silently folded
into the total.

**Round down to nearest ₹10** - a switch on the End Session screen,
applied after any manual discount. ₹187 becomes ₹180. The ₹7 difference
shows as its own "Round-down" line on the summary, the receipt, and in
History/Analytics - it's never an exception (it's routine, not an
override) but it's always visible.

**Minimum-rate exception switch** - turns off all tier/minimum logic in
favor of pure per-minute billing, for near-closing-time pricing. Always
requires a typed remark and is flagged as an exception.

---

## 5. Tracking who did what, and what changed

Every session keeps a full timeline: who started it, every station and/or
player-count change (tagged as "screen changed", "players changed", or
"both" - whichever actually happened), and who ended it, with the rate
before and after each change. Click any transaction in **History** to see
this full timeline, including every rate applied, every grace/discount/
round-down amount, and the payment method.

`startedBy` and `endedBy` are recorded separately on the session, since
the person who starts a session is often not the person who ends it.

This same "what changed" tagging drives the color-coding everywhere a
multi-station visit shows up:
- **History**: grouped into one card per visit, bordered in purple
  (screen changed), teal (players changed), or orange (both).
- **XLSX exports**: the same rows get the same background colors,
  directly in the spreadsheet, so you can cross-check against camera
  footage at day's end.
- **Receipt**: one line per billing group (not per raw segment), so a
  multi-station visit still reads as a clean, short itemized list.

---

## 6. The End Session flow

1. **Bill breakdown** shown first - every billing group, duration,
   amount, and any grace-period discount line.
2. **End time correction** (optional) - HH:MM picker with +/-5 min buttons.
3. **Apply minimum rate** switch (default on).
4. **Apply discount** switch (default off) - by ₹ amount or by minutes,
   with a required remark.
5. **Round down to nearest ₹10** switch.
6. **Payment method** - Cash, UPI, or Pending. Clicking any of them
   finalizes the session and shows the receipt.

---

## 7. Classy receipts

The receipt (in-app and PDF) now looks like an actual receipt: a small
serif letterhead, a monospace itemized ledger with amounts aligned in a
column, restrained color used only for the total. Per your note, a
pending payment is never printed on the receipt - that status lives in
the Pending Payments page, not on a document you'd hand to a customer.

The PDF is still sized like an 80mm thermal receipt (narrow, line-based),
which keeps it easy to adapt later for WhatsApp attachment or an actual
thermal printer.

---

## 8. Payment Pending tracking

Choosing "Pending" on End Session puts the session on the Pending
Payments page (visible to both roles), with a running total and one-tap
Cash/UPI buttons to mark it collected. Auto-refreshes every 20 seconds.

---

## 9. Analytics: reconciliation and the station timeline

**Payment Reconciliation** - three cards (Cash, UPI, Pending) with the
total and transaction count for each, click through to see exactly which
transactions make up that total. Built for the moment the owner is about
to physically collect cash or check the UPI account.

**Game type breakdown** - income/sessions/duration per game type, each
expandable to show the individual stations used within it.

**Station Timeline** - a Gantt-style chart for any chosen day, one row
per station, showing busy vs. free across a configurable window (default
8 AM-2 AM, editable in Settings -> General). Busy bars are colored by what
happened during that visit (plain blue for a simple session, purple/teal/
orange for screen/player/both changes, matching History). Hover any bar
for the customer, duration, rate, and change details.

---

## 10. Dashboard, organized by game type

Stations are grouped into sections by game type, each with an "X/Y in
use" count - useful with 8 PS5 screens and 5 PCs to scan through. Time
spent never resets to zero when a customer changes stations or player
count; it's tracked cumulatively across the whole visit.

---

## 11. Mobile-friendly layout

Hamburger nav below desktop width, single-column grids on narrow screens,
wrapping filter bars, and a simple HH:MM time editor with large tap
targets instead of a fiddly date-time picker.

---

## 12. Editable everything

Rate cards, tiers, overflow rates, grace period, and the timeline chart's
business-hours window are all editable in Settings, with no code changes
needed. New game types can be added choosing any of the three billing
families.

---

## 13. The manual time-edit "exception" system

Employees can backdate a start time or correct an end time directly.
Whenever a typed time differs from the system clock by more than a
minute, the session is flagged (isException: true) with a note on what
was overridden; the original system time is preserved separately. These
flags show up on the Dashboard card, Update modal, History, and the
transaction detail timeline. A full Audit Log runs in the background too
(GET /api/audit-log).

---

## 14. Switching to Google Sheets instead of MongoDB

If you'd rather use a Sheet than MongoDB after all:

1. Create a Google Cloud Service Account, enable the Sheets API, download
   the JSON key (Google Cloud Console -> Credentials -> Service Account -> Keys).
2. Create a Sheet, share it with the Service Account's email (Editor access).
3. Copy the Sheet ID from its URL.
4. Set DB_PROVIDER=sheets, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in your .env.
5. Restart, then run npm run seed once against the new Sheet.

No other code changes are needed - every route talks to the data layer
through the same interface regardless of which adapter is active.

---

## 15. A few things worth knowing

- **Exports are XLSX, not CSV**, so same-visit rows can carry real cell
  background colors (CSV can't represent that).
- **Round-down and discount are both attributed to the last billing group**
  of a multi-station visit in History/Analytics, so row totals always sum
  to exactly what was actually charged.
- **Rate cards seeded**: PS5 (₹100/150/200/250 for 1-4p), Gaming Room
  (₹150/200/250/300), PC Gaming (₹100/hr), VR (₹100@15min/₹200@30min/
  ₹300@60min), Car Simulator (₹200@30min/₹300@60min), Pool Table (₹100
  flat@40min then ₹150/hr overflow) - all editable in Settings afterward.

---

## 16. This round's fixes and additions

**Two real bugs found and fixed during your testing:**

1. **Analytics showed no amounts at all.** Two compounding causes: (a) the
   date filter used `toISOString()`, which silently shows the *wrong*
   calendar date for anyone in India for roughly 5.5 hours a day (midnight
   to 5:30 AM IST) - fixed by switching every date helper to local time,
   and by making the backend's date-range filtering explicitly IST-aware
   regardless of what timezone the server itself runs in (since you
   confirmed the business always operates in IST); (b) a missing field on
   billing groups meant per-station income inside each game-type card
   couldn't be computed at all.
2. **XLSX showed "Invalid Date" for Start Time.** Same missing field as
   above - billing groups never carried their underlying segment data, so
   History/exports/the receipt had no way to know when a group actually
   started or ended. Fixed at the source (`pricingEngine.js`), which also
   fixed the Analytics bug.

**The big one - session time freezing on End Session.** Previously, the
bill kept growing for every second an employee spent deciding on a
discount, because the system re-derived "now" on every preview call and
again on final submit. Now the moment "End Session" is clicked, that exact
timestamp is captured client-side once and reused for every preview and
the final commit - billing reflects when the employee clicked the button,
not whenever they finish clicking through the discount screen. The
existing "this session ended earlier" override still works exactly as
before and is still flagged as an exception; just fumbling with the UI no
longer is.

**Other changes:**
- Discount reason is now optional (only the minimum-rate-off switch still
  requires a typed remark).
- Round-down now has a Settings toggle (**Settings → General**) for
  whether it defaults on or off when the End Session screen opens.
- Station and player-count pickers are now direct-tap buttons instead of
  dropdowns, everywhere they appear.
- The receipt's close button is significantly larger.
- **Dashboard card size** is configurable (**Settings → General →
  Dashboard Card Size**): Compact (default) drops customer names and
  shortens station names ("PS5 Screen 1" → "S1") to fit far more stations
  on one screen, especially on mobile; Comfortable shows the original
  fuller card.
- **Branding**: business name, app subtitle, and a logo (uploaded as an
  image, stored as base64 - no separate file hosting needed) are all
  editable in **Settings → General → Branding**, and now show on the
  Navbar, Login screen, and both the in-app and PDF receipts.
- **Download filenames** are now descriptive: History/Analytics exports
  include the filtered date range and the moment you downloaded them
  (`history_2026-06-27_to_2026-06-27_downloaded-2026-06-28-1432.xlsx`);
  receipts include the game type(s) and the visit's start/end time
  (`receipt_PS5_2026-06-27_1430-1545.pdf`).

---

## 17. This round's fixes

**The grace period bug (confirmed and fixed).** Your 64-minute, ₹211
example was real: when a session had a player-count change mid-visit
(even briefly), the pricing engine was comparing the time-weighted blend
against the 1-hour floor and taking whichever was *higher* - which is
backwards. Within the grace window, the bill should always be the flat
floor, full stop, regardless of how the blend works out. Fixed, and
re-verified against your exact numbers (a session that blends to ₹210.83
across two player counts now correctly bills the flat ₹250 floor, not a
higher blended figure).

**Deployment fixes.** The "Cannot GET /" and broken owner login were both
real gaps: there was no root route at all, and - more importantly -
Render's free tier doesn't give shell access, so the old instruction to
manually run `npm run seed` was never actually achievable, which is
almost certainly why your login failed. The backend now seeds itself
automatically on first startup if the database is empty, added a proper
root route, a Vercel SPA-routing config (without it, refreshing on any
page other than the homepage 404s), and startup logging that tells you
in plain language exactly what's misconfigured if something's still
wrong. Full updated step-by-step deploy instructions are in section 2.

**Other changes:**
- Round-down is purely a Settings default now - no per-session switch in
  End Session (the live total still reflects it, just nothing to toggle).
- Remarks on the End Session screen are always available, never required,
  for either switch.
- The station picker in Update Session is back to a dropdown.
- A new mid-size dashboard card density, between Compact and Comfortable.
- Password reset: any logged-in user can change their own password
  (click your name in the navbar); the owner can also generate a
  temporary password for any employee from the Users page.
- Manual data backup/restore: Settings → Data Backup lets the owner
  download a full JSON backup any time, and restore from one later -
  restore is additive only (never deletes or overwrites existing data),
  with an optional date range to restore only specific sessions.
- Receipts were already never stored anywhere persistent - they're
  generated fresh from session data on every request and only ever exist
  as a downloaded file in the browser, never written to MongoDB or disk.

**The logo upload bug - I could not find a definitive cause.** I audited
every layer (file validation, FileReader, the save request, the body
size limit, both storage adapters, the settings document's update logic)
and didn't find a structural bug in the code as written. I've made the
upload flow considerably more defensive - it now validates file type
explicitly, shows the actual file size if it's too large, surfaces
FileReader errors instead of failing silently, and shows the real HTTP
status/error message if the save itself fails, rather than a generic
"could not save." Please try again and, if it still doesn't work, tell me
exactly what you see (does the preview image even appear after choosing
a file? does clicking Save show any error text? what's in your browser's
console if you open developer tools) - that will point directly at
whichever layer is actually failing.

---

## 18. What I couldn't verify directly

No network access in this environment, so I still can't click through
the deployed app, a real MongoDB connection, or a real file upload
myself. What I verified with hard assertions instead of eyeballing:
- The grace-period fix against your exact reported numbers.
- The full 30+ case pricing regression suite, confirming the fix didn't
  break anything else.
- The cross-midnight IST window math (still holds from last round).

What I genuinely cannot verify without you testing live:
- The logo upload, as discussed above.
- That the deployment fixes actually result in a working login on Render
  - please redeploy following the updated section 2 and watch the Render
    logs during startup; they should now clearly show the seeding step.
- The new mid-density dashboard card's actual sizing on your phone,
  compared against your screenshot.
- The data export/import flow end-to-end with a real backup file.

Please redeploy first (that unblocks employee testing, which sounded
time-sensitive), then work through the grace-period fix with a real
multi-player-change session, then try the logo upload again with
developer tools open so we can see exactly what's happening if it's
still stuck.

# gaming-parlour-saas
