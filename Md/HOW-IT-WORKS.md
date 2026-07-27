# Ambria Ops — How It Works

A walkthrough of the whole system: what it is, how the pieces fit, and every
flow end to end. Read this first if you're new to the project.

- **What each file is** → `README.md` (folder map, quick start)
- **Table-by-table schema + seed data** → `AMBRIA-OPS-PROJECT-CONTEXT.md`
  (older handover doc; some sections describe features that no longer exist,
  e.g. Attendance / Leave / Duty Roster — trust this file and the code first)
- **Notification specifics** → `NOTIFICATIONS-GUIDE.md`, `WEB-PUSH-SETUP.md`

---

## 1. What the app is

A workforce-management PWA for **Ambria's four event venues**. Three kinds of
people use it:

| Role | Code | What they do |
|---|---|---|
| Super Admin | `sa` | Everything, every venue. Only role that manages users. |
| Admin | `a` | Runs a venue (or a department): assigns work, approves it, manages valet/vendors/training. |
| Employee | `e` | Does the work: opens a task, photographs it, submits it for approval. |

Everything happens against a **Supabase** project (Postgres + Storage + Edge
Functions). There is no backend server of our own — the React app talks to
Supabase directly, and the database does the automation via triggers and cron.

```
   Phone / desktop browser                 Supabase
┌──────────────────────────┐        ┌───────────────────────────┐
│  React PWA (GitHub Pages)│◄──────►│  Postgres  (tables,       │
│  - service worker/cache  │  REST  │            triggers, cron)│
│  - offline photo cache   │  +RT   │  Storage   (photos/audio) │
└──────────────────────────┘        │  Edge Fn   (send-push,    │
            ▲                       │             lms-proxy)    │
            │ Web Push              └───────────────────────────┘
            └──────────────────────────────────┘
```

**Stack:** React 18, Vite 5, react-router 6, `@supabase/supabase-js`,
`vite-plugin-pwa` (Workbox). No CSS framework — inline styles driven by a
central palette (`src/constants/colors.js`) and a shared UI kit
(`src/components/common/UI.jsx`). No state library — React context + local state.

---

## 2. Boot sequence

`src/main.jsx` mounts, in this order:

1. `registerSW()` — service worker registers and auto-updates silently.
2. `ErrorBoundary` — catches render crashes so the app never white-screens.
3. `BrowserRouter basename="/Ambria---Workforce"` — must match `base` in
   `vite.config.js`, because the app is served from a GitHub Pages sub-path.
4. `ThemeProvider` → `LangProvider` → `AuthProvider` → `App`.

`src/App.jsx` then decides what renders:

- `/login` — the only route for signed-out users.
- `/fix-request` — **public, no login**. The shareable repair-request page.
- Everything else sits behind `RequireAuth` + `AppLayout`, and admin-only
  routes are additionally wrapped in `RoleRoute`.

Every page except Login is lazy-loaded, so the first paint stays small.

---

## 3. Authentication (custom, not Supabase Auth)

This is the most surprising part of the codebase, so read it carefully.

The app does **not** use Supabase Auth. It has its own `users` table and the
client is created with `auth: { persistSession: false }`
(`src/lib/supabase.js`). Login lives in `src/context/AuthContext.jsx`:

1. **Preferred path** — calls the `verify_login(p_username, p_password)` RPC.
   Passwords are bcrypt-hashed and the column isn't selectable. This exists
   once `supabase/db/migrations/SUPABASE-MIGRATION-AUTH-SECURITY.sql` has been applied.
2. **Legacy fallback** — a direct `select … where password = …` query. Also the
   path that supports **logging in with a phone number** instead of a username
   (`src/lib/phone.js` normalizes the number first).

The signed-in user is cached in `localStorage` under `ambria_user`, so closing
the app keeps you signed in until an explicit logout. On every app open the
cached user is shown immediately, then **re-fetched from the DB** — that's how
an admin's changes to someone's role, visible tabs or active status take effect,
and how a deactivated user gets kicked out.

