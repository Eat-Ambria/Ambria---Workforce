-- =============================================
-- AMBRIA OPS — MIGRATION (July 2026)
-- Adds: My Tasks workflow columns + chemical_usage table
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> your project
--   2. Left menu -> SQL Editor -> New query
--   3. Paste this ENTIRE file
--   4. Click "Run"
-- Safe to run multiple times (uses IF NOT EXISTS).
-- =============================================

-- ---------------------------------------------
-- 1. TASKS: add employee "My Tasks" workflow columns
--    Status flow:
--    pending -> in_progress (Start Work)
--            -> completion_requested (photo + Mark for Completion)
--            -> completed (admin approves) | issue (reported)
-- ---------------------------------------------
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by TEXT,
  ADD COLUMN IF NOT EXISTS completion_photo JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS completion_note TEXT,
  ADD COLUMN IF NOT EXISTS completion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT;

-- ---------------------------------------------
-- 2. CHEMICAL USAGE: which chemical, how much, WHERE, per property
--    Powers the "Chemical Usage" tab inside Training.
-- ---------------------------------------------
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
  used_by TEXT,
  used_by_name TEXT,
  usage_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chemical_usage_property ON chemical_usage(property);
CREATE INDEX IF NOT EXISTS idx_chemical_usage_date ON chemical_usage(usage_date);

-- ---------------------------------------------
-- 3. Enable RLS + "Allow all" policy on the new table
--    (matches the pattern used by every other table)
-- ---------------------------------------------
ALTER TABLE chemical_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON chemical_usage;
CREATE POLICY "Allow all" ON chemical_usage FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DONE!
-- Verify with:
--   SELECT column_name FROM information_schema.columns WHERE table_name='tasks';
--   SELECT * FROM chemical_usage LIMIT 1;
-- =============================================
