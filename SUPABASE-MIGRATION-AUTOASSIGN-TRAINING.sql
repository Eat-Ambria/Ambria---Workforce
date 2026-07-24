-- =============================================
-- AMBRIA OPS — AUTO-ASSIGN TRAINING BY DEPARTMENT (both directions)
--
-- Keeps training assignments in sync with department, automatically:
--   A) New / moved / re-activated STAFF  -> get all their department's videos.
--   B) New / re-activated / re-homed VIDEO -> assigned to all staff in its dept.
--
-- Runs in the DB so it works no matter how the row is created (admin panel,
-- import, script). Existing assignments are never duplicated
-- (UNIQUE(video_id,user_id) + ON CONFLICT DO NOTHING). Moving a staff member or
-- video to another department ADDS the new links; it does not remove old ones
-- (so progress/history is kept).
--
-- Every new assignment also fires the existing training_notify trigger, so the
-- staff member is notified (bell + push).
--
-- HOW TO INSTALL: paste this whole file in the Supabase SQL Editor and Run.
-- Safe to run multiple times (idempotent).
-- =============================================

-- A) STAFF-SIDE: when a staff member joins / moves / is re-activated -----------

CREATE OR REPLACE FUNCTION trg_user_autoassign_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- only active employees with a department qualify
  IF NEW.role = 'e'
     AND COALESCE(NEW.department, '') <> ''
     AND COALESCE(NEW.is_active, true) = true
     AND (
          TG_OP = 'INSERT'
          OR NEW.department IS DISTINCT FROM OLD.department
          OR COALESCE(NEW.is_active, true) IS DISTINCT FROM COALESCE(OLD.is_active, true)
         )
  THEN
    INSERT INTO training_assignments (video_id, user_id, deadline, assigned_by)
    SELECT v.id, NEW.id, NULL, 'system'
    FROM training_videos v
    WHERE v.department = NEW.department
      AND COALESCE(v.is_active, true) = true
    ON CONFLICT (video_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_autoassign_training ON users;
CREATE TRIGGER user_autoassign_training
AFTER INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trg_user_autoassign_training();

-- B) VIDEO-SIDE: when a video is uploaded / re-activated / moved to a dept ------
--    assign it to every active employee in that department.
CREATE OR REPLACE FUNCTION trg_video_autoassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_active, true) = true
     AND COALESCE(NEW.department, '') <> ''
     AND (
          TG_OP = 'INSERT'
          OR NEW.department IS DISTINCT FROM OLD.department
          OR COALESCE(NEW.is_active, true) IS DISTINCT FROM COALESCE(OLD.is_active, true)
         )
  THEN
    INSERT INTO training_assignments (video_id, user_id, deadline, assigned_by)
    SELECT NEW.id, u.id, NULL, 'system'
    FROM users u
    WHERE u.role = 'e'
      AND COALESCE(u.is_active, true) = true
      AND u.department = NEW.department
    ON CONFLICT (video_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_autoassign ON training_videos;
CREATE TRIGGER video_autoassign
AFTER INSERT OR UPDATE ON training_videos
FOR EACH ROW EXECUTE FUNCTION trg_video_autoassign();

-- =============================================
-- OPTIONAL: backfill existing staff right now
-- Assign current active employees any department videos they're missing:
-- --------------------------------------------
--   INSERT INTO training_assignments (video_id, user_id, deadline, assigned_by)
--   SELECT v.id, u.id, NULL, 'system'
--   FROM users u
--   JOIN training_videos v
--     ON v.department = u.department AND COALESCE(v.is_active, true) = true
--   WHERE u.role = 'e' AND COALESCE(u.is_active, true) = true
--     AND COALESCE(u.department, '') <> ''
--   ON CONFLICT (video_id, user_id) DO NOTHING;
--
-- USEFUL CHECKS
-- --------------------------------------------
--   SELECT tgname FROM pg_trigger WHERE tgname = 'user_autoassign_training';
--   SELECT * FROM training_assignments WHERE assigned_by = 'system' LIMIT 20;
-- =============================================
