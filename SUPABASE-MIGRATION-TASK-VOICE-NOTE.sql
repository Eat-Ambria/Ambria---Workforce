-- =============================================
-- AMBRIA OPS — TASKS send-back voice note
-- When an admin sends a task back for redo, they can optionally attach a
-- recorded voice note (public URL in the 'photos' storage bucket). The staff
-- member plays it back on their task. Cleared on resubmit alongside rejection_note.
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS rejection_voice_url TEXT;

-- Verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='rejection_voice_url';
