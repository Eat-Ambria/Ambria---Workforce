# Ambria Ops — Manual QA Test Cases

How to use: run through the relevant section before a release. Each case has
**Steps** and the **Expected** result. Mark ✅/❌. "Staff" = employee login,
"Admin" = admin/super-admin. Test on **Chrome (desktop)** and **a phone** where
noted. Web-push cases need a **normal window** (not Incognito).

Legend: 🔴 critical · 🟡 important · ⚪ nice-to-have
Status: ✅ = verified live via API on 2026-07-24 · 🔷 = manual/UI (run by hand)

---

## Verification log (automated, 2026-07-24)

Backend logic tested directly against Supabase (rows created + deleted as tests):

| Area | Result |
|---|---|
| `task_assigned` on task insert → assignee | ✅ PASS |
| Raise issue → task stays **Pending**, `task_issue` → all property admins | ✅ PASS (decoupling confirmed) |
| `task_submitted` on → completion_requested → admins | ✅ PASS |
| `task_approved` on → completed → assignee | ✅ PASS |
| `fix_new` on open request → admins (actor excluded) | ✅ PASS |
| `fix_assigned` on assignment → assignee | ✅ PASS |
| Admin fan-out scope (super-admin + property admins, not the actor) | ✅ PASS |
| Push delivery (function + webhook + subscription) | ✅ PASS (confirmed earlier on device) |
| Auto-assign training by department | ⚠️ NOT ACTIVE — run `SUPABASE-MIGRATION-AUTOASSIGN-TRAINING.sql` |

Frontend build: ✅ compiles clean (`npm run build`).

---

## 1. Login & Authentication

- **AUTH-01** 🔴 🔷 Login with **username + PIN** → correct → lands on Dashboard.
- **AUTH-02** 🔴 🔷 Login with **phone + PIN** (spaces / `+91` prefix) → succeeds (normalized).
- **AUTH-03** 🔴 🔷 Wrong PIN → "invalid login", stays on login.
- **AUTH-04** 🟡 🔷 Inactive user → login blocked with "account inactive".
- **AUTH-05** 🔴 🔷 **(CHANGED)** Session persists until logout: login → **close & reopen the app / PWA (without logging out)** → still logged in, no login screen. ("Remember me" was removed.)
- **AUTH-06** 🔴 🔷 **Logout** → returns to login; protected routes redirect to /login when not authed.
- **AUTH-07** ⚪ 🔷 Field label reads "Username or phone".

## 2. My Account (self-service)

- **ACCT-01** 🔴 🔷 Tap avatar (top-right) → opens My Account on any screen.
- **ACCT-02** 🔴 🔷 Set new 4-digit PIN + confirm → Save → log out → log in with new PIN.
- **ACCT-03** 🟡 🔷 PIN not 4 digits / PIN ≠ confirm → validation error, not saved.
- **ACCT-04** 🟡 🔷 Change phone to one already used → "phone already in use".
- **ACCT-05** 🟡 🔷 Change phone → save → can log in with the new phone.

## 3. Tasks — Staff (My Tasks)

- **TASK-S-01** 🔴 🔷 Start a task → **before** photo required → In Progress; timer runs.
- **TASK-S-02** 🔴 🔷 Mark for completion → **after** photo required → Awaiting Approval.
- **TASK-S-03** 🟡 🔷 Complete with no photo → blocked ("photo required").
- **TASK-S-04** 🔴 🔷 Task sent back → red "sent back" box with reason + voice player if present.
- **TASK-S-05** 🟡 🔷 Resubmit → sent-back box clears.
- **TASK-S-06** 🟡 🔷 **(NEW)** Two independent filters: **Task Status** (inbox icon) and **Issue Status** (⚠ icon). Picking one resets the other to "All".
- **TASK-S-07** ⚪ 🔷 Overdue task shows overdue styling.

## 4. Issues (independent of task status) — **NEW**

