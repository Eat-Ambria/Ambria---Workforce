# MEMORY.md — context carry-over

A hand-maintained log of **what was being worked on and why**, so that a cleared
chat context (or a gap of a few weeks) can be picked up without re-deriving it.

It deliberately does **not** repeat what the repo already records. Architecture
and flows live in [Md/HOW-IT-WORKS.md](Md/HOW-IT-WORKS.md); the folder map lives
in [README.md](README.md); what a given change did lives in `git log`. What goes
here is the part none of those hold: decisions and their reasons, work that is
half-finished, and steps that have to happen outside the repo.

**How to use it:** read the two sections below the conventions — *Open threads*
first, then the most recent session entry. Append a new entry at the top of the
log when a piece of work lands; delete a line from *Open threads* the moment it
is actually done, so a stale item never gets treated as pending.

**It is kept current as work happens**, not written up after the fact — so
*Open threads* should be trusted as the real list of what is still pending. If
the newest session entry is older than the newest commit that touched behaviour,
something was missed and the gap is worth filling in from `git log`.

---

## Working conventions that are not visible in the code

**SQL migrations are gitignored and run by hand.** `supabase/db/migrations/` is
local-only, like `.env`. Nothing applies them automatically — they are pasted
into the Supabase SQL Editor (Ambria Admin project → SQL Editor → New query →
Run). So any change that touches the database is **not finished when the code is
committed**; it is finished when the SQL has actually been run.

Because of that, every handoff must end with an explicit **"run these SQL
files"** list naming the files. A migration mentioned only in passing gets
missed, and the app then fails against a column that does not exist.

Each migration file is written to be re-runnable (`add column if not exists`,
guarded `do $$` blocks) and ends with a verify block that must read `PASS`.

**Edge functions deploy separately** — `supabase functions deploy <name>`. When a
function starts selecting a new column, **run the migration first**: deploying
first makes the function ask for a column that does not exist yet, and the feed
answers 502 until the SQL lands.

**Docs are part of the change.** `AMBRIA_VALET_BOOKINGS_FEED.md` and
`VALET_REPORT_API.md` are contracts read by a separate valet project. A field
added to a feed gets added to its doc in the same commit, or the other side
never learns about it.

---

## Open threads

