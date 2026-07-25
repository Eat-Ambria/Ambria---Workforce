# Ambria Ops

Workforce management PWA for Ambria event venues — React 18 + Vite 5 + Supabase,
deployed to GitHub Pages.

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev
```

## Where everything lives

| | |
|---|---|
| **[Md/HOW-IT-WORKS.md](Md/HOW-IT-WORKS.md)** | **Start here** — architecture and every flow, end to end |
| [Md/README.md](Md/README.md) | Folder map, env vars, deploy details |
| [Md/](Md/) | All other docs: setup guides, checklists, test cases |
| `src/` | The React app |
| `supabase/db/migrations/` | Database scripts — **gitignored, local only** (see below) |
| `supabase/functions/` | Edge functions (`send-push`, `lms-proxy`) |

> **The SQL scripts are not in this repo.** `supabase/db/migrations/` is
> gitignored like `.env` — the schema, triggers and cron jobs are kept locally
> and pasted into the Supabase SQL Editor by hand. Ask the maintainer for a copy
> if you need to stand up a new database.
>
> (The path is also deliberately **not** `supabase/migrations/`, which the
> Supabase CLI reserves for its own migration history.)