Issue is now a separate dimension (`issue_status`) that never changes the task's lifecycle status.

- **ISSUE-01** 🔴 ✅ Staff reports an issue on a **Pending** task → task **stays Pending**; a red "Issue" badge appears; admins get a `task_issue` notification. *(verified live)*
- **ISSUE-02** 🔴 🔷 Admin taps **Start working** → employee sees "Admin working"; task status unchanged.
- **ISSUE-03** 🔴 🔷 Admin **Mark resolved** → task returns to **Pending** (employee can continue); employee sees green "Resolved" badge + gets notified.
- **ISSUE-04** 🟡 🔷 Both badges can show together (e.g. Pending + Resolved) on staff & admin cards.
- **ISSUE-05** 🟡 ⏳ A **resolved** issue auto-clears after **1 day** (hourly `clear_resolved_issues` cron) — badge disappears, task stays. *(time-based; verify next day or run `SELECT clear_resolved_issues();`)*
- **ISSUE-06** 🟡 🔷 Daily reset only clears **resolved** issues; an unresolved issue survives the reset.
- **ISSUE-07** 🟡 🔷 Report Issue button hidden while an issue is already open/being-worked.

## 5. Tasks — Admin (Daily Task)

- **TASK-A-01** 🔴 ✅ Create + assign a task → appears in staff's My Tasks; staff notified (`task_assigned`). *(verified live)*
- **TASK-A-02** 🔴 ✅ Approve a submitted task → Completed; staff notified (`task_approved`). *(verified live)*
- **TASK-A-03** 🔴 🔷 Send back: text-only / voice-only allowed; neither → button disabled.
- **TASK-A-04** 🔴 🔷 Record a voice note (≤2:00) → uploads to `photos/task-voice/`.
- **TASK-A-05** 🟡 🔷 **(NEW)** **Issues** is a separate red button (with ⚠ + count), split out from the status tabs.
- **TASK-A-06** 🟡 🔷 **(NEW)** Below **1073px**, the status tabs collapse into a **"Task Status"** dropdown; Issues stays a separate button.
- **TASK-A-07** 🟡 ✅ **(NEW)** Issues count auto-refreshes (30s poll + on focus) — raise an issue as staff, admin's Issues badge updates without reload. *(notification creation verified live)*
- **TASK-A-08** 🔴 🔷 **(NEW)** Open any task → footer has a red **🗑 Delete** button (all statuses, admin-only) → confirm → task removed from Supabase.
- **TASK-A-09** 🟡 🔷 Filters (property/department/category/member) + pagination; per-tab counts correct.

## 6. Fix Requests (Repair Request / work_board)

- **FIX-01** 🔴 ✅ New request (unassigned) → **Open**; admins get `fix_new` (poster excluded). *(verified live)*
- **FIX-02** 🔴 ✅ Assign to staff → staff sees under "Assigned to me"; `fix_assigned` to staff. *(verified live)*
- **FIX-03** 🔴 🔷 Staff: Start → submit with photo → Awaiting Approval → admin gets `fix_approval`.
- **FIX-04** 🟡 🔷 Admin rates (stars) + approves → Completed; staff gets `fix_approved`.
- **FIX-05** 🟡 🔷 **(NEW)** The **poster** can delete their own request (Delete button) while it's not Completed/Approved; once completed, only admin can delete.
- **FIX-06** 🟡 🔷 **(NEW)** Below **813px**, status tabs collapse into a **"Repair Request Status"** dropdown.
- **FIX-07** 🟡 🔷 **(NEW)** Create form validation is **inline**: Title shows `*` and an error under the field; submit scrolls to & focuses the first invalid field; error clears as you type.
- **FIX-08** ⚪ 🔷 Priority + status badges show correct colors/labels.

## 7. Notifications — In-app bell

Notifications are created by **database triggers** (single source). The frontend never inserts them.