- **`property: 'all'` collides with the "no filter" sentinel, and it is still
  live.** A user whose stored `property` is `'all'` but who is not named in
  `ALL_PROPERTY_ADMINS` (`['vicky','sandeep']`) gets **every venue on Tasks** and
  **no venue on Valet** — 11 active accounts, including Vipul and two "Overall
  Head" admins. A one-line fix (`canSeeAllProperties = isSuperAdmin(role) ||
  user.property === 'all'`) was written on 2026-09-11 and **reverted on request**,
  so nothing has changed. The lower-risk alternative, if this is wanted later, is
  to give the people who should be venue-locked a real venue in User Management
  instead of touching the rule.

- **Renaming the repo to `ambria-admin` is POSTPONED, and the code for it was
  reverted on 2026-09-11.** Nothing is pending in the tree — the base path is back
  to `/Ambria---Workforce/` everywhere and the live site is consistent. When it is
  picked up again the whole change is six files plus four docs; the 2026-09-08
  entry lists them and the exact ordering, and the work is small enough to redo
  from scratch rather than worth carrying around half-applied.

- **Run `SUPABASE-MIGRATION-VALET-BOOKING-FUNCTION-TYPE.sql`**, then redeploy
  `valet-bookings-feed`. In that order. Until both happen, `function_type` is
  code-only — see the 2026-09-05 entry.
- **Open question: has `SUPABASE-MIGRATION-AUTH-SECURITY.sql` been run on the
  live project?** It is the only migration that touches policies on `users`, and
  it leaves the table SELECT-only for anon with no later migration restoring
  write. If it HAS been run, creating and editing users from `Users.jsx` is
  already failing (it uses plain `.insert()` / `.update()`); if it has NOT, then
  passwords are still plaintext and `verify_login` does not exist. Both matter;
  they are opposite problems. Settled in ten seconds by trying to edit a user in
  the app. (Deleting is unaffected either way — it goes through a SECURITY
  DEFINER RPC on purpose.)
- **`SUPABASE-MIGRATION-REMOVE-VALET-ROLE.sql` / `-PURGE-VALET-USERS.sql` are
  effectively done.** Checked live 2026-09-05: no `users` row has `role = 'v'`,
  and `delete_user()` exists. Only the column comment in the first file is still
  unapplied, which changes no behaviour.

---

## Session log

### 2026-09-22 — the training video that played the app inside itself
Not committed. No migration.

**The report.** Opening the "Harpic, Lizol Colin Used" video showed the website
inside the player.

**The cause.** `training_videos` row 43 has
`youtube_url = 'Harpic, Lizol Colin Used'` — somebody typed the title into the
URL box. `VideoForm` deliberately allows a non-YouTube link so raw embed URLs
work, so it saved with an empty `youtube_id`, and `PlayerModal` put the string
straight into `<iframe src>`. **A relative iframe src resolves against the page**,
so the iframe loaded the app. It was never an embed — it was the app in a box.

| Where | What |
| --- | --- |
| [youtube.js](src/lib/youtube.js) | new `isEmbedUrl()` — absolute http(s) only, so `javascript:` and `data:` fail the protocol check rather than the parse |
| [PlayerModal.jsx:33](src/pages/shared/training/videos/PlayerModal.jsx#L33) | `embed` is '' unless `isEmbedUrl`, so a bad row hits the "No video linked yet" placeholder |
| [VideoForm.jsx](src/pages/shared/training/videos/VideoForm.jsx) | save refuses it, and the live preview says so while typing |
| [youtube.test.js](src/lib/youtube.test.js) | 11 tests; the relative-path and bare-host cases are the ones that look close enough to a link to slip through |

**Checked live:** 55 video rows, 24 with no usable URL — 23 are INACTIVE seed
rows with an empty string (already correct, they show the placeholder). **Row 43
is the only active one**, and it still holds the bad value: the code stops it
breaking, it does not repair the data. Edit that video and paste the real link.

**Verified:** build clean, eslint clean, 54 tests pass.

---

### 2026-09-22 — WiFi due-date reminder, and the CCTV register
Not committed. Two migrations: one run, one waiting.

**WiFi bills.** The due date was recorded and then nobody looked at it. Two
halves:

- *A reminder on the dashboard, two days out.* A `wifi_services` query appended
  to the END of both `Promise.all` lists in [Dashboard.jsx](src/pages/Dashboard.jsx)
  — that file's "ORDER IS THE CONTRACT" warning is real, the results are read
  positionally. The widget only renders when something is `days <= 2`, so on a
  normal day the dashboard looks exactly as it did.
- *The date rolls itself forward.* `roll_wifi_due_dates()` in
  `SUPABASE-MIGRATION-WIFI-DUE-ROLLOVER.sql`, on pg_cron — the day AFTER a due
  date passes, it moves to the same day next month. **Run and verified live**;
  it returns 0 because no date is in the past, which is the answer you want.

**CCTV register.** New tab beside WiFi Services, admin-only like the rest of
that group. One row per recorder: property, company, serial number, username,
password, notes.

| Where | What |
| --- | --- |
| [CctvDevices.jsx](src/pages/shared/training/CctvDevices.jsx) | new page — card list + add/edit modal, modelled on `FireSafety.jsx` |
| [Training.jsx:27](src/pages/shared/Training.jsx#L27) | the tab, inside the `admin ?` block |
| [index.js](src/translations/index.js) | `cctv`, `addDevice`, `editDevice`, `deviceCompany`, `noDevicesYet`, `deleteDevice*`, `showPassword`, `hidePassword` |
| `SUPABASE-MIGRATION-CCTV-DEVICES.sql` | run 2026-09-22; table verified live, first row written through the app |

**Decisions worth not re-litigating.**

- *Cards + a modal, not the WiFi spreadsheet.* Five fields and a handful of rows
  do not need the inline-edit sheet, and the sheet brings parent/child nesting
  and Hindi transliteration that a recorder has no use for.
- *The password is masked here, shown there.* A wifi key is written to be given
  away, so `WifiServices` shows it and offers Copy. A recorder login is not, so
  this one masks it behind a per-row eye. Both still store it as typed — see the
  note at the top of the migration: the anon key ships in the bundle, so this
  register is a convenience for admins, not a vault. That is the existing posture
  of every table in the project, stated rather than implied.
- *Company is free text with a picker.* CP Plus and Hik Connect are offered; a
  third brand is somebody typing it, not a migration. A row already holding an
  unrecognised brand opens in free-text mode so editing something else about it
  does not quietly rewrite the name.
- *Nothing is NOT NULL but `property`.* A register half filled in beats an empty
  one waiting on somebody to have every field to hand.

**Verified:** `npm run build` clean, `eslint` clean on the changed files, 43
tests pass. Table read back through the REST API after the migration — the
policy lets the anon key read it, which is what the tab needs.

---

### 2026-09-11 — the "Unassigned" row, and what actually caused it
Not yet committed (except the SQL cleanup, which has been run).

**The report.** An "Unassigned / Admin" row, 2/2 green, sitting among the staff
on the All tasks board.

**Three separate things were wrong, and only the third was the cause.**

1. *It looked like a person.* The row drew a department dot and an "Admin"
   subtitle, because the bucket took `department` from whichever task was counted
   first — arbitrary, and wrong the moment the bucket spans departments. Fixed in
   [StaffProgress.jsx](src/pages/admin/StaffProgress.jsx) and
   [MissedWork.jsx](src/pages/admin/MissedWork.jsx): no department on that bucket,
   and it is no longer a row in the people list at all — it is its own block under
   it, headed `t.nobodyAssigned` ("Nobody assigned yet"), always expanded.
   **It still counts in the totals.** An earlier attempt filtered those tasks out
   entirely; that was wrong and was reverted the same session — it hid real work,
   and in MissedWork it made the band totals disagree with the page header.
2. *Vipul could work at venues he is not posted to.* His `property` is `'all'`,
   which is ALSO the UI's sentinel for "no property filter" — so on Tasks his
   `propFilter` initialised to `'all'` and the query dropped its property clause
   (he saw every venue), while on Valet `PROPERTIES.filter(p => p.code === 'all')`
   matched nothing (he saw a blank page). 11 active accounts are in that state.
   **A fix was written and then reverted on request — this is still live.** See
   the open thread.
3. *The actual cause.* Vipul completed the daily CCTV job at all five venues,
   and was then unticked from Restro and Janakpuri **the same day**. The roster
   deliberately keeps a worked-on row and only clears the name, so two rows were
   left with `assigned_to` NULL — and `reset_recurring_tasks()` never touches
   `assigned_to`, so they would have come back unassigned every morning forever.

**The permanent fix** — [RosterModal.jsx](src/pages/admin/RosterModal.jsx#L1145),
new `safeToDelete(r) = untouched(r) || r.status === COMPLETED`, used in both drop
paths. A dropped row is deleted when nothing has happened on it (unchanged,
long-standing) **or when it is already completed** (new). Safe because
`trg_task_completion_history` writes the `task_completions` row on the transition
INTO 'completed' — name, venue and timings included — so the record already lives
somewhere the roster cannot reach. A part-done row (started / submitted / issue)
has no history row yet and is still kept unassigned: deleting it would erase the
only trace.

**Decisions worth not re-litigating.**

- *Never write "delete all unassigned tasks".* The roster uses an unassigned row
  to represent a venue's OPEN SLOT. The only thing separating an orphan from an
  open slot was today's `completed_by`, and the 06:00 reset nulls that — after
  which they are indistinguishable. The cleanup was therefore written against two
  exact ids.
- *The block was kept, not deleted.* Today there is nothing unassigned, so it
  renders nothing. When something legitimately is (an open slot), it should show.

**Verified:** `eslint` clean, build passes, `vitest` 26/26. Live DB checked after
the cleanup: no unassigned tasks anywhere, and the CCTV job still runs at Restro
and Janakpuri under Ravi. The roster save path was NOT exercised in a browser.

---

### 2026-09-08 — Pages URL moved to /ambria-admin/ (REVERTED 2026-09-11)
**Not applied.** The change was written, verified against the built output, then
reverted on 2026-09-11 — the rename is for another day. Kept here because the
research is the expensive part: the file list, the ordering, and the three things
that break are all still correct whenever it is picked up.

**What was asked.** A URL that says "ambria admin" instead of
`Ambria---Workforce`. Offered three routes; they picked the repo rename over a
custom domain (`admin.ambria.in`) and over leaving it alone.

**Old:** `https://eat-ambria.github.io/Ambria---Workforce/`
**New:** `https://eat-ambria.github.io/ambria-admin/`