**Consequences you must keep in mind:**

- RLS on the data tables is effectively `"Allow all"` (see the bottom of
  `supabase/db/migrations/SUPABASE-COMPLETE-SCHEMA.sql`). Postgres has no idea who the caller is, so
  **all permission logic is UI-level**. Anyone with the anon key could call the
  REST API directly. Enforcing a rule server-side means writing an RPC that
  takes the user id and checks it — there is no `auth.uid()` to lean on.
- The anon key is public by design; it ships in the bundle.

---

## 4. Who can see what (scoping)

Three independent layers, all defined in `src/constants/org.js`:

**Property scope** — `scopedProperty(user)` returns the one venue a user is
locked to, or `null` for "all venues". The super admin and the admins named in
`ALL_PROPERTY_ADMINS` (`vicky`, `sandeep`) see everything. A user whose
`property` is `'all'` belongs to every venue — which is why lists use
`memberInProperty()` rather than a plain equality check.

**Department scope** — `scopedDepartment(user)` via `DEPARTMENT_LOCKED_ADMINS`.
Sandeep is the Security Head: he sees every property but only Security data.

**Per-user tab access** — `users.access` is an array of allowed nav paths that
the super admin edits in User Management. Empty/absent means "role defaults".
`navForUser()` in `src/constants/nav.js` applies it; `/dashboard` is in
`ALWAYS_VISIBLE` so nobody can be locked out.

Almost every list query therefore looks like:

```js
let q = supabase.from('tasks').select('*')
if (propScope) q = q.eq('property', propScope)
if (deptScope) q = q.eq('department', deptScope)
```

---

## 5. Layout and navigation

`AppLayout` renders a `Sidebar` on desktop and a hamburger drawer +
`BottomTabBar` on mobile (`useIsMobile`). It also writes the user's chosen
language into `users.lang` on every change, so **server-sent push can be
localized** later.

Nav items come from `NAV_ITEMS` in `src/constants/nav.js`, filtered by role and
then by the user's `access` list. Two badges appear in the nav:
the notification bell (`useNotifications`) and a Fix Request counter
(`useFixRequestCount` — pending approvals for admins, assigned work for staff).

---

## 6. Core flow: Tasks (SOP work)

Two pages, one table (`tasks`):

- **`/tasks` — AdminTasks** (admins): create, filter, approve, delete.
- **`/my-tasks` — MyTasks** (the assignee): actually do the work.

### Lifecycle

```
        admin creates & assigns
                 │
              pending ──────────────► (assignee opens it)
                 │  Start Work — requires a BEFORE photo
                 ▼
            in_progress ──────────► live timer runs
                 │  Submit — requires an AFTER photo
                 ▼
       completion_requested ──────► admin reviews (before/after side by side)
              │        │
     Approve  │        │ Send Back (note and/or voice recording)
              ▼        └────────────► back to in_progress
          completed
```

Statuses live in `TASK_STATUS` (`src/constants/org.js`). Photos are mandatory at
both ends — that's the whole point of the app: proof of work.

### Issues — a separate dimension

A staff member can report a problem at any time. This writes `issue_status`
(`issue` → `issue_working` → `issue_resolved`) and **never touches the task's
lifecycle status**. Resolving an issue sets the task back to `pending`, and
`resolved_at` lets a scheduled job clear the flag a day later
(`supabase/db/migrations/SUPABASE-MIGRATION-ISSUE-AUTOCLEAR.sql`). That's why the Issues view is a
separate button rather than another status tab.

### Overdue

`isTaskOverdue(task, today)` = has a due date in the past and isn't completed.
Tasks without a due date are never overdue. The date pickers set
`min={todayISO()}` so a task can't be *created* overdue — it becomes overdue as
time passes.

### Assignment

Work can go to staff **and to admins** — department heads do fieldwork too.
`src/lib/assignees.js` builds the one canonical "who can be assigned" query
(active users with role `e`/`a`/`sa`, property- and department-scoped).

