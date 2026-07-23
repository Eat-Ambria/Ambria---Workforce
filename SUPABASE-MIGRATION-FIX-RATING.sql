-- =============================================
-- AMBRIA OPS — FIX REQUEST: due date + ratings
-- Run this in the Supabase SQL Editor. Safe to run multiple times.
-- =============================================

-- due_date: some older work_board tables were created before this column
-- existed (CREATE TABLE IF NOT EXISTS never adds columns to an existing table),
-- which causes: "Could not find the 'due_date' column ... in the schema cache".
ALTER TABLE work_board ADD COLUMN IF NOT EXISTS due_date DATE;         -- optional deadline

-- 1–5 star rating (given by an admin) so each staff member builds a history
-- of completed fixes + ratings over time.
ALTER TABLE work_board ADD COLUMN IF NOT EXISTS rating    INT;         -- 1..5, set by admin after completion
ALTER TABLE work_board ADD COLUMN IF NOT EXISTS rated_by  TEXT;        -- admin user id who rated
ALTER TABLE work_board ADD COLUMN IF NOT EXISTS rated_at  TIMESTAMPTZ; -- when it was rated

-- speeds up the per-staff "how many fixes + average rating" lookup
CREATE INDEX IF NOT EXISTS idx_work_board_assignee_rating ON work_board(assigned_to, rating);

-- tell the API to pick up the new columns immediately (clears the schema cache)
NOTIFY pgrst, 'reload schema';

-- =============================================
-- DONE.
-- =============================================
