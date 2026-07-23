# Ambria Ops — Manual QA Test Cases

How to use: run through the relevant section before a release. Each case has
**Steps** and the **Expected** result. Mark ✅/❌. "Staff" = employee login,
"Admin" = admin/super-admin. Test on **Chrome (desktop)** and **a phone** where
noted. Web-push cases need a **normal window** (not Incognito).

Legend: 🔴 critical · 🟡 important · ⚪ nice-to-have

---

## 1. Login & Authentication

- **AUTH-01** 🔴 Login with **username + PIN** → correct credentials → lands on Dashboard.
- **AUTH-02** 🔴 Login with **phone number + PIN** (same user) → succeeds. Try the phone with spaces / `+91` prefix → still succeeds (normalization).
- **AUTH-03** 🔴 Wrong PIN → shows "invalid login" error, stays on login.
- **AUTH-04** 🟡 Inactive user (is_active = false) → login blocked with "account inactive".
- **AUTH-05** 🟡 "Remember me" ON → close & reopen browser → still logged in. OFF → closing the tab logs out.
- **AUTH-06** 🟡 A 4-digit PIN like `1234` → Chrome may warn "breached password"; login still works (browser warning, not an app error).
- **AUTH-07** ⚪ Field label reads "Username or phone".
- **AUTH-08** 🔴 Logout (power icon) → returns to login; protected routes redirect to /login when not authed.

## 2. My Account (self-service)

- **ACCT-01** 🔴 Tap avatar (top-right) → opens My Account on any screen.
- **ACCT-02** 🔴 Set a new 4-digit PIN + confirm → Save → log out → log in with the new PIN.
- **ACCT-03** 🟡 New PIN not 4 digits, or PIN ≠ confirm → validation error, not saved.
- **ACCT-04** 🟡 Change phone to one already used by another user → "phone already in use".
- **ACCT-05** 🟡 Change phone → save → can now log in with the new phone.
- **ACCT-06** ⚪ Leaving PIN fields blank + saving only phone → PIN unchanged.

## 3. Tasks — Staff (My Tasks)

- **TASK-S-01** 🔴 Start a task → must upload a **before** photo → status → In Progress; work timer runs.
- **TASK-S-02** 🔴 Mark for completion → **after** photo required → status → Awaiting Approval.
- **TASK-S-03** 🟡 Try to complete with no photo → blocked with "photo required".
- **TASK-S-04** 🔴 Task **sent back** by admin → shows red "sent back" box with the reason text.
- **TASK-S-05** 🔴 Sent-back task with a **voice note** → staff sees an audio player, can play it.
- **TASK-S-06** 🟡 Resubmit a sent-back task → the sent-back box clears on the staff side.
- **TASK-S-07** 🟡 Approved task → shows "approved / complete" state.
- **TASK-S-08** ⚪ Overdue task (past due_date, not completed) → shows overdue styling.

## 4. Tasks — Admin

- **TASK-A-01** 🔴 Create a task, assign to a staff member → appears in that staff's My Tasks.
- **TASK-A-02** 🔴 Approve a submitted task → status → Completed; staff notified.
- **TASK-A-03** 🔴 Send back: **text only** → allowed. **voice only** → allowed. **neither** → Send Back disabled.
- **TASK-A-04** 🔴 Record a voice note (Send Back) → stop → uploads → appears in `photos/task-voice/`.
- **TASK-A-05** 🟡 Voice recorder auto-stops at **2:00**; shows the `mm:ss / 02:00` counter.
- **TASK-A-06** 🟡 Delete a completed task → its send-back voice note (if any) is removed from storage.
- **TASK-A-07** 🟡 Filters (property / department / category / member) + pagination work; counts per tab correct.
- **TASK-A-08** ⚪ Voice deleted from storage after the task is **approved** (verify file gone).

## 5. Fix Requests (Fix Request / work_board)

- **FIX-01** 🔴 Staff raises a request → appears under **Open**; admins get a "new fix" notification.
- **FIX-02** 🔴 Admin assigns to staff → staff sees it under "Assigned to me"; staff notified.
- **FIX-03** 🔴 Staff: Start → In Progress → submit with photo → Awaiting Approval → admin notified.
- **FIX-04** 🟡 Admin rates the work (stars) then approves → status Completed; staff notified.
- **FIX-05** 🟡 Admin reassigns an unfinished request to another staff.
- **FIX-06** 🟡 Staff scope toggle: "Assigned to me" vs "My Requests" filters correctly.
- **FIX-07** ⚪ Priority + status badges show correct colors/labels.

## 6. Notifications — In-app bell

