-- =============================================
-- AMBRIA OPS — TASKS due date
-- Adds an optional deadline to tasks. A task is "overdue" when it has a
-- due_date in the past and is not yet completed. Tasks without a due_date
-- are never treated as overdue (recurring SOP tasks stay unaffected).
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='due_date';
