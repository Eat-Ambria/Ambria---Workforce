-- =============================================
-- AMBRIA OPS — in-app notifications (Phase 1)
-- Creates notifications automatically from DB changes so staff & admins get
-- alerted regardless of who has the app open. The app polls the notifications
-- table for the signed-in user (for_user = users.id).
-- Run in Supabase -> SQL Editor. Safe to run multiple times (idempotent).
-- =============================================

-- 0) The notifications table already exists in the base schema. Add a column
--    to point a notification at the task / fix / video it's about (for links),
--    and index lookups by recipient.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_for_user ON notifications (for_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (for_user, is_read);

-- 1) Fan-out helper: notify every active admin / super-admin whose scope covers
--    the given property (super admins & 'all'-property admins always included).
--    Never notifies the actor who caused the event.
CREATE OR REPLACE FUNCTION notify_admins(
  p_type text, p_text text, p_by_user text, p_by_name text, p_property text, p_entity text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (type, task_text, by_user, by_name, for_user, property, entity_id)
  SELECT p_type, p_text, p_by_user, p_by_name, u.id, p_property, p_entity
  FROM users u
  WHERE u.is_active IS DISTINCT FROM false
    AND u.role IN ('a', 'sa')
    AND (u.role = 'sa' OR u.property = 'all' OR u.property = p_property)
    AND u.id IS DISTINCT FROM p_by_user;
END; $$;

-- 2) TASKS ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_tasks_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> '' THEN
      INSERT INTO notifications (type, task_text, for_user, property, entity_id)
      VALUES ('task_assigned', NEW.title, NEW.assigned_to, NEW.property, NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- reassignment
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> ''
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO notifications (type, task_text, for_user, property, entity_id)
    VALUES ('task_assigned', NEW.title, NEW.assigned_to, NEW.property, NEW.id);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completion_requested' THEN
      PERFORM notify_admins('task_submitted', NEW.title, NEW.assigned_to, NEW.assignee_name, NEW.property, NEW.id);
    ELSIF NEW.status = 'in_progress' AND OLD.status = 'completion_requested' THEN
      IF NEW.assigned_to IS NOT NULL THEN
        INSERT INTO notifications (type, task_text, for_user, property, entity_id, by_user)
        VALUES ('task_sent_back', NEW.title, NEW.assigned_to, NEW.property, NEW.id, NEW.approved_by);
      END IF;
    ELSIF NEW.status = 'completed' THEN
      IF COALESCE(NEW.assigned_to, NEW.completed_by) IS NOT NULL THEN
        INSERT INTO notifications (type, task_text, for_user, property, entity_id)
        VALUES ('task_approved', NEW.title, COALESCE(NEW.assigned_to, NEW.completed_by), NEW.property, NEW.id);
      END IF;
    ELSIF NEW.status = 'issue' THEN
      PERFORM notify_admins('task_issue', NEW.title, NEW.assigned_to, NEW.assignee_name, NEW.property, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tasks_notify ON tasks;
CREATE TRIGGER tasks_notify AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION trg_tasks_notify();

-- 3) FIX REQUESTS (work_board) -------------------------------------------------
CREATE OR REPLACE FUNCTION trg_workboard_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> '' THEN
      INSERT INTO notifications (type, task_text, for_user, property, entity_id)
      VALUES ('fix_assigned', NEW.title, NEW.assigned_to, NEW.property, NEW.id::text);
    ELSE
      PERFORM notify_admins('fix_new', NEW.title, NEW.posted_by, NEW.posted_by_name, NEW.property, NEW.id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> ''
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO notifications (type, task_text, for_user, property, entity_id)
    VALUES ('fix_assigned', NEW.title, NEW.assigned_to, NEW.property, NEW.id::text);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approval_requested' THEN
      PERFORM notify_admins('fix_approval', NEW.title, NEW.assigned_to, NEW.assigned_to_name, NEW.property, NEW.id::text);
    ELSIF NEW.status IN ('approved', 'completed') THEN
      IF NEW.assigned_to IS NOT NULL THEN
        INSERT INTO notifications (type, task_text, for_user, property, entity_id)
        VALUES ('fix_approved', NEW.title, NEW.assigned_to, NEW.property, NEW.id::text);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS workboard_notify ON work_board;
CREATE TRIGGER workboard_notify AFTER INSERT OR UPDATE ON work_board
FOR EACH ROW EXECUTE FUNCTION trg_workboard_notify();

-- 4) VALET BOOKINGS (admin) ----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_valet_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lbl text;
BEGIN
  lbl := COALESCE(NEW.customer_name, 'Valet event')
    || CASE WHEN NEW.event_date IS NOT NULL THEN ' · ' || to_char(NEW.event_date, 'DD Mon') ELSE '' END;
  PERFORM notify_admins('valet_booking', lbl, NEW.created_by, NULL, NEW.property, NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS valet_notify ON valet_bookings;
CREATE TRIGGER valet_notify AFTER INSERT ON valet_bookings
FOR EACH ROW EXECUTE FUNCTION trg_valet_notify();

-- 5) QUIZ RESULTS (admin) ------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_quiz_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname text; prop text; vtitle text;
BEGIN
  SELECT name, property INTO uname, prop FROM users WHERE id = NEW.user_id;
  SELECT title INTO vtitle FROM training_videos WHERE id = NEW.video_id;
  PERFORM notify_admins(
    'quiz_completed',
    COALESCE(vtitle, 'Quiz') || ' — ' || NEW.score || '/' || NEW.total,
    NEW.user_id, uname, prop, NEW.video_id::text
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS quiz_notify ON quiz_results;
CREATE TRIGGER quiz_notify AFTER INSERT ON quiz_results
FOR EACH ROW EXECUTE FUNCTION trg_quiz_notify();

-- 6) TRAINING ASSIGNED (staff) — only if the training_assignments table exists
DO $$
BEGIN
  IF to_regclass('public.training_assignments') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION trg_training_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE vtitle text;
    BEGIN
      SELECT title INTO vtitle FROM training_videos WHERE id = NEW.video_id;
      INSERT INTO notifications (type, task_text, for_user, entity_id)
      VALUES ('training_assigned', COALESCE(vtitle, 'Training'), NEW.user_id, NEW.video_id::text);
      RETURN NEW;
    END; $fn$;
    DROP TRIGGER IF EXISTS training_notify ON training_assignments;
    CREATE TRIGGER training_notify AFTER INSERT ON training_assignments
    FOR EACH ROW EXECUTE FUNCTION trg_training_notify();
  END IF;
END $$;

-- 7) DUE / OVERDUE TASK REMINDERS (staff) -------------------------------------
-- Creates at most one 'task_due' notification per task per staff per day.
CREATE OR REPLACE FUNCTION create_due_task_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (type, task_text, for_user, property, entity_id)
  SELECT 'task_due', t.title, t.assigned_to, t.property, t.id
  FROM tasks t
  WHERE t.assigned_to IS NOT NULL AND t.assigned_to <> ''
    AND t.status <> 'completed'
    AND t.due_date IS NOT NULL
    AND t.due_date <= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.for_user = t.assigned_to AND n.type = 'task_due'
        AND n.entity_id = t.id AND n.created_at::date = CURRENT_DATE
    );
END; $$;

-- Schedule it daily. Requires the pg_cron extension (Supabase: Database ->
-- Extensions -> enable "pg_cron"). Then uncomment and run ONCE:
--   select cron.schedule('due-task-reminders', '30 3 * * *',
--     $$ select create_due_task_reminders(); $$);
-- (03:30 UTC ≈ 09:00 IST). Until scheduled, you can run it manually any time:
--   select create_due_task_reminders();

-- Verify:
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_notify';
