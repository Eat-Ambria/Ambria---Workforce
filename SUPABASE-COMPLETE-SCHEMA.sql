-- =============================================
-- AMBRIA OPS — COMPLETE DATABASE SCHEMA
-- Run this in Supabase SQL Editor to create ALL tables
-- Safe to run multiple times (uses IF NOT EXISTS)
-- =============================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'e',
  property TEXT NOT NULL DEFAULT 'pp',
  department TEXT,
  phone TEXT,
  joining_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  left_date DATE,
  designation TEXT,
  access JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TASKS
-- Employee "My Tasks" workflow status flow:
--   pending -> in_progress (Start Work) -> completion_requested (photo uploaded, Mark for Completion)
--   -> completed (admin approves) | issue (reported)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  property TEXT NOT NULL,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  title_hi TEXT,
  area TEXT,
  priority TEXT DEFAULT 'medium',
  duration TEXT,
  description TEXT,
  description_hi TEXT,
  time_block TEXT,
  assigned_to TEXT,
  assignee_name TEXT,
  status TEXT DEFAULT 'pending',        -- pending, in_progress, completion_requested, completed, issue
  is_team BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,                -- set when employee taps "Start Work"
  started_by TEXT,                       -- user id who started the task
  completion_photo JSONB DEFAULT '[]',   -- array of camera photo URLs (mandatory before completion request)
  completion_note TEXT,                  -- employee note when marking for completion
  completion_requested_at TIMESTAMPTZ,   -- set when employee taps "Mark for Completion"
  completed_at TIMESTAMPTZ,              -- set when admin approves completion
  completed_by TEXT,
  approved_by TEXT,                      -- admin/SA who approved completion
  approved_at TIMESTAMPTZ,
  rejection_note TEXT,                   -- admin note if completion is sent back
  notes TEXT,
  task_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,                         -- optional deadline; task is overdue when past & not completed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PHOTOS
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  task_id TEXT,
  user_id TEXT,
  photo_url TEXT NOT NULL,
  caption TEXT,
  taken_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  date DATE DEFAULT CURRENT_DATE,
  check_in TIME,
  check_out TIME,
  status TEXT DEFAULT 'present',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 5. ASSIGNED TASKS (legacy)
