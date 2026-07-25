# AMBRIA OPS — Complete Project Context
## For New Developer Handover
### Last Updated: July 2026

---

# 1. PROJECT OVERVIEW

**App Name:** Ambria Ops (previously: Ambria Workforce, Ambria Pulse)
**Company:** Ambria (Get Your Venue Events Pvt Ltd)
**Business:** Luxury event venue company in New Delhi with 4 properties
**Purpose:** Workforce management app replacing ad-hoc operations with structured SOPs and digital accountability

**Live URL:** https://eat-ambria.github.io/Ambria---Workforce/
**GitHub Repo:** https://github.com/eat-ambria/Ambria---Workforce
**Supabase Project:** https://supabase.com/dashboard (project: kwqbgymqbcfvtvelunxo)
**Supabase Region:** Mumbai (ap-south-1)
**Supabase URL:** https://kwqbgymqbcfvtvelunxo.supabase.co

---

# 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage (bucket: "photos") |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (deploy.yml) |
| Development Tool | Claude Code (Anthropic CLI) |
| Package Manager | npm |
| Version Control | Git + GitHub |

**Local Development:**
```bash
cd ~/Desktop/ambria-workforce   # or wherever cloned
npm install
npm run dev                      # starts on localhost:5173
npm run build                    # production build → dist/
```

**Deployment Flow:**
```
Developer edits code → git push origin main → GitHub Actions triggers →
npm install + npm run build → deploys dist/ to GitHub Pages → live in 3 min
```

**vite.config.js base path:** `/Ambria---Workforce/` (must match repo name exactly)

---

# 3. ORGANIZATION STRUCTURE

## Hierarchy
```
Harsh Vardhan (Founder)
└── Abhishek (Efficiency Manager / Super Admin)
    └── Vicky Arya (Overall Head)
        ├── Sonu Mali (Site Head — Pushpanjali)
        │   ├── Horticulture: Pawan, Dayashankar, Sunil
        │   └── Housekeeping: Poonam (2IC), Neeru, Umesh, Dinesh, Lalita
        ├── Mahesh (Supervisor — Exotica)
        │   ├── Horticulture: Sonu2, Dhruv, Kamlesh
        │   └── Housekeeping: Sunita, Brijesh, Ragini, Rani
        ├── Rahees (Supervisor — Manaktala)
        │   ├── Horticulture: Mukesh, Tulsi, Akash(H)
        │   └── Housekeeping: Sadna, Lovekush, Akash, Ajay
        ├── Sandeep (Security Head — All Venues)
        │   ├── Santosh (Security — Restro)
        │   ├── Bhupender (Security — Exotica)
        │   ├── Ajay Sec (Security — Manaktala)
        │   └── 3rd Party Guards (All venues)
        ├── Simran (HR — Exotica, monitors Mahesh)
        └── Restro (Direct under Vicky)
            ├── Housekeeping: Suresh, Roma, Anita, Arjun, Vinay
            └── Horticulture: Ramu
```

## Properties

| Property | Code | Acreage | Key Specs |
|----------|------|---------|-----------|
| Pushpanjali (Dwarka) | pp | 3 Acres | Banquet 14K sqft, Lawn 40K sqft, Villa 4 rooms, 5 offices, 125+ parking, 7 WCs |
| Exotica (Dwarka) | ex | 4 Acres | Aura Hall 8.5K + Lawn 27K, Valencia 12K + Lawn 8K, 300-350 parking, 10 WCs |
| Manaktala (Kapashera) | mk | 3 Acres | Emerald Hall 10K + Lawn 27K, Alstonia 16K, 250+ parking, 8 WCs |
| Restro (Palam Vihar) | rs | 0.75 Acre | Glasshouse 8K sqft, Lawn 5K sqft, 100+ parking, 4 WCs |

## Departments