| File | What |
|---|---|
| [vite.config.js](vite.config.js#L8) | `base`, plus manifest `id` / `scope` / `start_url` |
| [main.jsx](src/main.jsx#L67) | `BASENAME` — the router's basename |
| [push-sw.js](public/push-sw.js#L4) | `BASE` |
| [fix-request.webmanifest](public/fix-request.webmanifest) | `id` / `scope` / `start_url` |
| [send-push/index.ts](supabase/functions/send-push/index.ts#L20) | `BASE` — **needs redeploy** |
| `Md/*.md` (4 files) | live URL and repo URL in the docs |

**The exact sequence** (there is unavoidable downtime — the deployed files carry
one base and Pages serves another until both agree):

1. GitHub → Settings → General → Repository name → `ambria-admin` → Rename
2. `git remote set-url origin https://github.com/Eat-Ambria/ambria-admin.git`
3. Commit + push → the deploy workflow publishes to `gh-pages` (~1-2 min)
4. Check Settings → Pages still reads "Deploy from a branch / gh-pages / root"
5. `supabase functions deploy send-push`

**Decisions worth not re-litigating.**

- *`supabase/.temp/linked-project.json` still says `Ambria---Workforce`.* That is
  the Supabase **project** name, not a URL or a path. Left alone deliberately.
- *The service worker needed no path edit.* Its precache manifest and its
  `importScripts("push-sw.js")` are both relative, so they resolve against the
  SW's own scope. Verified against the built `dist/sw.js`.
- *A custom domain is still the better end state* and was explained as such. It
  was declined for now; the cost of choosing it later is breaking installed PWAs
  and shared links a second time.

**Verified:** `eslint` clean, `vitest` 26/26, and the **built output** checked
rather than assumed — `dist/index.html` asset paths, both manifests' `scope` /
`start_url`, the fix-request page's manifest `href`, and `dist/push-sw.js`. Not
verified live: the rename has not happened.

---

### 2026-09-08 — LMS calendar auto-syncs in the background
Not yet committed.

**What was asked.** Live background sync for the Valet calendar, after being
told the cost of polling. They reaffirmed, so it was built.

**The real bug was not the TTL.** The 10-minute cache TTL was only consulted at
component *mount*, so a Valet page left open never refreshed at all — TTL length
was irrelevant to that. Lowering the TTL to seconds would have bought
"refetch on every visit" at 88 CRM requests a visit and fixed nothing for an
open tab.

**Measured, live, this session:** one sweep = 88 pages, 765 records, **15.2s**,
2.2 MB raw. Matches the 14.3-16.0s range recorded in
`SUPABASE-MIGRATION-LMS-FEED-CACHE.sql`. Comments across `lms.js` and
`lmsCache.test.js` said "twelve seconds"; corrected to fifteen.

| Where | What |
|---|---|
| [lms.js](src/lib/lms.js#L176) | TTL 10 min -> **3 min**, now exported; `lmsContractsAge()`; `onSyncStart`/`onSyncEnd` |
| [Valet.jsx](src/pages/admin/Valet.jsx#L86) | `LMS_POLL_MS` 45s timer + `visibilitychange` + `online`; sync status strip; manual "Sync now" |
| [translations](src/translations/index.js) | 4 `sync*` keys, EN + HI |
| [lmsCache.test.js](src/lib/lmsCache.test.js) | 2 new tests; TTL offset now read off the constant |

**Decisions worth not re-litigating.**

- *Two numbers, not one.* `LMS_POLL_MS` (45s) is how often the timer **looks**;
  `CONTRACTS_TTL_MS` (3 min) is what the CRM is actually **billed**, because a
  look inside the TTL makes no request. Tune the TTL to change cost, not the
  poll.
- *No polling while the tab is hidden.* Browsers throttle hidden timers to ~1/min
  and freeze them outright, so a hidden tab drifts anyway — and it would be a CRM
  bill for figures nobody is looking at. `visibilitychange` covers the catch-up.
  Same reasoning as `SUPABASE-MIGRATION-WORKBOARD-REALTIME.sql`.
- *`onSyncEnd` runs in a `finally`.* A failed background refresh that never
  called it would leave "Syncing…" on screen permanently. There is a test for
  exactly this.
- *No manual "Sync now" button.* One was built, then removed the same day on
  request — syncing is meant to be entirely automatic. The consequence, accepted
  deliberately: there is now **no way to force a refresh inside the 3-minute
  TTL**, so somebody who has just booked in the CRM waits out the timer. If that
  ever needs an escape hatch again, `clearLmsCache()` in `lms.js` is still
  exported and still has no caller outside tests. `syncLms()` takes no arguments
  precisely so that no half-used `force` path is left lying around.
- *Realtime + a shared server cache was considered and NOT built.* It is the
  strictly better design — one sweep per interval for everyone instead of one per
  open tab — and every piece already exists in this project (`pg_cron`, `pg_net`,
  Vault `service_role_key`, the realtime publication pattern, `lms_feed_cache`).
  Two things stopped it: the raw payload is 2.2 MB, far too big to push over
  Realtime (a pointer table plus a REST read would be needed), and
  `lms_feed_cache` holds the *feed's* shape, which **deliberately omits the guest
  phone** that the calendar's event cards display. So it would need its own cache
  row in the client's shape. **This is the upgrade path if CRM load becomes a
  problem** — the dedupe is per browser tab, so five admins watching the calendar
  is five sweeps per interval, not one.

**Verified:** `eslint src/` clean, `npm run build` passes, `vitest` 26/26 (was
24). Not verified in a browser — the timer, the visibility listener and the
status strip have not been watched running.

---

### 2026-09-05 — permanent delete for deactivated users
Not yet committed. Language preference also switched back to English this day.

**What was asked.** A way to delete an inactive user, not just deactivate them.

**What made it more than a DELETE.** Nothing in this database has a foreign key
to `users.id` — about 30 columns across 25 tables hold one as bare TEXT. So a
plain `delete from users` succeeds, reports success, and leaves every one of them
dangling. Three of those actually bite:

- `tasks.assigned_to` — `reset_recurring_tasks()` re-serves the roster each
  morning and deliberately preserves `assigned_to`, so the deleted person's jobs
  come back **every day forever**.
- `create_due_task_reminders()` (daily cron) groups by `assigned_to` with no
  `users` check — a fresh notification written to a ghost account every day.
- `staff_deployments` has no name column, so the Cover panel renders the raw
  `u_207da6b1-…` on screen.

**And a real defect found on the way:** [AuthContext.jsx](src/context/AuthContext.jsx)
destructured only `data` from the session refresh, so when the row was gone
`if (data)` was false, the `else` never ran and **`logout()` was never called**.
There is no token here — the localStorage copy *is* the session — so a deleted
user's open device would have stayed fully signed in, with write access to every
table, forever. Now `PGRST116` (no rows) logs them out, while any other error
still keeps the cached user, because that one is just a bad connection.

| Where | What |
|---|---|
| `SUPABASE-MIGRATION-DELETE-USER.sql` | `delete_user(p_id)` RPC — **not yet run** |
| [AuthContext.jsx](src/context/AuthContext.jsx) | deleted account now ends the session |
| [Users.jsx](src/pages/admin/Users.jsx) | danger section in the edit modal + success Toast |
| [translations/index.js](src/translations/index.js) | six `deleteUser*` keys, EN + HI |

**Decisions worth not re-litigating.**

- *An RPC, not `.delete()`.* The cleanup has to be one transaction, and
  `AUTH-SECURITY.sql` leaves `users` SELECT-only for anon anyway. `SECURITY
  DEFINER` gets past that.
- *`is_active = false` is required, and the check lives in the function*, not
  just the UI — anyone with the anon key can call the RPC directly. It also
  means the person is already signed out before the button appears, since
  deactivating is what ends a session.
- *Three fates for a dangling id, not one.* **Purged** where the row is
  meaningless without them (push subscription, cover postings, training,
  quizzes, notifications addressed to them). **Nulled** where a `*_name`
  snapshot survives to carry the display. **Untouched** for
  `task_completions.assigned_to`/`assignee_name` — that is the analytics
  history, denormalised by `TASK-HISTORY.sql` precisely "so history survives
  staff deletion". Deleting a person must not rewrite what the venue got done
  last quarter.
- *Legacy tables nulled rather than purged.* Unread history either way, and
  unreadable history beats deleted history.
- *The button sits at the bottom of the modal body, not in the footer.* It is
  the one irreversible action on the screen, so it should take a deliberate
  scroll rather than sit next to Save under the thumb.

**Verified:** `eslint src/` clean, `npm run build` passes, `vitest` 24/24. The
SQL has **not** been run and the RPC has never executed — the function's logic
is unverified against a real database.

---

### 2026-09-05 — the valet user role ('v') removed
Not yet committed.

**Why.** The valet team does not log in to Ambria Admin. Role `'v'` was never
really a fourth kind of user: it reached exactly one page, `/valet`, which is the
*admin* Valet page — the same component, entered by a different front door. The
valet project has its own logins and reads bookings over `valet-bookings-feed`.
So the role bought nothing and cost a gate on every other route.

**Scope.** Roughly 12 code sites. There was **no** valet-only page, and **no**
database enforcement at all — `users.role` is plain TEXT with no CHECK, no enum,
no FK, and no RLS policy or trigger reads it. `'v'` only ever existed in
`src/constants/org.js`.

| Where | What |
|---|---|
| [org.js](src/constants/org.js) | `ROLES.VALET`, `isValetRole`, `canSeeValet`, `canSeeGuestPhone`, `homeFor`, and the valet clause in `canSeeAllProperties` all deleted; `VALET` out of `ASSIGNABLE_ROLES`; `roleTag` case gone |
| [nav.js](src/constants/nav.js) | `/valet` back to `['sa','a']`; `alwaysVisibleFor` is now always `/dashboard` |
| [App.jsx](src/App.jsx) | `notValet` gone — `/dashboard`, `/my-tasks`, `/task-board`, `/training` are ungated again; `/valet` gated on `isAdminRole`; `homeFor(...)` redirects inlined to `/dashboard` |
| [Login.jsx](src/pages/Login.jsx) | lands everyone on `/dashboard` |
| [Users.jsx](src/pages/admin/Users.jsx) | valet dropped from `roleLabel` / `roleTone` |
| [translations/index.js](src/translations/index.js) | `roleValet` removed, EN + HI |
| [ValetRecords.jsx](src/pages/admin/ValetRecords.jsx), [ValetAnalytics.jsx](src/pages/admin/ValetAnalytics.jsx), [Valet.jsx](src/pages/admin/Valet.jsx) | all `showPhone` plumbing removed, incl. the PDF export parameter |
| [ValetRecords.smoke.test.jsx](src/pages/admin/ValetRecords.smoke.test.jsx) | the two `as('v')` tests dropped; "shown to an admin" kept as the live regression |
| `SUPABASE-MIGRATION-REMOVE-VALET-ROLE.sql` | **not yet run** — deals with the rows, not the schema |

**Decisions worth not re-litigating.**

- *Removing `canSeeGuestPhone` is a behaviour no-op.* It was `!isValetRole(role)`,
  already `true` for `sa`/`a`/`e`. Only admins can reach `/valet` now, so nobody's
  view of a guest phone changed. This is worth remembering before anyone "fixes"
  it back as a privacy regression — it isn't one.
- *The feed still omits guest phone, on purpose, and the reason was rewritten.*
  It used to be justified by the valet role; the rule deliberately outlived it —
  the audience is a different company's system. Since nothing in the app enforces
  it any more, it holds only because it is written down, which is why the note in
  `AMBRIA_VALET_BOOKINGS_FEED.md` and in the edge function says so at length.
- *Accounts are deactivated, not deleted.* `is_active = false` is how this app
  already retires a person. The row keeps the username and history, the role
  letter stays `'v'` so they remain identifiable, and the undo is one line at the
  bottom of the migration.
- *`WORK_ASSIGNEE_ROLES` kept even though it now equals the full role set.* It
  existed only to keep valet users out of assignee pickers, but `users.role` has
  no constraint behind it, so it still earns its place as the filter that keeps a
  row on a retired role out of the pickers.

**A pleasant side effect:** `Md/HOW-IT-WORKS.md` ("Three kinds of people", the
`sa`/`a`/`e` table, "Valet (`/valet`, admin)") and the `valet-analytics` comment
"the Valet page is only reachable by an admin" were all written before the role
and never updated. They are correct again, so they were left alone.

**Verified:** `eslint src/` clean, `npm run build` passes, `vitest` 24/24 pass.
Not verified against a real database — the migration has not been run.

---

### 2026-09-05 — `function_type` carried onto valet bookings
Commit `95a688c` ("event was not showing in booking"). Working tree clean.

**The problem.** A CRM event card shows what the event is — "Wedding", "Haldi",
"Sangeet" — and pressing **+ Valet Booking** on it threw that away. `prefillFrom()`
carried the customer name, time, phone and guest count, but `valet_bookings` had
nowhere to put the function type. So the moment an event became a booking it
stopped saying what it was for, which is one of the first things anyone staffing
it asks.

**What changed.**

| Where | What |
|---|---|
| `SUPABASE-MIGRATION-VALET-BOOKING-FUNCTION-TYPE.sql` | adds `valet_bookings.function_type text` — **not yet run** |
| [Valet.jsx:767](src/pages/admin/Valet.jsx#L767) | `prefillFrom()` carries `c.functionType` |
| [Valet.jsx:874](src/pages/admin/Valet.jsx#L874) | `BookingCard` shows the same `star` chip the unbooked event card uses |
| [Valet.jsx:968](src/pages/admin/Valet.jsx#L968), [:991](src/pages/admin/Valet.jsx#L991) | held in form state, not read off `prefill` at save time |
| [Valet.jsx:1074](src/pages/admin/Valet.jsx#L1074) | in the payload, so insert and update both write it |
| [index.ts:291](supabase/functions/valet-bookings-feed/index.ts#L291) | in `BOOKING_COLS`; the response spreads `...r`, so it flows through |
| `AMBRIA_VALET_BOOKINGS_FEED.md` | sample JSON, an explainer section, the migrations list |

**Decisions worth not re-litigating.**

- *A column, not a line appended to `notes`.* `notes` is free text an admin
  rewrites, and structured data does not survive in a field people edit.
- *No input field in the booking form.* The CRM is the only thing that knows the
  function type, and a booking made by hand genuinely has none.
- *Nullable, no default, no backfill.* NULL is the truth about an old booking —
  the type was never captured. `'Other'` or `''` would both claim something not
  known, and matching an old booking back to its event would be guesswork.
- *Kept in form state rather than read off `prefill` at save time.* Otherwise
  reopening an existing booking and saving it would quietly clear the value.
- *Same field name and same readable values on both sides of the feed* — already
  resolved from the CRM's numeric id by `normContract` in `src/lib/lms.js` — so
  one component can render a booking and an unbooked event alike.

**Verified:** `npm run build` passes, `eslint src/pages/admin/Valet.jsx` clean.
Not verified against a real database — the migration has not been run.

---

### Before that
Not recorded here; this file starts at 2026-09-05. `git log` covers the earlier
valet work — the vendor assignee correction (`VALET-BOOKING-VENDOR`), the LMS
feed cache, the merged calendar/booking tab.