An admin who is the *assignee* of a row has **no admin powers over that row**:
no approve, send back, rate, reassign or delete on their own work at any status
(`isOwnAssignedWork()`). They do the work in My Tasks like anyone else. The
super admin is never restricted.

---

## 7. Core flow: Repair requests (`work_board`)

The "Fix Request" board — anything broken that needs fixing. Two entry points:

- **`/task-board`** — signed-in staff and admins raise and track requests.
- **`/fix-request`** — a **public page, no login**. Admins copy the link from
  the board and share it; outsiders can raise a request and watch its status.
  Public requests land as `status: 'open'` with no `posted_by`.

### Lifecycle

```
   open  ──(admin assigns: person + due date)──►  assigned
                                                     │ assignee: Start Work
                                                     ▼
                                                in_progress
                                                     │ assignee: photo + Submit
                                                     ▼
                                            approval_requested
                                            │ admin rates 1-5 ★, then
                                    Approve │ or Send Back
                                            ▼
                                         completed
```

The assign picker is **Admins / Staff → department → name**
(`AssigneePicker` in `TaskBoard.jsx`). For admins with no department it shows
their designation ("Site Head", "Supervisor") instead. Assigning stamps the
assignee's department onto the request so it follows the right team.

Delete rules: admins can delete any request at any status (including public ones
with no owner); the poster can delete their own until it's completed; **nobody
can delete work assigned to themselves**.

---

## 8. Core flow: Notifications

Three layers, and they're easy to confuse.

### Layer 1 — rows in the `notifications` table (the source of truth)

Database triggers create them, so a notification exists no matter how a row was
changed (app, SQL editor, script). See `supabase/db/migrations/SUPABASE-MIGRATION-NOTIFICATIONS.sql`:

- `trg_tasks_notify` → `task_assigned`, `task_submitted`, `task_sent_back`,
  `task_approved`, `task_issue`
- `trg_work_board_notify` → `fix_assigned`, `fix_new`, `fix_approval`,
  `fix_approved`
- `notify_admins(...)` — fan-out helper: one row for every active admin whose
  scope covers the property, never the person who caused the event
- `create_due_task_reminders()` — the daily due/overdue reminder. Since
  `supabase/db/migrations/SUPABASE-MIGRATION-DUE-DIGEST.sql` it produces **one row per person per day**:
  a single overdue task keeps its title and task id, two or more become a
  digest whose `task_text` is just the count.

`purge_old_notifications()` deletes anything older than 6 days.

### Layer 2 — the in-app bell

`useNotifications` loads the signed-in user's rows, then keeps them fresh three
ways: a 60s poll, a refresh on window focus/visibility, and a **Supabase
Realtime** subscription filtered to `for_user=eq.<id>`. `NotificationBell.jsx`
maps each row type to an icon, a title, a deep link and a list filter, so
tapping one lands on the exact task or request.

### Layer 3 — OS push banners (works with the app closed)

```
notifications INSERT → Database Webhook → send-push edge function
   → look up the recipient's devices in push_subscriptions
   → look up their `lang`
   → web-push (VAPID) → browser push service → public/push-sw.js
   → showNotification()
```

