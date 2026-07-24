-- =============================================
-- AMBRIA OPS — AUTO-CLEAR RESOLVED ISSUES (after 1 day)
-- When an admin marks a staff-reported issue as "Resolved", the task sits in
-- the 'issue_resolved' state. This shows a green "Resolved" card to the employee
-- and keeps the item in the admin's issue view. One day later we want that
-- raised issue GONE from both sides — but WITHOUT destroying the underlying
-- (often recurring) SOP task. So we clear the issue back to the normal 'pending'
-- state and wipe the issue text + any before/after photos it accumulated.
--
-- Trigger: the app now stamps tasks.resolved_at = now() when the admin resolves
-- an issue (see AdminTasks.resolveIssue). This job clears anything resolved
-- more than 1 day ago. Runs hourly via pg_cron so the "1 day" is honoured
-- regardless of the task's daily/weekly/monthly reset cadence.
--
-- HOW TO INSTALL (single step):
--   1. (Optional) In STEP 0 below, paste your service_role key to enable photo
--      deletion — same key used by SUPABASE-DAILY-RESET.sql. If you already ran
--      that file, the key is already in Vault and you can leave STEP 0 as-is.
--   2. Paste this whole file in the Supabase SQL Editor and Run.
-- Safe to run multiple times (column add is IF NOT EXISTS, function is replaced,
-- job is re-scheduled).
-- =============================================

-- STEP 0 — (only if you have NOT already stored the key via the daily-reset file)
--   store/refresh the service_role key in Vault so photo deletes can authorize.
--   Leaving the placeholder is safe: the cleanup still clears the issue, it just
--   skips deleting the photos from storage (fail-open).
DO $$
DECLARE
  k   text := 'PASTE-YOUR-SERVICE-ROLE-KEY-HERE';
  sid uuid;
BEGIN
  IF k = 'PASTE-YOUR-SERVICE-ROLE-KEY-HERE' THEN
    RAISE NOTICE 'STEP 0 skipped: key not pasted (fine if the daily-reset file already stored it).';
  ELSE
    SELECT id INTO sid FROM vault.secrets WHERE name = 'service_role_key';
    IF sid IS NOT NULL THEN
      PERFORM vault.update_secret(sid, k);
    ELSE
      PERFORM vault.create_secret(k, 'service_role_key');
    END IF;
  END IF;
END $$;

-- 1. Timestamp column — when the issue was marked resolved. NULL for every task
--    that isn't a resolved issue. Backfilled as NULL; only new resolutions set it.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- 2. Extensions (idempotent; already present if the daily-reset file was run).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. The cleanup function — delete stale resolved-issue photos, then clear the
--    issue back to a clean 'pending' task. SECURITY DEFINER to read the Vault key.
CREATE OR REPLACE FUNCTION clear_resolved_issues()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_key text;
  photo_url   text;
  del_url     text;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Delete the before/after photos of every issue resolved > 1 day ago.
  IF service_key IS NOT NULL THEN
    FOR photo_url IN
      SELECT elem.url
      FROM tasks t
      CROSS JOIN LATERAL jsonb_array_elements_text(
        coalesce(t.before_photo, '[]'::jsonb) || coalesce(t.completion_photo, '[]'::jsonb)
      ) AS elem(url)
      WHERE t.status = 'issue_resolved'
        AND t.resolved_at IS NOT NULL
        AND t.resolved_at < now() - interval '1 day'
      UNION ALL
      SELECT t.rejection_voice_url
      FROM tasks t
      WHERE t.status = 'issue_resolved'
        AND t.resolved_at IS NOT NULL
        AND t.resolved_at < now() - interval '1 day'
        AND t.rejection_voice_url IS NOT NULL AND t.rejection_voice_url <> ''
    LOOP
      CONTINUE WHEN photo_url IS NULL OR photo_url = '';
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
  END IF;

  -- Clear the raised issue: back to a fresh 'pending' task, issue text + workflow
  -- fields + photos wiped. The task itself (incl. recurring SOPs) survives.
  UPDATE tasks SET
    status                  = 'pending',
    notes                   = NULL,          -- the issue text the employee reported
    resolved_at             = NULL,
    before_photo            = '[]'::jsonb,
    started_at              = NULL,
    started_by              = NULL,
    completion_photo        = '[]'::jsonb,
    completion_note         = NULL,
    completion_requested_at = NULL,
    rejection_note          = NULL,
    rejection_voice_url     = NULL
  WHERE status = 'issue_resolved'
    AND resolved_at IS NOT NULL
    AND resolved_at < now() - interval '1 day';
END;
$$;

-- 4. Schedule it every hour so the 1-day window is enforced promptly.
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
-- Run it right now (to test — clears issues resolved > 1 day ago):
--   SELECT clear_resolved_issues();
--
-- Peek at what's currently waiting to be cleared:
--   SELECT id, title, resolved_at FROM tasks
--   WHERE status = 'issue_resolved' AND resolved_at < now() - interval '1 day';
--
-- Remove the schedule later if needed:
--   SELECT cron.unschedule('clear-resolved-issues');
-- =============================================
