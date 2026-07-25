-- =============================================
-- AMBRIA OPS — daily due/overdue reminders as ONE digest per person
--
-- WHY: the old create_due_task_reminders() inserted one row per overdue task,
-- so a staff member with 4 overdue tasks got 4 notifications — and 4 push
-- banners — in the same second. Chrome on Android flags bursts like that as
-- "Possible spam" and hides them behind a warning card, which means the staff
-- member never sees the reminder at all.
--
-- NOW: at most ONE 'task_due' notification per person per day.
--   1 overdue task   -> unchanged: the task's own title, entity_id = task id,
--                       so tapping it opens that exact task.
--   2+ overdue tasks -> a digest: task_text holds just the COUNT ('3') and
--                       entity_id is NULL. The app and the push sender render
--                       that as "3 tasks due today" in the user's language and
--                       open the overdue list instead of one task.
--
-- Run in Supabase -> SQL Editor. Safe to run multiple times (idempotent).
-- Replaces the function defined in SUPABASE-MIGRATION-NOTIFICATIONS.sql (7).
-- =============================================

CREATE OR REPLACE FUNCTION create_due_task_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (type, task_text, for_user, property, entity_id)
  SELECT
    'task_due',
    -- one task: its title (as before). More: the count, localized by the client.
    CASE WHEN count(*) = 1 THEN min(t.title) ELSE count(*)::text END,
    t.assigned_to,
    min(t.property),
    -- only a single-task reminder deep-links to a task
    CASE WHEN count(*) = 1 THEN min(t.id) END
  FROM tasks t
  WHERE t.assigned_to IS NOT NULL AND t.assigned_to <> ''
    AND t.status <> 'completed'
    AND t.due_date IS NOT NULL
    AND t.due_date <= CURRENT_DATE
    -- already reminded today? then skip this person entirely (the old version
    -- checked per task, which is what allowed several rows in one run)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.for_user = t.assigned_to
        AND n.type = 'task_due'
        AND n.created_at::date = CURRENT_DATE
    )
  GROUP BY t.assigned_to;
END; $$;

-- Scheduling is unchanged. If pg_cron is enabled and you haven't scheduled it:
--   select cron.schedule('due-task-reminders', '30 3 * * *',
--     $$ select create_due_task_reminders(); $$);
-- (03:30 UTC ~ 09:00 IST). Run it by hand any time with:
--   select create_due_task_reminders();
