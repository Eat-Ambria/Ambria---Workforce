# Ambria Ops — Go-Live Checklist (deliver tomorrow)

Work top to bottom. ✅ = already verified today (2026-07-24), no action needed.
🔲 = you must do it today. Tick each box.

---

## PART 0 — Already verified (no action) ✅

Backend logic live-tested against Supabase today, all PASS:
- ✅ Task notifications: assigned / submitted / sent-back / approved
- ✅ Issue decoupling: reporting an issue keeps the task **Pending**; admins notified
- ✅ Fix requests: new / assigned / approval / approved
- ✅ Valet booking notification
- ✅ Quiz completion + Training assignment notifications
- ✅ Auto-assign training by department (both directions)
- ✅ Admin fan-out scope + actor never self-notified
- ✅ Push delivery (function + webhook + subscription) confirmed on a real device
- ✅ Frontend builds clean

All required SQL migrations are **active** in Supabase:
- ✅ Notifications triggers · ✅ Issue auto-clear · ✅ Auto-assign training · ✅ Push webhook

---

## PART 1 — Ship the code (5 min) 🔲

- 🔲 Commit the last doc:
  ```
  git add TEST-CASES.md GO-LIVE-CHECKLIST.md
  git commit -m "docs: final QA results + go-live checklist"
  git push origin main
  ```
- 🔲 Open GitHub → **Actions** tab → confirm the latest run is **green** (build + deploy).
- 🔲 Open the live site — https://eat-ambria.github.io/Ambria---Workforce/ — it loads, no blank screen.
- 🔲 Hard-refresh (Ctrl+Shift+R) once to pull the newest build.

---

## PART 2 — Login & session (5 min) 🔲

- 🔲 Login with **username + PIN** → Dashboard.
- 🔲 Login with **phone + PIN** → works.
- 🔲 Wrong PIN → "invalid" error.
- 🔲 Login, then **close the app without logout** → reopen → **still logged in** (no login page).
- 🔲 **Logout** → login page returns.

---

## PART 3 — Core flows, one admin + one staff (15 min) 🔲

Use two accounts (admin + a test employee). Best on two devices/browsers.

**Tasks**
- 🔲 Admin: create a task, assign to the staff → staff sees it in My Tasks (+ notification).
- 🔲 Staff: Start (before photo) → Mark for completion (after photo) → Awaiting Approval.
- 🔲 Admin: Approve → staff notified; Completed.
- 🔲 Admin: Send back (text + a voice note) → staff sees the reason + can play the voice note.
- 🔲 Staff: report an **issue** → task **stays Pending** + Issue badge; admin gets notified.
- 🔲 Admin: Start working → Mark resolved → staff sees Resolved; task back to Pending.
- 🔲 Admin: open any task → **Delete** (trash) button works.

**Repair requests**
- 🔲 Staff raises a request → admin notified; shows under Open.
- 🔲 Staff can **Delete their own** request (not-completed).
- 🔲 Admin: assign → staff starts → submits with photo → admin approves.
- 🔲 Create form: submit empty → error under **Title**, scrolls/focuses it.

**Training**
- 🔲 Admin: upload a video for a department → staff in that dept get it auto-assigned.
- 🔲 Create a new employee in a department → they get that dept's videos.
- 🔲 Staff: watch a video → pass the quiz (≥60%) → admin gets a "quiz completed" notification.

**Valet**
- 🔲 Calculator: property + guests → shows staff breakdown.
- 🔲 Create a booking → past-date / duplicate blocked.
- 🔲 Times show **12-hour** (e.g. 2:00 PM); Export PDF opens with a **Back** button.

---

## PART 4 — Push notifications on REAL phones (10 min) 🔲

- 🔲 **iPhone** (iOS 16.4+): open site in Safari → **Add to Home Screen** → open from the icon → My Account → Enable notifications → Allow.
- 🔲 **Android**: open in Chrome → My Account → Enable → Allow.
- 🔲 Assign a task to that phone's user → **OS banner appears** (even with app closed) → tapping it opens the right screen.
- 🔲 Shared device check: log in as A, then B on the same browser → only **B's** notifications arrive.
- 🔲 Every real staff member enables notifications once on their own phone (else they get no push).

---

## PART 5 — Responsive / language (5 min) 🔲

- 🔲 Narrow the window: Daily Task tabs collapse to a **Task Status** dropdown (<1073px); Repair Request tabs to **Repair Request Status** (<813px).
- 🔲 Dashboard repair cards: priority badge on the **right**, no "other" tag.
- 🔲 Toggle **हिं / EN** (sidebar) → staff screens switch language, no stray English.

---

## PART 6 — Production hygiene (5 min) 🔲

- 🔲 Confirm the **daily reset** cron is scheduled: in Supabase SQL Editor →
  `SELECT jobname, schedule, active FROM cron.job;` → see `reset-recurring-tasks`, `clear-resolved-issues`.
- 🔲 Remove obvious **test data** created during setup (dummy tasks/requests/bookings/videos/users).
- 🔲 Confirm real **staff + admin accounts** exist with correct property/department/role.
- 🔲 Public repair link works (open in a private window, submit a test → delete it).

---

## PART 7 — Final go / no-go 🔲

- 🔲 Live site loads on desktop + phone.
- 🔲 One end-to-end task cycle worked (assign → do → approve) with a notification.
- 🔲 Push arrived on at least one real iPhone and one Android.
- 🔲 No console errors on the main screens (F12 → Console).

---

## Known limitations to mention at handover (not bugs)
- 4-digit PIN + open RLS = pre-production security level (hardening is future work).
- Push needs each user to enable once per device; subscriptions can expire (re-open app to renew).
- iPhone push requires iOS 16.4+ and "Add to Home Screen".
- Some admin screens (Users / Valet / quiz builder) still show English labels.
- On a shared device, the last person logged in stays signed in until explicit logout.

## If something fails during checks
- Push not arriving → check the user has enabled it on that device (subscription exists); iPhone must be installed to Home Screen.
- Notification missing → confirm the Database Webhook (notifications INSERT → send-push) is enabled.
- Anything else → note the exact step + screenshot; most issues are config, not code.
