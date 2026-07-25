-- =============================================
-- AMBRIA OPS — INDEPENDENT ISSUE STATUS + AUTO-CLEAR (after 1 day)
--
-- Issue tracking is now a SEPARATE dimension from the task lifecycle. A task's
-- `status` only ever reflects the work lifecycle (pending → in_progress →
-- completion_requested → completed). A staff-reported issue lives in a new
-- `issue_status` column (NULL | 'issue' | 'issue_working' | 'issue_resolved')
-- and never changes the task's status. Resolving an issue returns the task to
-- 'pending' so the employee can carry on.
--
-- This migration:
--   1. Adds the issue_status column (+ keeps resolved_at from before).
--   2. Migrates any legacy rows whose STATUS held an issue value into the new
--      issue_status column, resetting their lifecycle status to 'pending'.
--   3. (Re)defines the hourly job that clears a resolved issue one day later —
--      it now just wipes issue_status + the issue note, leaving the task alone.
--
-- HOW TO INSTALL: paste this whole file in the Supabase SQL Editor and Run.
-- Safe to run multiple times (idempotent).
-- =============================================

-- 1. Columns.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS issue_status TEXT;         -- NULL | issue | issue_working | issue_resolved
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ;  -- when the issue was marked resolved

-- 2. Migrate legacy data: rows that used `status` to carry the issue.
--    Move the issue value into issue_status and reset the lifecycle to pending.
UPDATE tasks
SET issue_status = status,
    status       = 'pending'
WHERE status IN ('issue', 'issue_working', 'issue_resolved');

-- 3. Scheduler extension (idempotent; already present if a prior job was set up).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. The cleanup function — one day after an issue is resolved, clear it.
--    Only the issue fields are touched; the task itself (status, photos, etc.)
--    is left exactly as it is. No storage/service-role key needed anymore.
CREATE OR REPLACE FUNCTION clear_resolved_issues()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tasks SET
    issue_status = NULL,
    notes        = NULL,   -- the issue text the employee reported
    resolved_at  = NULL
  WHERE issue_status = 'issue_resolved'
    AND resolved_at IS NOT NULL
    AND resolved_at < now() - interval '1 day';
END;
$$;

-- 5. Schedule it every hour so the 1-day window is enforced promptly.
--    cron.schedule(name, ...) is idempotent — re-running just updates it.
SELECT cron.schedule(
  'clear-resolved-issues',
  '7 * * * *',                          -- at minute 7 of every hour
  $$ SELECT clear_resolved_issues(); $$
);

-- =============================================
-- USEFUL CHECKS
-- =============================================
-- See the scheduled job:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'clear-resolved-issues';
--
-- Run it right now (clears issues resolved > 1 day ago):
--   SELECT clear_resolved_issues();
--
-- Peek at what's waiting to be cleared:
--   SELECT id, title, issue_status, resolved_at FROM tasks
--   WHERE issue_status = 'issue_resolved' AND resolved_at < now() - interval '1 day';
--
-- Remove the schedule later if needed:
--   SELECT cron.unschedule('clear-resolved-issues');
-- =============================================
