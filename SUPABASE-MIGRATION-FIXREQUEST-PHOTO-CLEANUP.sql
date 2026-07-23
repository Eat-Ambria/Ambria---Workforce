-- =============================================
-- AMBRIA OPS — FIX REQUEST PHOTO CLEANUP (daily)
-- Frees storage by deleting the PHOTOS of completed fix requests once they are
-- older than 1 day. The fix-request ROW is kept (title, rating, history stay
-- intact for the Users staff-profile screen) — only the image files in the
-- "photos" storage bucket are removed, and the JSON photo columns are emptied
-- so the app stops showing them and we never re-delete the same files.
--
-- Cleans: work_board.photos, work_board.resolution_photos, and any
--         task_board_replies.photos for those completed requests.
--
-- Runs on the Supabase server via pg_cron at 06:15 AM IST (just after the
-- daily task reset at 06:00). Reuses the SAME service_role_key you already
-- stored in Vault for SUPABASE-DAILY-RESET.sql.
--
-- HOW TO INSTALL: paste this whole file in Supabase SQL Editor and Run.
-- Safe to run multiple times (function is replaced, job re-scheduled).
--
-- ⚠️  Requires the service_role key in Vault (set up by the daily-reset file).
--     If it's missing, this job fails OPEN: it does nothing (no rows touched,
--     no files deleted) so it can never orphan photos.
-- =============================================

-- Retention window. Change '1 day' to '0' for same-day cleanup, or '3 days' etc.
--   (edit the two INTERVAL literals below — they must match.)

-- 1. Extensions: scheduler + HTTP client for the Storage API.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. The cleanup function.
CREATE OR REPLACE FUNCTION purge_completed_fix_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff      timestamptz := now() - INTERVAL '1 day';   -- keep completed fixes' photos for 1 day
  service_key text;
  photo_url   text;
  del_url     text;
BEGIN
  -- service_role key from Vault — required to authorize storage deletes.
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Fail open: without the key we can't delete files, so touch nothing (never
  -- clear a photo column whose file we couldn't actually remove).
  IF service_key IS NULL THEN
    RAISE NOTICE 'purge_completed_fix_photos skipped: service_role_key not found in Vault.';
    RETURN;
  END IF;

  -- 1. Delete every photo file (request photos + resolution photos + reply
  --    photos) belonging to a completed/approved fix older than the cutoff.
  --    Turn each public URL into its authenticated delete endpoint and fire an
  --    async DELETE via pg_net.
  FOR photo_url IN
    -- work_board: initial photos + resolution photos
    SELECT elem.url
    FROM work_board w
    CROSS JOIN LATERAL jsonb_array_elements_text(
      coalesce(w.photos, '[]'::jsonb) || coalesce(w.resolution_photos, '[]'::jsonb)
    ) AS elem(url)
    WHERE w.status IN ('completed', 'approved')
      AND coalesce(w.resolved_at, w.created_at) < cutoff
      AND (w.photos <> '[]'::jsonb OR w.resolution_photos <> '[]'::jsonb)
    UNION ALL
    -- comment/reply photos attached to those same requests
    SELECT elem.url
    FROM task_board_replies r
    JOIN work_board w ON w.id = r.task_id
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(r.photos, '[]'::jsonb)) AS elem(url)
    WHERE w.status IN ('completed', 'approved')
      AND coalesce(w.resolved_at, w.created_at) < cutoff
      AND r.photos <> '[]'::jsonb
  LOOP
    CONTINUE WHEN photo_url IS NULL OR photo_url = '';
    -- only touch URLs that live in our public storage bucket
    CONTINUE WHEN position('/storage/v1/object/public/' IN photo_url) = 0;

    del_url := replace(photo_url, '/storage/v1/object/public/', '/storage/v1/object/');
    PERFORM net.http_delete(
      url     := del_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'apikey',        service_key
      )
    );
  END LOOP;

  -- 2. Empty the JSON photo columns so the app stops referencing the deleted
  --    files and the next run skips these rows. The ROW itself (rating, title,
  --    resolution note, history) is preserved.
  UPDATE task_board_replies r
  SET photos = '[]'::jsonb
  FROM work_board w
  WHERE w.id = r.task_id
    AND w.status IN ('completed', 'approved')
    AND coalesce(w.resolved_at, w.created_at) < cutoff
    AND r.photos <> '[]'::jsonb;

  UPDATE work_board
  SET photos = '[]'::jsonb, resolution_photos = '[]'::jsonb
  WHERE status IN ('completed', 'approved')
    AND coalesce(resolved_at, created_at) < cutoff
    AND (photos <> '[]'::jsonb OR resolution_photos <> '[]'::jsonb);
END;
$$;

-- 3. Schedule it daily at 06:15 AM IST (00:45 UTC), just after the task reset.
--    cron.schedule(name, ...) is idempotent — re-running just updates it.
SELECT cron.schedule(
  'purge-completed-fix-photos',
  '45 0 * * *',                       -- 00:45 UTC daily = 06:15 IST
  $$ SELECT purge_completed_fix_photos(); $$
);

-- =============================================
-- USEFUL CHECKS
-- =============================================
-- See the scheduled job:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'purge-completed-fix-photos';
--
-- Run it right now to test (deletes photos of completed fixes older than 1 day):
--   SELECT purge_completed_fix_photos();
--
-- Inspect recent pg_net delete calls / results:
--   SELECT id, status_code, error_msg FROM net._http_response ORDER BY id DESC LIMIT 10;
--
-- Remove the schedule later if needed:
--   SELECT cron.unschedule('purge-completed-fix-photos');
-- =============================================
