# Ambria Ops

Workforce management PWA for Ambria event venues (React 18 + Vite 5 + Supabase).

## Quick start

```bash
npm install
cp .env.example .env      # then paste your Supabase anon key into .env
npm run dev               # http://localhost:5173
npm run build             # production build -> dist/
npm run preview           # preview the production build
```

### Environment variables (`.env`)
Get these from Supabase Dashboard → Project Settings → API:
- `VITE_SUPABASE_URL` — Project URL
- `VITE_SUPABASE_ANON_KEY` — the **anon public** key (safe for a frontend PWA)

## Folder structure

```
src/
├── main.jsx                 # entry: mounts providers (Theme, Lang, Auth) + Router
├── App.jsx                  # role-based routes + auth guards
├── index.css                # global styles
├── lib/                     # supabase client, storage upload, image compression, time helpers
├── constants/               # colors, org data, nav config, task status, valet matrix
├── translations/            # bilingual T object (English / Hindi)
├── context/                 # AuthContext, ThemeContext, LangContext
├── hooks/                   # useMediaQuery / useIsMobile
├── components/
│   ├── common/              # Icon (SVG), Modal, UI kit, PhotoCapture
│   └── layout/              # AppLayout, Header, Sidebar, BottomTabBar
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx        # role-aware
    ├── employee/            # MyTasks (Start Work -> photo -> Mark for Completion)
    ├── admin/               # AdminTasks (approval flow), Valet, Vendors
    └── shared/              # TaskBoard, Team (Attendance/Leave/Members), Training
        └── training/        # Videos (role-locked + progress bar), ChemicalUsage, FireSafety
```

## Roles
- `sa` Super Admin · `a` Admin · `e` Employee
- Sidebar/routes adapt to role (see `src/constants/nav.js`).

## Database
Run `SUPABASE-COMPLETE-SCHEMA.sql` once in the Supabase SQL Editor (or
`SUPABASE-MIGRATION-2026-07.sql` to add just the newer columns/tables).

## Deploy
Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and
publishes to GitHub Pages. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
as repo Action secrets. `vite.config.js` `base` must match the repo name.
```

## Notes
- SVG icons only (`src/components/common/Icon.jsx`) — no emoji in the UI.
- All photos compress to ~80 KB before upload (`src/lib/imageCompress.js`).
- All display text goes through the `T` translation object.
