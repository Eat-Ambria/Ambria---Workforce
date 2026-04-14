-- ══════════════════════════════════════════════════════════════════
-- AMBRIA WORKFORCE — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Tables that already exist (users, leaves, duty_roster, training_progress)
-- are CREATE IF NOT EXISTS so they won't break.
-- ══════════════════════════════════════════════════════════════════

-- 1. USERS (already exists — skip if already created)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'e',        -- 'sa', 'a', 'e'
  property TEXT,                          -- 'pp','ex','mk','rs','all'
  department TEXT,                        -- 'h','k','a','s'
  joining_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  left_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TASKS — daily status overrides (template stays in code)
-- task_key = the template task ID (e.g. "pp_1")
-- date     = which day this status applies to
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_key TEXT NOT NULL,
  property TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / completed / issue
  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  photos JSONB DEFAULT '[]',
  UNIQUE(task_key, date)
);
CREATE INDEX IF NOT EXISTS tasks_property_date ON tasks(property, date);

-- 3. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  property TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TEXT,                           -- "09:30"
  check_out TEXT,
  check_in_photo TEXT,                     -- base64 data URL
  check_out_photo TEXT,
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS attendance_property_date ON attendance(property, date);

-- 4. ASSIGNED TASKS (Directives: SA → Admin)
CREATE TABLE IF NOT EXISTS assigned_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user TEXT NOT NULL,
  from_name TEXT,
  to_user TEXT NOT NULL,
  to_name TEXT,
  to_color TEXT,
  property TEXT,
  text TEXT NOT NULL,
  photo JSONB,                             -- {data, time}
  status TEXT NOT NULL DEFAULT 'sent',    -- sent/completed/approval_req/approved/rejected
  due_date DATE,
  completion_note TEXT,
  completion_photo JSONB,
  remarks_sa TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assigned_tasks_to_user ON assigned_tasks(to_user);

-- 5. ASSIGNED TASK REPLIES
CREATE TABLE IF NOT EXISTS assigned_task_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE,
  from_user TEXT NOT NULL,
  from_name TEXT,
  text TEXT,
  photo JSONB,
  type TEXT NOT NULL DEFAULT 'reply',     -- reply/completed/approval_req/approved/rejected
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS replies_task_id ON assigned_task_replies(task_id);

-- 6. LEAVES (already exists — skip if already created)
CREATE TABLE IF NOT EXISTS leaves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  leave_date DATE NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'casual',  -- casual/sick/other
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending/approved/rejected
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. DUTY ROSTER (already exists — skip if already created)
CREATE TABLE IF NOT EXISTS duty_roster (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id TEXT,
  user_name TEXT,
  shift_type TEXT NOT NULL DEFAULT 'day',    -- day/night
  shift_start TEXT,                           -- "09:00"
  shift_end TEXT,                             -- "18:00"
  notes TEXT,
  assigned_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. TRAINING PROGRESS (already exists — skip if already created)
CREATE TABLE IF NOT EXISTS training_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  department TEXT,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, video_key)
);

-- 9. NOTIFICATIONS (optional — for future push notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  task TEXT,
  by TEXT,
  prop TEXT,
  time TEXT,
  for_user TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS but allow all authenticated operations for now.
-- Tighten per-user policies after initial setup if needed.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_task_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;

-- Allow all operations from the service/anon key (app uses anon key)
CREATE POLICY IF NOT EXISTS "allow_all_tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_attendance" ON attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_assigned_tasks" ON assigned_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_replies" ON assigned_task_replies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_leaves" ON leaves FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_roster" ON duty_roster FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_training" ON training_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_users" ON users FOR ALL USING (true) WITH CHECK (true);