| Code | Name | Color |
|------|------|-------|
| h | Horticulture | #16A34A (green) |
| k | Housekeeping | #2563EB (blue) |
| a | Admin | #7B1E2F (maroon) |
| s | Security | #6B21A8 (purple) |
| sales | Sales | #D97706 (amber) |
| tech | Technology | #0891B2 (cyan) |
| ops | Operations | #4F46E5 (indigo) |
| hr | HR | #D4537E (pink) |
| finance | Finance | #059669 (green) |
| marketing | Marketing | #DC2626 (red) |

## Security Team Per Property

| Property | Day Shift (Ambria) | Day (3rd Party) | Night (3rd Party) |
|----------|-------------------|-----------------|-------------------|
| Pushpanjali | Sandeep oversees | 2 guards | 2 guards |
| Exotica | Bhupender | 1 kitchen guard | 2 guards |
| Manaktala | Ajay (Sec) | — | 1 guard |
| Restro | Santosh | — | 1 guard |

---

# 4. USER ROLES & ACCESS

| Role | Code | Access Level |
|------|------|-------------|
| Super Admin | sa | Everything — all properties, all features, all data |
| Admin | a | Their property data + assigned tasks + team management |
| Employee | e | Their own tasks, attendance, training (dept-locked) |
| Office Staff | a (custom) | Custom access set by SA via permissions checkboxes |

## Login Credentials

### Super Admin
| Name | Username | Password | DB ID |
|------|----------|----------|-------|
| Abhishek | abhishek | ambria@2026 | abhishek |

### Admins
| Name | Username | Password | DB ID | Property |
|------|----------|----------|-------|----------|
| Vicky Arya | vicky | vicky@123 | vicky | All |
| Sonu Mali | sonu | sonu@123 | pp_sonu | Pushpanjali |
| Mahesh | mahesh | mahesh@123 | ex_mahesh | Exotica |
| Rahees | rahees | rahees@123 | mk_rahees | Manaktala |
| Sandeep | sandeep | sandeep@123 | sandeep | All (Security) |
| Simran | simran | simran@123 | ex_simran | Exotica (HR) |

### Employees — Pushpanjali
| Name | Username | Password | DB ID | Dept |
|------|----------|----------|-------|------|
| Pawan | pawan | pawan@123 | pp_pawan | Horticulture |
| Dayashankar | dayashankar | daya@123 | pp_dayashankar | Horticulture |
| Sunil | sunil | sunil@123 | pp_sunil | Horticulture |
| Poonam | poonam | poonam@123 | pp_poonam | Housekeeping |
| Neeru | neeru | neeru@123 | pp_neeru | Housekeeping |
| Umesh | umesh | umesh@123 | pp_umesh | Housekeeping |
| Dinesh | dinesh | dinesh@123 | pp_dinesh | Housekeeping |
| Lalita | lalita | lalita@123 | pp_lalita | Housekeeping |

### Employees — Exotica
| Name | Username | Password | DB ID | Dept |
|------|----------|----------|-------|------|
| Sonu 2 | sonu2 | sonu2@123 | ex_sonu2 | Horticulture |
| Dhruv | dhruv | dhruv@123 | ex_dhruv | Horticulture |
| Kamlesh | kamlesh | kamlesh@123 | ex_kamlesh | Horticulture |
| Sunita | sunita | sunita@123 | ex_sunita | Housekeeping |
| Brijesh | brijesh | brijesh@123 | ex_brijesh | Housekeeping |
| Ragini | ragini | ragini@123 | ex_ragini | Housekeeping |
| Rani | rani | rani@123 | ex_rani | Housekeeping |

### Employees — Manaktala
| Name | Username | Password | DB ID | Dept |
|------|----------|----------|-------|------|
| Mukesh | mukesh | mukesh@123 | mk_mukesh | Horticulture |
| Tulsi | tulsi | tulsi@123 | mk_tulsi | Horticulture |
| Akash (H) | akash_h | akash@123 | mk_akash_h | Horticulture |
| Sadna | sadna | sadna@123 | mk_sadna | Housekeeping |
| Lovekush | lovekush | lovekush@123 | mk_lovekush | Housekeeping |
| Akash | akash | akash@123 | mk_akash | Housekeeping |
| Ajay | ajay | ajay@123 | mk_ajay | Housekeeping |

