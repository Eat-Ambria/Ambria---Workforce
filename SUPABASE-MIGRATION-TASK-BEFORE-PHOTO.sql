-- =============================================
-- AMBRIA OPS — TASKS "before" photo
-- Adds a before-work photo so staff upload one photo BEFORE starting and one
-- AFTER (the existing completion_photo). Admin compares both to verify the work.
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS before_photo JSONB DEFAULT '[]';

-- Verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='before_photo';