- **NOTIF-01** 🔴 ✅ Staff submits → admin's bell shows "Task submitted for approval". *(verified live)*
- **NOTIF-02** 🔴 🔷 Admin sends back / approves → staff's bell shows the matching alert.
- **NOTIF-03** 🔴 🔷 Tapping a notification opens the exact item **and the right tab/filter** (e.g. issue → Issues tab; approved → Completed filter).
- **NOTIF-04** 🟡 🔷 Bell counts unread; "Mark all read" clears; badge hidden at 0.
- **NOTIF-05** 🟡 ✅ Admin alerts respect property scope; super-admin sees all. *(verified live)*
- **NOTIF-06** 🟡 ✅ Actor never notifies themselves. *(verified live — poster/assignee excluded)*
- **NOTIF-07** 🟡 🔷 **(NEW)** Realtime: with the app open, a new notification updates the bell **instantly** (no 60s wait). Needs `notifications` in the realtime publication.
- **NOTIF-08** ⚪ 🔷 Old notifications purged by the cleanup cron.

## 8. Web Push (app closed)

- **PUSH-01** 🔴 🔷 My Account → Enable → Allow → row in `push_subscriptions`.
- **PUSH-02** 🔴 ✅ Trigger a notification → OS banner appears; tap opens the right screen. *(delivery chain verified live on device)*
- **PUSH-03** 🔴 🔷 **(NEW/shared-device)** Log in as user A on a browser, then log in as user B on the **same** browser → the device now delivers **only B's** notifications (subscription re-binds on login). On logout, the device stops receiving.
- **PUSH-04** 🟡 🔷 Notifications delivered at **high urgency** — arrive promptly, not batched/delayed.
- **PUSH-05** 🟡 🔷 Blocked in browser → toggle shows "Blocked"; Enable disabled. Incognito → cannot enable.
- **PUSH-06** 🟡 🔷 Banner text matches recipient's language (`users.lang`).
- **PUSH-07** 🟡 🔷 **iPhone:** push only on **iOS 16.4+** **and** after **Add to Home Screen** (opened from the icon).
- **PUSH-08** ⚪ 🔷 Expired subscription → user re-opens app → re-subscribes automatically; dead subs (404/410) auto-removed server-side.

## 9. Valet

- **VALET-01** 🔴 🔷 Calculator: property + guest count → role breakdown + total; extrapolates beyond top tier ("estimated").
- **VALET-02** 🔴 🔷 Create booking validation: past date / >1 year / invalid phone / duplicate property+date blocked.
- **VALET-03** 🟡 ✅ New booking creates an admin notification (`valet_booking` trigger). *(trigger present)*
- **VALET-04** 🟡 🔷 **(NEW)** Event times display in **12-hour AM/PM** everywhere (cards, lists, PDF) — `14:00` shows as `2:00 PM`.
- **VALET-05** 🟡 🔷 **(NEW)** Edit booking → Time field is a **time picker** (12-hour), stores clean `HH:MM`.
- **VALET-06** 🟡 🔷 **(NEW)** Export PDF → opens in a new tab with a **Back** and **Print / Save PDF** toolbar (hidden in the printout) — usable on mobile.

## 10. Training

- **TRN-01** 🟡 🔷 Staff watches video → progress recorded → quiz can start; pass ≥60%.
- **TRN-02** 🟡 🔷 Complete quiz → score saved → admins get `quiz_completed`.
- **TRN-03** 🟡 🔷 Admin manually assigns a video → assigned staff notified (`training_assigned`).
- **TRN-04** 🔴 ⚠️ **(NEW)** **Auto-assign by department:** a new employee gets all their department's active videos; uploading a video assigns it to all staff in that department. **Requires running `SUPABASE-MIGRATION-AUTOASSIGN-TRAINING.sql` (currently NOT active).**
- **TRN-05** 🟡 🔷 Fire Safety: property multi-select filter; log inspection → next-due date + status chip.

