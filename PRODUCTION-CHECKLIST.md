# Ambria Ops — Production Readiness Checklist

Work top to bottom. Anything marked 🔴 is a **launch blocker** — do not put real staff data in until these are done.

---

## 🔴 1. Security (must fix before real users)

The app currently stores passwords in **plain text** and every table has an
"allow everyone everything" rule. Because the anon key ships inside the
frontend, anyone who opens the site can read the whole database (including
passwords) from their browser console.

- [ ] **Hash passwords** (Postgres `pgcrypto` / bcrypt) instead of plain text.
- [ ] **Move login to a server-side RPC / Edge Function** so the anon key can never `SELECT` from `users`.
- [ ] **Replace the `"Allow all"` RLS policies** with real per-role rules (see `SUPABASE-COMPLETE-SCHEMA.sql` line ~412).
- [ ] Note: this will change User Management from "view password" to "reset password only".

> Ask the dev/assistant to "harden the auth" when ready — it's a known, scoped task.

---

## 2. Database setup

- [ ] Run `SUPABASE-COMPLETE-SCHEMA.sql` (creates all tables) — if not already done.
- [ ] Run `SUPABASE-MIGRATION-INDEXES.sql` — adds performance indexes **and** the
      query/idle timeouts that keep the DB healthy under concurrent load.
- [ ] Run any other pending `SUPABASE-MIGRATION-*.sql` files.
- [ ] Confirm the `photos` storage bucket exists and is set up for uploads.

---

## 3. Supabase plan & limits (the real scalability lever for 100–200 users)

The frontend is static (can't crash). The bottleneck is the Supabase project.

- [ ] **Upgrade off the Free tier to at least Pro.** Free has hard caps on
      compute, connections, and bandwidth that 100–200 active users will hit.
- [ ] Pick an instance size with enough **compute/RAM** for your peak concurrent users.
- [ ] Confirm the API uses the **connection pooler** (default for the REST API — good).
- [ ] Review Supabase's built-in **API rate limits / abuse protection** in the dashboard.
- [ ] Turn on **daily backups** (Pro) — or schedule your own `pg_dump`.
- [ ] Set up **billing alerts** so you're warned before hitting limits.

---

## 4. Config & secrets

- [ ] Production `.env` has the correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [ ] The anon key is the **anon/public** key (never the `service_role` key — that must stay server-side only).
- [ ] `vite.config.js` `base` matches the deploy path (currently `/Ambria---Workforce/`).

---

## 5. Deploy

- [ ] `npm run build` succeeds with no errors.
- [ ] Deploy `dist/` to GitHub Pages (or chosen host).
- [ ] Verify the live URL loads, login works, and the PWA "Install" prompt appears on mobile.
- [ ] Hard-refresh once after deploy so the service worker picks up the new build.

---

## 6. Optional hardening (nice to have, not required day one)

- [ ] Put **Cloudflare** (free) in front of the site → CDN + real per-IP rate limiting / WAF.
- [ ] Add basic error/uptime monitoring (e.g. Sentry for JS errors, an uptime pinger).
- [ ] Add app **shortcuts** and iOS meta tags to the PWA manifest for a nicer install.

---

## Already done ✅ (recent hardening pass)
- Error boundary (no more blank-screen crashes)
- UUID ids for new tasks/users (no collisions under concurrency)
- Server-side filtering + counts + pagination (AdminTasks, Users, Dashboard)
- DB performance indexes + query timeouts (in the indexes migration)
- Auto-refresh pauses on hidden tabs + jitter (less backend load)