### Employees — Restro
| Name | Username | Password | DB ID | Dept |
|------|----------|----------|-------|------|
| Suresh | suresh | suresh@123 | rs_suresh | Housekeeping |
| Roma | roma | roma@123 | rs_roma | Housekeeping |
| Anita | anita | anita@123 | rs_anita | Housekeeping |
| Arjun | arjun | arjun@123 | rs_arjun | Housekeeping |
| Vinay | vinay | vinay@123 | rs_vinay | Housekeeping |
| Ramu | ramu | ramu@123 | rs_ramu | Horticulture |

### Security
| Name | Username | Password | DB ID | Property |
|------|----------|----------|-------|----------|
| Santosh | santosh | santosh@123 | rs_santosh | Restro |
| Bhupender | bhupender | bhupender@123 | ex_bhupender | Exotica |
| Ajay (Sec) | ajay_s | ajay@123 | mk_ajay_s | Manaktala |

---

# 5. DATABASE SCHEMA (Supabase PostgreSQL)

## Table: users
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'e',        -- sa, a, e
  property TEXT NOT NULL DEFAULT 'pp',   -- pp, ex, mk, rs, all
  department TEXT,                        -- h, k, a, s, sales, tech, ops, hr, finance, marketing
  phone TEXT,
  joining_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  left_date DATE,
  designation TEXT,
  access JSONB DEFAULT '[]',             -- custom section access for office staff
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: tasks
```sql
-- Employee "My Tasks" workflow status flow:
--   pending -> in_progress (Start Work) -> completion_requested (photo + Mark for Completion)
--   -> completed (admin approves) | issue (reported)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  property TEXT NOT NULL,
  department TEXT NOT NULL,
  category TEXT NOT NULL,                -- daily, weekly, monthly
  title TEXT NOT NULL,
  title_hi TEXT,
  area TEXT,
  priority TEXT DEFAULT 'medium',
  duration TEXT,
  description TEXT,
  description_hi TEXT,
  time_block TEXT,
  assigned_to TEXT REFERENCES users(id),
  assignee_name TEXT,
  status TEXT DEFAULT 'pending',         -- pending, in_progress, completion_requested, completed, issue
  is_team BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,                -- set on "Start Work"
  started_by TEXT,
  completion_photo JSONB DEFAULT '[]',   -- camera photo URLs, mandatory before completion request
  completion_note TEXT,                  -- employee note on marking for completion
  completion_requested_at TIMESTAMPTZ,   -- set on "Mark for Completion"
  completed_at TIMESTAMPTZ,              -- set when admin approves
  completed_by TEXT,
  approved_by TEXT,                      -- admin/SA who approved
  approved_at TIMESTAMPTZ,
  rejection_note TEXT,                   -- admin note if sent back
  notes TEXT,
  task_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: photos
```sql
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  user_id TEXT REFERENCES users(id),
  photo_url TEXT NOT NULL,
  caption TEXT,
  taken_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: attendance
```sql
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  date DATE DEFAULT CURRENT_DATE,
  check_in TIME,
  check_out TIME,
  status TEXT DEFAULT 'present',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
```