## 11. User Management (super admin)

- **USER-01** 🔴 🔷 Create user (name, username, 4-digit PIN, role, property, department) → can log in.
- **USER-02** 🔴 🔷 PIN enforces 4 digits on create/change.
- **USER-03** 🔴 🔷 Role / property filters return the right users ("All Properties" users show under each property).
- **USER-04** 🟡 🔷 Duplicate username/phone → clear error.
- **USER-05** 🟡 🔷 "Department Head" toggle elevates to Admin with full tabs.
- **USER-06** ⚪ 🔷 "Admin" is a role, not a department; department optional.

## 12. Language (Hindi / English)

- **I18N-01** 🔴 🔷 Toggle हिं/EN → UI switches app-wide (toggle now in the sidebar).
- **I18N-02** 🔴 🔷 Staff screens fully Hindi — incl. new labels (Task Status / Issue Status / Repair Request Status).
- **I18N-03** 🟡 🔷 Department names in Hindi on cards.
- **I18N-04** 🟡 🔷 New task → Hindi user sees the Hindi title.

## 13. Daily Reset & Storage Cleanup (scheduled)

- **RESET-01** 🔴 ⏳ 6:00 AM IST: daily tasks → pending (weekly Mon, monthly 1st).
- **RESET-02** 🔴 ⏳ On reset, before/after photos + voice notes deleted from storage.
- **RESET-03** 🟡 ⏳ **(NEW)** On reset, **resolved** issue fields cleared; **unresolved** issues kept.
- **RESET-04** ⚪ ⏳ Storage delete calls return HTTP 200 (`net._http_response`).

## 14. Access Control / Scoping

- **ACL-01** 🔴 🔷 Employee cannot reach /tasks, /users, /valet, /vendors → redirected to Dashboard.
- **ACL-02** 🔴 🔷 Non-super-admin cannot reach /users.
- **ACL-03** 🟡 ✅ Property-scoped admin sees only their property's data; super-admin sees all. *(fan-out scope verified live)*

## 15. Dashboard

- **DASH-01** 🟡 🔷 KPI tiles (Total/Overdue/Pending/In Progress/Awaiting/Completed) — counts correct; tapping filters My Tasks.
- **DASH-02** 🟡 🔷 **(NEW)** Repair-request cards: priority badge is **right-aligned** next to the chevron; the meaningless "other" category badge is gone.
- **DASH-03** ⚪ 🔷 A task with an active issue still counts in its real lifecycle bucket (issue no longer hides it).

---

## Required SQL migrations (run in Supabase SQL Editor, idempotent)

| Migration | Purpose | Status |
|---|---|---|
| `SUPABASE-MIGRATION-NOTIFICATIONS.sql` | Notification triggers (incl. `task_issue` on `issue_status`) | ✅ active |
| `SUPABASE-MIGRATION-ISSUE-AUTOCLEAR.sql` | `issue_status` column + 1-day auto-clear cron | ✅ active |
| `SUPABASE-DAILY-RESET.sql` | Daily reset (clears resolved issues only) | run if not yet |
| `SUPABASE-MIGRATION-AUTOASSIGN-TRAINING.sql` | Auto-assign training by department | ⚠️ **NOT run yet** |
| Database Webhook: `notifications` INSERT → `send-push` | Push delivery | ✅ active |

---

## Negative / edge cases worth a pass
- Slow/offline during photo/voice upload → clear error, no crash.
- Task with no assignee → no `task_assigned` fired.
- Shared device: after logout, the previous user's notifications stop arriving.
- Deleting a recurring task removes the SOP permanently (expected) — use Delete carefully on recurring tasks.

## Known limitations (not bugs)
- Personal names are never translated.
- 4-digit PIN + open RLS is pre-production security debt.
- Some admin screens still show English labels.
- On a shared device, the last logged-in user stays signed in until explicit logout.