- **NOTIF-01** 🔴 Staff submits a task → **admin's** bell shows unread badge + "Task submitted for approval".
- **NOTIF-02** 🔴 Admin sends back / approves → **staff's** bell shows the matching alert.
- **NOTIF-03** 🔴 Tapping a task/fix notification **opens that exact item** (deep-link), not just the page.
- **NOTIF-04** 🟡 Bell badge counts unread; "Mark all read" clears them; badge hidden at 0.
- **NOTIF-05** 🟡 Admin alerts respect property scope (admin only sees their property's events; super admin sees all).
- **NOTIF-06** 🟡 Actor doesn't notify themselves (the person causing the event gets no alert).
- **NOTIF-07** ⚪ Notifications older than **6 days** are purged (run `purge_old_notifications()` / daily cron).
- **NOTIF-08** ⚪ Fix Request nav badge: staff = assigned count; admin = awaiting-approval count.

## 7. Web Push (app closed)

- **PUSH-01** 🔴 My Account → Enable → browser prompt → Allow → row appears in `push_subscriptions`.
- **PUSH-02** 🔴 Close the app → trigger a notification → OS banner appears; tapping it opens the right screen.
- **PUSH-03** 🟡 Each user must enable on their **own** device; one browser = one subscription.
- **PUSH-04** 🟡 Notifications blocked in browser → toggle shows "Blocked… allow notifications"; Enable disabled.
- **PUSH-05** 🟡 Incognito → push cannot be enabled (expected).
- **PUSH-06** 🟡 Banner text matches the recipient's **language** (Hindi user gets Hindi banner).
- **PUSH-07** ⚪ Edge Function logs show `sent OK`; dead subscriptions (404/410) auto-removed.
- **PUSH-08** ⚪ iPhone: push only after "Add to Home Screen" (iOS 16.4+).

## 8. Valet

- **VALET-01** 🔴 Calculator: pick property + guest count → shows role breakdown + total.
- **VALET-02** 🔴 Guest count accepts up to **1600**; matches the `max 1600` placeholder/limit.
- **VALET-03** 🟡 Guest count beyond the matrix top tier → numbers extrapolate up (shows "estimated" note).
- **VALET-04** 🟡 Create a booking → validation: past date blocked, >1 year blocked, invalid phone blocked, duplicate property+date blocked.
- **VALET-05** ⚪ Booking creates an admin notification.

## 9. Training

- **TRN-01** 🟡 Staff watches a video; progress recorded; quiz can be started.
- **TRN-02** 🟡 Complete a quiz → score saved → admin gets a "quiz completed" notification.
- **TRN-03** 🟡 Admin assigns a video to staff → assigned staff notified (needs training_assignments table).
- **TRN-04** 🟡 Fire Safety → **property filter (checkbox multi-select)** shows only chosen properties.
- **TRN-05** ⚪ Fire Safety: log an inspection → next-due date set; status chip updates (Overdue/Due/Up to date).

## 10. User Management (super admin)

- **USER-01** 🔴 Create a user (name, username, 4-digit PIN, role, property, department) → can log in.
- **USER-02** 🔴 PIN field enforces 4 digits on create / when changed; existing longer passwords still work until edited.
- **USER-03** 🔴 **Role filter** (Employee/Admin/Super Admin) returns the right users.
- **USER-04** 🔴 **Property filter** includes "All Properties" users under every specific property.
- **USER-05** 🟡 Duplicate username → "username already taken"; duplicate phone → "phone already in use".
- **USER-06** 🟡 "Department Head" toggle elevates to Admin with full tabs.
- **USER-07** 🟡 Visible-tabs toggles control which nav items that user sees.
- **USER-08** ⚪ "Admin" is NOT a department option (it's a role); department is optional.

## 11. Language (Hindi / English)

- **I18N-01** 🔴 Toggle हिं/EN in header → UI switches language app-wide.
- **I18N-02** 🔴 Staff screens (My Tasks, Fix Request, Training, My Account, Dashboard) fully Hindi — no stray English labels.
- **I18N-03** 🟡 Department names show in Hindi (बागवानी, हाउसकीपिंग…) on staff cards.
- **I18N-04** 🟡 New task created by admin → staff on Hindi UI sees the **Hindi title**; English user sees English.
- **I18N-05** 🟡 Admin "Hindi titles" button backfills existing tasks' Hindi titles.
- **I18N-06** ⚪ User-typed data (task text if untranslated, names, property names) stays as entered — expected.

## 12. Daily Reset & Storage Cleanup (scheduled)

- **RESET-01** 🔴 At 6:00 AM IST, daily tasks reset to "pending" (weekly → Monday, monthly → 1st).
- **RESET-02** 🔴 On reset, before/after **photos are deleted** from storage (service_role key in Vault).
- **RESET-03** 🟡 On reset, the send-back **voice note** is deleted and `rejection_voice_url` cleared.
- **RESET-04** 🟡 `purge_orphan_photos()` removes unreferenced files in `tasks/` + `task-voice/`, leaves `work_board/` + attendance untouched.
- **RESET-05** ⚪ Storage delete calls return HTTP **200** (`net._http_response`).

## 13. PWA / Cross-device

- **PWA-01** 🟡 "Add to Home Screen" installs with the maroon "A" icon and title "Ambria Ops".
- **PWA-02** ⚪ Loads offline after first visit (cached shell); Supabase photos cached for viewing.
- **PWA-03** ⚪ Works on the GitHub Pages base path `/Ambria---Workforce/`.

## 14. Access Control / Scoping

- **ACL-01** 🔴 Employee cannot reach admin-only routes (/tasks, /users, /valet, /vendors) → redirected to Dashboard.
- **ACL-02** 🔴 Non-super-admin cannot reach /users.
- **ACL-03** 🟡 Property-scoped admin sees only their property's data; super admin (and 'all' users) see everything.

---

## Negative / edge cases worth a pass
- Slow / offline network during photo or voice upload → clear error, no crash.
- Very large voice recording (>5 MB) → rejected before upload.
- Unsupported browser for voice/push → graceful "not supported" message, rest of app works.
- Two devices logged in as the same user → both receive that user's push.
- Task with no assignee → no "assigned" notification fired.

## Known limitations (not bugs — don't file these)
- Personal names are never translated/transliterated.
- 4-digit PIN + open storage/RLS is pre-production security debt (hardening pending).
- Admin management screens (Users/Valet/Vendors/quiz builder) still show English labels.
- Push banner text is English unless the recipient's `users.lang` = 'hi'.