## Table: assigned_tasks (LEGACY — being replaced by work_board)
```sql
CREATE TABLE assigned_tasks (
  id TEXT PRIMARY KEY,
  from_user TEXT REFERENCES users(id),
  from_name TEXT,
  to_user TEXT REFERENCES users(id),
  to_name TEXT,
  to_color TEXT,
  property TEXT,
  text TEXT NOT NULL,
  photo_url TEXT,
  status TEXT DEFAULT 'sent',            -- sent, approval_requested, approved, rejected, completed
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  completion_photo TEXT,                  -- JSON array of URLs
  remarks_sa TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: assigned_task_replies (LEGACY)
```sql
CREATE TABLE assigned_task_replies (
  id SERIAL PRIMARY KEY,
  task_id TEXT REFERENCES assigned_tasks(id) ON DELETE CASCADE,
  by_user TEXT,
  by_name TEXT,
  text TEXT,
  photo_url TEXT,
  reply_type TEXT DEFAULT 'reply',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: work_board (NEW — unified Fix Request)
```sql
CREATE TABLE work_board (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  property TEXT NOT NULL,
  posted_by TEXT NOT NULL,
  posted_by_name TEXT NOT NULL,
  department TEXT,
  priority TEXT DEFAULT 'normal',         -- low, normal, high, urgent
  photos JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open',             -- open, assigned, in_progress, approval_requested, approved, rejected, completed
  picked_by TEXT,
  picked_by_name TEXT,
  assigned_to TEXT,
  assigned_to_name TEXT,
  due_date DATE,
  resolution_note TEXT,
  resolution_photos JSONB DEFAULT '[]',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: task_board_replies
```sql
CREATE TABLE task_board_replies (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES work_board(id) ON DELETE CASCADE,
  by_user TEXT NOT NULL,
  by_name TEXT NOT NULL,
  text TEXT,
  photos JSONB DEFAULT '[]',
  reply_type TEXT DEFAULT 'comment',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: notifications
```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  task_text TEXT,
  by_user TEXT,
  by_name TEXT,
  for_user TEXT,
  property TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: duty_roster
```sql
CREATE TABLE duty_roster (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  property TEXT,
  shift_type TEXT DEFAULT 'day',         -- day, night, off, half, 3rd_party
  shift_start TIME,
  shift_end TIME,
  date DATE DEFAULT CURRENT_DATE,
  assigned_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- UNIQUE INDEX: duty_roster_user_date ON duty_roster(user_id, date)
```

## Table: leaves
```sql
CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  leave_date DATE NOT NULL,
  leave_type TEXT DEFAULT 'casual',      -- casual, sick, other
  reason TEXT,
  status TEXT DEFAULT 'pending',         -- pending, approved, rejected
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: training_videos
```sql
CREATE TABLE training_videos (
  id SERIAL PRIMARY KEY,
  department TEXT NOT NULL,              -- h, k, a, s
  topic TEXT NOT NULL,
  topic_hi TEXT,
  youtube_url TEXT NOT NULL DEFAULT '',
  youtube_id TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: training_progress
```sql
CREATE TABLE training_progress (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  department TEXT,
  video_key TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, video_key)
);
```

## Table: training_quizzes
```sql
CREATE TABLE training_quizzes (
  id SERIAL PRIMARY KEY,
  video_id INTEGER REFERENCES training_videos(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_hi TEXT,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: quiz_results
```sql
CREATE TABLE quiz_results (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed BOOLEAN DEFAULT false,
  answers JSONB,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: vendors
```sql
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT NOT NULL,
  alt_phone TEXT,
  email TEXT,
  category TEXT NOT NULL,
  property TEXT DEFAULT 'all',
  notes TEXT,
  rating INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: valet_bookings
```sql
CREATE TABLE valet_bookings (
  id SERIAL PRIMARY KEY,
  property TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_name TEXT,
  expected_cars INTEGER DEFAULT 0,
  valets_needed INTEGER DEFAULT 0,
  vendor_name TEXT,
  vendor_phone TEXT,
  shift_start TIME,
  shift_end TIME,
  notes TEXT,
  status TEXT DEFAULT 'planned',
  event_type TEXT DEFAULT 'other',
  guest_count INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'normal',
  special_instructions TEXT,
  staff_allocation JSONB,
  override_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: valet_staff
```sql
CREATE TABLE valet_staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  property TEXT NOT NULL,
  pin TEXT NOT NULL DEFAULT '1234',
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: valet_cars
```sql
CREATE TABLE valet_cars (
  id SERIAL PRIMARY KEY,
  property TEXT NOT NULL,
  event_date DATE DEFAULT CURRENT_DATE,
  event_name TEXT,
  guest_name TEXT,
  guest_phone TEXT,
  car_number TEXT NOT NULL,
  car_color TEXT,
  car_model TEXT,
  number_plate_photo TEXT,
  car_photo TEXT,
  parking_area TEXT,
  parking_spot TEXT,
  key_tag TEXT,
  received_by TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'parked',
  delivered_by TEXT,
  delivered_at TIMESTAMPTZ,
  delivery_photo TEXT,
  notes TEXT,
  valet_booking_id INTEGER REFERENCES valet_bookings(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: fire_extinguishers
```sql
CREATE TABLE fire_extinguishers (
  id SERIAL PRIMARY KEY,
  property TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL,
  capacity TEXT,
  serial_number TEXT,
  install_date DATE,
  expiry_date DATE NOT NULL,
  last_inspection DATE,
  next_inspection DATE,
  vendor_name TEXT,
  vendor_phone TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  photo_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Table: chemical_usage
```sql
-- Tracks which chemical is used, how much, and WHERE per property.
-- Powers the "Chemical Usage" tab inside the Training module.
CREATE TABLE chemical_usage (
  id SERIAL PRIMARY KEY,
  property TEXT NOT NULL,                -- pp, ex, mk, rs
  chemical_name TEXT NOT NULL,
  chemical_name_hi TEXT,
  category TEXT,                         -- Floor Care, Washroom, Glass, Lawn/Garden, etc.
  brand TEXT,                            -- e.g. Kleanfix
  quantity NUMERIC DEFAULT 0,            -- amount used
  unit TEXT DEFAULT 'L',                 -- L, ml, kg, g, pcs
  location TEXT,                         -- WHERE it is used (banquet, lawn, WC, kitchen, etc.)
  department TEXT,                       -- h, k, a, s
  used_by TEXT,
  used_by_name TEXT,
  usage_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## RLS Policies
All tables have RLS enabled with "Allow all" policies for simplicity.
Future improvement: implement proper per-user RLS policies.

---

# 6. FEATURES BUILT

## Navigation Structure (role-based sidebar)

**Super Admin / Admin (7 items):**
1. 📊 Dashboard
2. ✅ Tasks (sub-tabs: SOP Tasks | Duty Roster) — admins also approve employee completion requests here
3. 📋 Fix Request (unified: anyone posts, admins assign/track)
4. 👥 Team (sub-tabs: Attendance | Leave | Members)
5. 🎓 Training (sub-tabs: Videos | Chemical Usage | Fire Safety)
6. 🚗 Valet (sub-tabs: Staff Calculator | Bookings | Car Portal)
7. 📞 Vendors

**Employee (non-admin) sidebar:**
1. 📊 Dashboard
2. 📝 My Tasks — all tasks assigned to that user, with Start Work → photo → Mark for Completion flow
3. 📋 Fix Request — completed/approved tasks reflect here for the user
4. 👥 Team (Attendance | Leave)
5. 🎓 Training (Videos role-locked + progress bar | Chemical Usage)

## Feature Details

### Dashboard
- Progress rings per department
- Staff performance cards
- Absent today widget (from leaves table)
- Overdue tasks alert (compact bar)
- Fire extinguisher status widget
- Fix Request summary widget

### My Tasks (Employee view — non-admin/non-SA)
- Sidebar menu showing ALL tasks assigned to the logged-in user (`assigned_to = user.id`)
- Filter by Daily/Weekly/Monthly and status
- Per-task action flow:
  1. **Start Work** → status `in_progress`, sets `started_at` / `started_by`
  2. After work, **camera photo mandatory** (compressed to 80KB, stored in `completion_photo` JSONB) — cannot proceed without at least one photo
  3. **Mark for Completion** → status `completion_requested`, sets `completion_requested_at` (+ optional `completion_note`)
  4. Admin/SA reviews under Tasks and **approves** → status `completed`, sets `completed_at` / `approved_by`; or sends back with `rejection_note`
- Once approved/completed, the task **reflects on the user's Fix Request** as completed
- Report issue → status `issue`

### Tasks > SOP Tasks (Admin/SA view)
- Daily/Weekly/Monthly toggle with color-coded borders (blue/green/maroon)
- Department filter (Horticulture/Housekeeping/Admin/Security)
- Review queue: tasks in `completion_requested` shown with employee photos → Approve / Reject
- Mark complete with photo proof
- Report issue
- Photo upload with 80KB compression
- 30-second auto-refresh

### Tasks > Duty Roster
- All departments (not just security)
- Day/Night/Off/Half Day shifts
- Editable shift timings
- 3rd party guard name entry
- Weekly view
- Auto-show leave status

### Fix Request
- Kanban: Open | In Progress | Completed
- Anyone can post work requests/issues
- SA/Admin can pick up, assign, reassign
- Status flow: open → assigned → in_progress → approval_requested → approved → completed
- Optional approval or direct completion with photo
- Reply/comment thread
- Multiple photo uploads (compressed)
- Priority: Low/Normal/High/Urgent
- Categories: Maintenance, Electrical, Plumbing, Horticulture, Housekeeping, etc.
- Overdue detection and reminders
- KNOWN ISSUE: Create task may not work — needs debugging

### Team > Attendance
- Photo mandatory at check-in and check-out
- Admin sees all staff with photo thumbnails
- 3rd party attendance section
- Summary: Present/Absent/On Leave counts

### Team > Leave
- Staff request leave (casual/sick/other)
- Admin approves/rejects
- Shows on dashboard absent widget

### Team > Members
- Property filter (All/PP/EX/MK/RS)
- Active Members / Past Members tabs
- Edit member details (name, phone, joining date, dept)
- Password management (SA only — 🔑 button)
- Bulk password reset (SA only)
- Add member with role-based access permissions
- Deactivate member → hidden everywhere except Past Members
- Login blocked for deactivated users

### Training > Videos
- **Role-based visibility:** employees see only videos for their own department/role; Admins/SA see all
- **Progress bar at the top** of the videos view showing overall completion % for the logged-in user (completed videos ÷ total assigned videos)
- YouTube embed plays in-app
- Auto-completion tracking (YouTube IFrame API onEnded)
- Quiz after video completion (pass ≥ 60%)
- Staff training progress grid (per-person percentage) — Admin/SA
- SA/Admin can add/edit/delete videos and quiz questions
- 54 default training topics across 4 departments

### Training > Chemical Usage
- Backed by the `chemical_usage` table
- Shows, **per property (PP/EX/MK/RS)**, which chemicals are being used, **how much** (quantity + unit), and **where** (location/area)
- Grouped/summarized by property and by category
- Log entry: chemical name, brand, quantity, unit, location, department, date
- Retains the reference chemical guide (Kleanfix + hotel-industry list, Hindi translations)
  - Categories: Floor Care, Washroom, Glass/Wood/Steel, Carpet, Kitchen, Laundry, Hand Hygiene, Lawn/Garden, Car/Parking
  - Kleanfix contact: +91 98189 98806, kleanfix.com

### Training > Fire Safety
- Fire extinguisher tracking per property
- Expiry monitoring with 15-day advance notifications
- Monthly inspection tracking
- Vendor contact for refills
- Dashboard widget (OK/Expiring/Expired)
- Default 26 extinguishers seeded across 4 properties

### Valet > Staff Calculator
- Property-specific allocation matrices (from management data)
- Input: guest count → output: exact staff breakdown
- Roles: Key Man, Driver, Guard, Rider, Gun Man, Bouncer
- Pushpanjali: 100-150 to 900-1000 pax
- Exotica: 100 to 1000 pax
- Manaktala: 100-150 to 800-900 pax
- Restro: 100 to 200 pax
- Manual override option with reason
- Full allocation table view
- Cost estimation

### Valet > Bookings
- Calendar view for valet bookings
- Event type: Standard/Premium/Luxury/VIP/Corporate
- Priority flags: Normal/High (Elite)/Critical (Luxury)
- Special instructions from sales team
- Auto staff allocation from calculator

### Valet > Car Portal
- Separate login for valet staff (PIN-based)
- Car entry: number plate photo, car details, parking zone
- Car search: by number, guest name, phone
- Car delivery tracking
- Property-specific parking zones
- Admin view: live parking dashboard

### Vendors
- 60+ vendor categories (grouped by type)
- Add/Edit/Delete vendors
- Search and filter by category/property
- Click-to-call (tel: link)
- WhatsApp integration (wa.me link)
- Star rating (1-5)

### Notifications
- Bell icon in header with unread count
- Notification for: task assigned, approval requested, approved, rejected, completed, punch in/out, leave request, training completion, overdue reminders, fire extinguisher expiry
- Auto-check on login for overdue tasks and expiring extinguishers
- Daily reminder (one per day, not spamming)

### Other Features
- Dark/Light theme toggle (persisted in localStorage)
- Hindi/English bilingual toggle (src/translations.js)
- Image compression to 80KB before upload
- 30-second auto-refresh
- Mobile-first with bottom tab bar on phones
- Login with Remember Me
- SA can edit/reassign assigned tasks
- Role-based navigation (different nav for SA/Admin/Employee)
- Custom access permissions for office staff

---

# 7. KNOWN ISSUES & BUGS

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | Fix Request create task may not work | HIGH | work_board table may not exist or insert payload missing required fields |
| 2 | Hindi toggle doesn't translate everything | MEDIUM | Many hardcoded English strings remain — needs comprehensive sweep |
| 3 | "C is not defined" crashes | HIGH | The color object C must be defined as module-level constant AND inside components via useT() hook |
| 4 | Org chart removed but references may remain | LOW | Clean up any leftover OrgChart imports |
| 5 | Assigned tasks visibility for admins | MEDIUM | Has been fixed multiple times — verify to_user matches user.id exactly |
| 6 | Deactivated members may still show in some dropdowns | MEDIUM | Need .eq('is_active', true) on ALL user queries |

---

# 8. PENDING FEATURES / ROADMAP

| # | Feature | Priority |
|---|---------|----------|
| 1 | Fix Fix Request create functionality | P0 |
| 2 | Complete Hindi translation sweep | P0 |
| 3 | Professional dashboard redesign with deep-dive analytics | P1 |
| 4 | Dynamic chemical calculator per property (sqft-based quantities) | P1 |
| 5 | Push notifications to phones | P2 |
| 6 | WhatsApp daily summary bot | P2 |
| 7 | Offline mode (PWA service worker) | P2 |
| 8 | Reports & export to Excel | P2 |
| 9 | Proper Supabase RLS policies (security hardening) | P2 |
| 10 | Password hashing (bcrypt) | P2 |
| 11 | Property layout maps in areas view | P3 |
| 12 | Org chart (removed — can be re-added) | P3 |

---

# 9. DEVELOPMENT WORKFLOW

## Using Claude Code (recommended)
```bash
cd ~/Desktop/ambria-workforce
claude
# Type your request in plain English
# Claude Code writes code, commits, pushes
# GitHub Actions auto-deploys in 3 minutes
```

## Manual Development
```bash
cd ~/Desktop/ambria-workforce
npm run dev                    # local dev server
# Make changes to src/ files
npm run build                  # verify build
git add .
git commit -m "description"
git push origin main           # triggers auto-deploy
```

## Key Files
```
src/
├── App.jsx              # Main app component + routing
├── supabase.js          # Supabase client connection
├── translations.js      # Hindi/English text (T object)
├── imageCompress.js     # Photo compression utility
├── Modal.jsx            # Reusable modal component
├── schema.js            # DB schema reference (comments)
├── [Feature].jsx        # Individual feature components
public/
├── manifest.json        # PWA manifest
.github/workflows/
├── deploy.yml           # GitHub Actions CI/CD
CLAUDE.md                # Project context for Claude Code
vite.config.js           # Vite config (base path important!)
index.html               # Entry HTML
```

## Color System
```javascript
const C = {
  maroon: "#7B1E2F",      // Primary brand color
  maroonSoft: "#F5E6E9",  // Light maroon background
  white: "#FFFFFF",
  bg: "#FAFAFA",           // Page background
  text: "#1A1A1A",         // Primary text
  tl: "#6B7280",           // Secondary text
  border: "#E5E7EB",       // Borders
  green: "#16A34A",        // Success / Horticulture
  gBg: "#ECFDF5",          // Green background
  blue: "#2563EB",         // Info / Housekeeping
  bBg: "#EFF6FF",          // Blue background
  red: "#DC2626",          // Error / Danger
  rBg: "#FEF2F2",          // Red background
  yellow: "#D97706",       // Warning
  yBg: "#FFFBEB",          // Yellow background
  accent: "#B45309",       // Accent
};
```

## Critical Rules
1. C must be defined as module-level constant (not inside a function)
2. Components that need theme-aware colors use `const C = useT();`
3. All user queries must filter `.eq('is_active', true)` except login and Past Members
4. Photo uploads must compress to 80KB via imageCompress.js
5. All display text must use `T[lang].keyName` pattern for Hindi support
6. `vite.config.js` base must match repo name: `/Ambria---Workforce/`
7. Mobile-first: bottom tab bar on screens < 768px

---

# 10. SUPABASE CONFIGURATION

- **Project URL:** https://kwqbgymqbcfvtvelunxo.supabase.co
- **Region:** Mumbai (ap-south-1)
- **Storage Bucket:** photos (public)
- **RLS:** Enabled on all tables with "Allow all" policies
- **Auth:** Using custom login (username/password in users table), NOT Supabase Auth

## To access Supabase Dashboard:
1. Go to https://supabase.com/dashboard
2. Login with the GitHub account used to create the project
3. Select "ambria-workforce" project

---

# 11. VALET ALLOCATION MATRICES

## Pushpanjali (AP)
| Particulars | 100-150 | 200-250 | 300-350 | 400-500 | 600-800 | 900-1000 |
|------------|---------|---------|---------|---------|---------|----------|
| Key Man | 1 | 1 | 1 | 1 | 1 | 1 |
| Driver | 2 | 4 | 5 | 7 | 10 | 13 |
| Guard | 0 | 0 | 1 | 1 | 2 | 2 |
| Rider | 0 | 0 | 0 | 0 | 1 | 1 |
| **Total** | **3** | **5** | **7** | **9** | **14** | **17** |

## Exotica (AE)
| Particulars | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 |
|------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| Key Man | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 |
| Driver | 2 | 3 | 5 | 6 | 8 | 10 | 12 | 14 | 17 | 19 |
| Guard | 0 | 0 | 1 | 2 | 2 | 2 | 2 | 2 | 3 | 3 |
| Rider | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 |
| **Total** | **3** | **4** | **7** | **9** | **11** | **14** | **17** | **19** | **23** | **25** |

## Manaktala (MKT)
| Particulars | 100-150 | 200-250 | 300-350 | 400-450 | 500-550 | 600-700 | 800-900 |
|------------|---------|---------|---------|---------|---------|---------|---------|
| Key Man | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| Driver | 2 | 4 | 5 | 6 | 8 | 9 | 11 |
| Guard | 0 | 0 | 0 | 1 | 1 | 1 | 3 |
| Rider | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| **Total** | **3** | **5** | **6** | **8** | **10** | **12** | **16** |

## Restro
| Particulars | 100 | 150 | 200 |
|------------|-----|-----|-----|
| Key Man | 1 | 1 | 1 |
| Driver | 3 | 4 | 5 |
| Guard | 0 | 0 | 1 |
| **Total** | **4** | **5** | **7** |

---

# 12. CONTACT

**Project Owner:** Abhishek (Efficiency Manager)
**Company:** Get Your Venue Events Pvt Ltd (Ambria)
**Development History:** Built using Claude (Anthropic) AI — started April 2026
**Claude Code Setup:** See CLAUDE-CODE-SETUP.md in project files