CREATE TABLE IF NOT EXISTS assigned_tasks (
  id TEXT PRIMARY KEY,
  from_user TEXT,
  from_name TEXT,
  to_user TEXT,
  to_name TEXT,
  to_color TEXT,
  property TEXT,
  text TEXT NOT NULL,
  photo_url TEXT,
  status TEXT DEFAULT 'sent',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  completion_photo TEXT,
  remarks_sa TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ASSIGNED TASK REPLIES (legacy)
CREATE TABLE IF NOT EXISTS assigned_task_replies (
  id SERIAL PRIMARY KEY,
  task_id TEXT,
  by_user TEXT,
  by_name TEXT,
  text TEXT,
  photo_url TEXT,
  reply_type TEXT DEFAULT 'reply',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. WORK BOARD (new unified Fix Request)
CREATE TABLE IF NOT EXISTS work_board (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  property TEXT NOT NULL DEFAULT 'pp',
  posted_by TEXT NOT NULL DEFAULT '',
  posted_by_name TEXT NOT NULL DEFAULT '',
  department TEXT,
  priority TEXT DEFAULT 'normal',
  photos JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open',
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

-- 8. Fix Request REPLIES
CREATE TABLE IF NOT EXISTS task_board_replies (
  id SERIAL PRIMARY KEY,
  task_id INTEGER,
  by_user TEXT NOT NULL,
  by_name TEXT NOT NULL,
  text TEXT,
  photos JSONB DEFAULT '[]',
  reply_type TEXT DEFAULT 'comment',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
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

-- 10. DUTY ROSTER
CREATE TABLE IF NOT EXISTS duty_roster (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  property TEXT,
  shift_type TEXT DEFAULT 'day',
  shift_start TIME,
  shift_end TIME,
  date DATE DEFAULT CURRENT_DATE,
  assigned_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS duty_roster_user_date ON duty_roster(user_id, date);

-- 11. LEAVES
CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  leave_date DATE NOT NULL,
  leave_type TEXT DEFAULT 'casual',
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TRAINING VIDEOS
CREATE TABLE IF NOT EXISTS training_videos (
  id SERIAL PRIMARY KEY,
  department TEXT NOT NULL,
  topic TEXT NOT NULL,
  topic_hi TEXT,
  youtube_url TEXT NOT NULL DEFAULT '',
  youtube_id TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. TRAINING PROGRESS
CREATE TABLE IF NOT EXISTS training_progress (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  department TEXT,
  video_key TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, video_key)
);

-- 14. TRAINING QUIZZES
CREATE TABLE IF NOT EXISTS training_quizzes (
  id SERIAL PRIMARY KEY,
  video_id INTEGER,
  question TEXT NOT NULL,
  question_hi TEXT,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. QUIZ RESULTS
CREATE TABLE IF NOT EXISTS quiz_results (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed BOOLEAN DEFAULT false,
  answers JSONB,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. VENDORS
CREATE TABLE IF NOT EXISTS vendors (
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

-- 17. VALET BOOKINGS
CREATE TABLE IF NOT EXISTS valet_bookings (
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

-- 18. VALET STAFF
CREATE TABLE IF NOT EXISTS valet_staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  property TEXT NOT NULL,
  pin TEXT NOT NULL DEFAULT '1234',
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. VALET CARS
CREATE TABLE IF NOT EXISTS valet_cars (
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
  valet_booking_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_valet_cars_number ON valet_cars(car_number);
CREATE INDEX IF NOT EXISTS idx_valet_cars_status ON valet_cars(status);
CREATE INDEX IF NOT EXISTS idx_valet_cars_date ON valet_cars(event_date);

-- 20. FIRE EXTINGUISHERS
CREATE TABLE IF NOT EXISTS fire_extinguishers (
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

-- 21. CHEMICAL USAGE
-- Tracks which chemical is used, how much, and WHERE (area) per property.
-- Powers the "Chemical Usage" tab inside the Training module.
CREATE TABLE IF NOT EXISTS chemical_usage (
  id SERIAL PRIMARY KEY,
  property TEXT NOT NULL,                 -- pp, ex, mk, rs
  chemical_name TEXT NOT NULL,
  chemical_name_hi TEXT,
  category TEXT,                          -- Floor Care, Washroom, Glass, Lawn/Garden, etc.
  brand TEXT,                             -- e.g. Kleanfix
  quantity NUMERIC DEFAULT 0,             -- amount used
  unit TEXT DEFAULT 'L',                  -- L, ml, kg, g, pcs
  location TEXT,                          -- WHERE it is used (banquet, lawn, WC, kitchen, etc.)
  department TEXT,                        -- h, k, a, s
  used_by TEXT,                           -- user id who logged/used it
  used_by_name TEXT,
  usage_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chemical_usage_property ON chemical_usage(property);
CREATE INDEX IF NOT EXISTS idx_chemical_usage_date ON chemical_usage(usage_date);

-- VALET BOOKINGS: calendar of valet events per property (guests -> staffing)
CREATE TABLE IF NOT EXISTS valet_bookings (
  id TEXT PRIMARY KEY,
  property TEXT NOT NULL,                 -- pp, ex, mk, rs
  event_date DATE NOT NULL,             -- the day valet service is needed
  event_time TEXT,                       -- free text, e.g. "7 PM onwards"
  customer_name TEXT,
  phone TEXT,
  guests INTEGER DEFAULT 0,             -- expected guest count
  staff_total INTEGER,                   -- valet staff snapshot from the matrix at booking time
  staff_breakdown JSONB,                 -- per-booking override [{role,count}]; NULL = use matrix
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_valet_bookings_property ON valet_bookings(property);
CREATE INDEX IF NOT EXISTS idx_valet_bookings_date ON valet_bookings(event_date);

-- VALET MATRIX: editable staffing logic (tiers per property)
CREATE TABLE IF NOT EXISTS valet_matrix (
  property TEXT PRIMARY KEY,              -- pp, ex, mk, rs
  name TEXT,
  roles JSONB NOT NULL,                   -- ["Key Man","Driver","Guard","Rider"]
  tiers JSONB NOT NULL,                   -- [{"max":150,"values":[1,2,0,0]}, ...]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
    EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- =============================================
-- DONE! All 21 tables created with RLS.
-- =============================================
