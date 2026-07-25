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
| `supabase/db/migrations/` | Database scripts — run by pasting into the Supabase SQL Editor |
| `supabase/functions/` | Edge functions (`send-push`, `lms-proxy`) |

> `supabase/db/migrations/` is deliberately **not** `supabase/migrations/` — that
> path is reserved by the Supabase CLI. See the note at the end of
> [Md/HOW-IT-WORKS.md](Md/HOW-IT-WORKS.md#12-running-it-locally).
