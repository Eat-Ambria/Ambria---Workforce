-- =============================================
-- AMBRIA OPS — DUE / OVERDUE TASK REMINDERS (daily)
-- Inserts a `task_due` notification for the assignee of every task that is due
-- today or already overdue and not yet completed. The existing Database Webhook
-- on the notifications table turns each row into a bell entry + a Web Push.
--
-- De-duped per task per day, so a task that stays overdue nudges the assignee
-- once each morning (not on every run, and not many times a day).
--
-- HOW TO INSTALL: paste this whole file in the Supabase SQL Editor and Run.
-- Safe to run multiple times (idempotent).
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION notify_due_tasks()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO notifications (type, task_text, for_user, property, entity_id)
  SELECT 'task_due', t.title, t.assigned_to, t.property, t.id
  FROM tasks t
  WHERE t.assigned_to IS NOT NULL
    AND t.due_date IS NOT NULL
    AND t.due_date <= today            -- due today or overdue
    AND t.status <> 'completed'        -- lifecycle status (issue is independent)
    -- don't re-notify the same task+person more than once on the same day
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'task_due'
        AND n.entity_id = t.id
        AND n.for_user = t.assigned_to
        AND (n.created_at AT TIME ZONE 'Asia/Kolkata')::date = today
    );
END;
$$;

-- Schedule for 06:15 AM IST (00:45 UTC), just after the daily reset (06:00 IST)
-- so freshly-reset recurring tasks are in their clean state first.
SELECT cron.schedule(
  'notify-due-tasks',
  '45 0 * * *',                       -- 00:45 UTC = 06:15 IST
  $$ SELECT notify_due_tasks(); $$
);

-- =============================================
-- USEFUL CHECKS
-- =============================================
-- See the scheduled job:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'notify-due-tasks';
--
-- Run it right now (sends reminders for anything due/overdue today):
--   SELECT notify_due_tasks();
--
-- Preview what would be notified (without inserting):
--   SELECT t.id, t.title, t.assigned_to, t.due_date FROM tasks t
--   WHERE t.assigned_to IS NOT NULL AND t.due_date IS NOT NULL
--     AND t.due_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
--     AND t.status <> 'completed';
--
-- Remove the schedule later if needed:
--   SELECT cron.unschedule('notify-due-tasks');
-- =============================================
