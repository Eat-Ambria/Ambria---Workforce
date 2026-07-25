-- =============================================
-- AMBRIA OPS — TRAINING QUIZ (Hindi options) MIGRATION
-- Adds Hindi columns for the four quiz options so the assessment can be
-- shown fully bilingual. (question_hi already exists.)
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================
ALTER TABLE training_quizzes
  ADD COLUMN IF NOT EXISTS option_a_hi TEXT,
  ADD COLUMN IF NOT EXISTS option_b_hi TEXT,
  ADD COLUMN IF NOT EXISTS option_c_hi TEXT,
  ADD COLUMN IF NOT EXISTS option_d_hi TEXT;

-- Verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name='training_quizzes';