The client side is `src/lib/push.js` (subscribe/unsubscribe, plus
`syncSubscription`/`releaseSubscription` so a **shared device** only ever gets
the currently signed-in user's pushes). Toggle lives in My Account.
Dead subscriptions (404/410) are deleted automatically by the sender.

`send-push/index.ts` renders the same type→text mapping as the bell, in the
recipient's language. Keep the two in sync when adding a notification type.

---

## 9. Other modules

**Training** (`/training`) — tabs: Videos, Chemical Usage, and for admins Staff
Progress + Fire Safety. Videos are YouTube-backed and scoped by department;
staff see their department's videos plus anything assigned to them individually,
with deadlines and overdue chips. A video can carry a quiz; passing it records a
`quiz_results` row and notifies admins. Assignments auto-sync by department via
DB triggers (`supabase/db/migrations/SUPABASE-MIGRATION-AUTOASSIGN-TRAINING.sql`), so a new video
reaches its department and a transferred employee picks up the new department's
videos automatically. New training topics are auto-translated to Hindi by
`src/lib/translate.js` (local dictionary first, MyMemory API as fallback).

**Valet** (`/valet`, admin) — a booking calendar, a staffing calculator and a
matrix editor. Guest count → required staff per role comes from
`valet_matrix` in the DB, falling back to `src/constants/valetMatrix.js`; admins
can override a booking's staff count by hand. The calendar also overlays **real
confirmed events pulled from the LMS/CRM** through the `lms-proxy` edge function
(`src/lib/lms.js`) so a booking can be created straight from an event. Bookings
export to PDF.

**Vendors** (`/vendors`, admin) — a simple searchable contact directory.

**User Management** (`/users`, super admin only) — create/edit users, set role,
property, department, designation, 4-digit PIN, and tick which nav tabs they can
see. Marking someone a Department Head elevates them to the Admin role. The
screen also shows a staff profile with their fix-request rating history.

**Analytics** (`/analytics`, super admin only) — department-head and staff
performance over a week, month or 90 days. It deliberately does **not** read
history from `tasks`: the 06:00 reset clears `started_at`, `completed_at` and
`approved_by` every morning, so a task finished yesterday is indistinguishable
from one never started. A trigger therefore writes an immutable row to
`task_completions` the moment each task is approved, and the page reads that
instead (`SUPABASE-MIGRATION-TASK-HISTORY.sql`). A head's "team" is defined
exactly as their own screens are scoped — their property, or every property,
plus any department lock. Every figure is rolled up by database functions
(`analytics_by_assignee`, `analytics_by_approver`, `analytics_repairs`,
`analytics_open`) rather than by fetching rows, because a month of completions
runs to tens of thousands of records and PostgREST caps a response at 1000 rows.
Those functions return sums and counts, never averages, so groups can be
combined without averaging averages.

**My Account** (`/account`, everyone) — change your own phone and PIN, and turn
push notifications on/off for the current device.

---

## 10. Cross-cutting conventions

**Photos** — everything goes through `src/lib/storage.js`, which compresses to
roughly 80 KB (`imageCompress.js`) before uploading to the `photos` bucket and
returns a public URL. Photo columns are JSON arrays of URLs. Supabase Storage
images are cached by the service worker for offline viewing.

**Freshness without a refresh button** — list pages poll on an interval (20-30s),
refresh on window focus and on `visibilitychange` (phones don't fire `focus`
reliably), and use a `silent` flag so background refreshes don't flash a loader.

**Deep links** — navigation carries `location.state` (`{ tab, status, focusTask,
focusFix, property, member }`). Pages read it to open the right tab, apply the
right filter, or open one specific row's modal. That's how the dashboard tiles
and notification taps land you in exactly the right place.

**Bilingual** — every string comes from `T` in `src/translations/index.js`
(`useT()`). Task titles are additionally auto-translated to Hindi on creation
and stored in `title_hi`. When you add UI text, add both languages.

**Icons** — SVG only, from `src/components/common/Icon.jsx`. No emoji in the UI.

**IDs** — text primary keys generated client-side by `newId('t_')`
(`src/lib/id.js`), not database sequences.

---

## 11. Scheduled jobs (pg_cron, on Supabase)

| When (IST) | What | File |
|---|---|---|
| 06:00 daily | Reset recurring SOP tasks to `pending`; delete their photos/voice notes | `supabase/db/migrations/SUPABASE-DAILY-RESET.sql` |
| 06:15 daily | Delete photos of fix requests completed more than a day ago (rows kept) | `supabase/db/migrations/SUPABASE-MIGRATION-FIXREQUEST-PHOTO-CLEANUP.sql` |
| 09:00 daily | Due/overdue task reminders, one per person | `supabase/db/migrations/SUPABASE-MIGRATION-DUE-DIGEST.sql` |
| daily | Clear resolved issue flags after a day | `supabase/db/migrations/SUPABASE-MIGRATION-ISSUE-AUTOCLEAR.sql` |
| daily | Purge notifications older than 6 days | `supabase/db/migrations/SUPABASE-MIGRATION-NOTIFICATIONS-CLEANUP.sql` |
| as needed | Delete orphaned task media no task points at | `supabase/db/migrations/SUPABASE-MIGRATION-PURGE-ORPHAN-PHOTOS.sql` |

The daily reset, fix-request photo cleanup and issue auto-clear files schedule
themselves when you run them. The due reminders and notification purge leave
their `cron.schedule(...)` line commented out, so those two only run if someone
uncommented it or runs them by hand. Check what's actually live with
`select * from cron.job;`.

---

## 12. Running it locally

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173/Ambria---Workforce/
npm run build            # -> dist/
```

`VITE_VAPID_PUBLIC_KEY` is optional locally — without it the push toggle stays
hidden and everything else works.

**Database setup order:** `SUPABASE-COMPLETE-SCHEMA.sql` first, then the
`SUPABASE-MIGRATION-*.sql` files. They're all idempotent, so running one twice
is safe. You run them by pasting into the Supabase SQL Editor — they are not
CLI migrations.

> ⚠️ **The SQL files are not in this repo.** `supabase/db/migrations/` is
> gitignored, like `.env` — the scripts live on the maintainer's machine only.
> A fresh clone therefore cannot rebuild the database; ask for a copy of the
> folder if you need to. Everything already applied is safely inside Postgres,
> so the running app is unaffected.
>
> **Why `supabase/db/migrations/` and not `supabase/migrations/`?** The Supabase
> CLI reserves `supabase/migrations/` for its own migration history: files there
> must be named `<timestamp>_name.sql` and get applied in order by
> `supabase db push` / `db reset`. Ours are hand-run scripts with descriptive
> names, and one of them seeds dummy data — exactly what you don't want a CLI
> command applying by accident. The extra `db/` keeps the conventional folder
> name without standing in the CLI's path.

---

## 13. Deploying

Push to `main` → `.github/workflows/deploy.yml` builds and publishes to GitHub
Pages (live at `eat-ambria.github.io/Ambria---Workforce/`), usually in about
three minutes. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`VITE_VAPID_PUBLIC_KEY` come from repo Action secrets. The workflow copies
`index.html` to `404.html` so deep links like `/fix-request` load the app.

Three things must always agree — change one, change all three:

- `base` in `vite.config.js`
- `BASENAME` in `src/main.jsx`
- `BASE` in `public/push-sw.js` **and** in `supabase/functions/send-push/index.ts`

Edge functions deploy separately:

```bash
supabase functions deploy send-push --no-verify-jwt
supabase functions deploy lms-proxy
```

---

## 14. Things that will bite you

- **Permissions are UI-only.** RLS is open. Any rule you add in React is a
  convention, not a guarantee.
- **`title_hi` / `lang`.** Hindi users see `title_hi` when it exists; the push
  sender reads `users.lang`. Forget to set the language and everything silently
  falls back to English.
- **Two renderers per notification type.** `NotificationBell.jsx` (in-app) and
  `send-push/index.ts` (banner). Adding a type means editing both.
- **`department = 'a'` is legacy.** Admin is a *role*, not a department, so it's
  absent from `DEPARTMENTS` but kept in `DEPARTMENT_MAP` so old rows still
  render a readable name.
- **The service worker caches aggressively.** After a deploy, a phone may need
  the app closed and reopened before it picks up the new build.
- **Chrome may hide push banners** behind a "Possible spam" card on Android.
  It's a content/reputation judgement about the `github.io` origin, not a bug in
  the push code — installing the PWA or moving to a custom domain is the fix.
