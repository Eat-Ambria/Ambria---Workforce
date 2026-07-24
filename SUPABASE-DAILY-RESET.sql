-- =============================================
-- AMBRIA OPS — DAILY TASK RESET (6:00 AM IST)
-- Resets recurring SOP tasks back to "pending" each morning so every
-- day/week/month starts fresh, AND deletes the before/after photos AND any
-- send-back voice note those tasks accumulated (from the "photos" storage
-- bucket) so storage doesn't grow forever. Runs on the Supabase server via pg_cron.
--
-- Cadence:
--   daily   -> reset every day
--   weekly  -> reset every Monday
--   monthly -> reset on the 1st of the month
--
-- HOW TO INSTALL (single step):
--   1. In STEP 0 below, paste your service_role key in place of the placeholder.
--   2. Paste this whole file in Supabase SQL Editor and Run.
-- Safe to run multiple times (secret upserts, function is replaced, job re-scheduled).
--
-- ⚠️  SECURITY: the key is only needed at run time. After running, either revert
--     the placeholder or DON'T commit this file with the real key in it.
-- =============================================

-- STEP 0 — store/refresh the service_role key in Supabase Vault.
--   Photo deletion calls the Storage API, which needs this key. We keep it in
--   Vault so the reset function never has it hardcoded.
--   Find it: Supabase Dashboard -> Settings -> API -> "service_role" secret.
--   Leaving the placeholder is safe: the reset still clears tasks, it just
--   skips photo deletion (fail-open).
DO $$
DECLARE
  k   text := 'PASTE-YOUR-SERVICE-ROLE-KEY-HERE';
  sid uuid;
BEGIN
  IF k = 'PASTE-YOUR-SERVICE-ROLE-KEY-HERE' THEN
    RAISE NOTICE 'STEP 0 skipped: replace the placeholder with your service_role key to enable photo deletion.';
  ELSE
    -- Vault must be changed via its functions (direct UPDATE on vault.secrets
    -- is permission-denied on Supabase).
    SELECT id INTO sid FROM vault.secrets WHERE name = 'service_role_key';
    IF sid IS NOT NULL THEN
      PERFORM vault.update_secret(sid, k);
      RAISE NOTICE 'STEP 0: service_role_key updated in Vault.';
    ELSE
      PERFORM vault.create_secret(k, 'service_role_key');
      RAISE NOTICE 'STEP 0: service_role_key stored in Vault.';
    END IF;
  END IF;
END $$;

-- 1. Extensions: scheduler + HTTP client for calling the Storage API.
--    If either errors, enable it from Dashboard -> Database -> Extensions,
--    then run the rest of the file. (Vault is enabled by default on Supabase.)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. The reset function — deletes photos from storage, then marks tasks pending.
--    SECURITY DEFINER so it can read the service_role key from Vault.
CREATE OR REPLACE FUNCTION reset_recurring_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ist         timestamptz := now() AT TIME ZONE 'Asia/Kolkata';
  service_key text;
  photo_url   text;
  del_url     text;
BEGIN
  -- Which recurring tasks reset this run (daily always; weekly Mon; monthly 1st).
  -- Reused for BOTH the photo cleanup and the row reset below.
  -- (kept inline in each statement so the function stays a single unit)

  -- service_role key from Vault — required to authorize storage deletes.
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- 1. Delete every before/after photo belonging to a task that is about to reset.
  --    We turn each stored public URL into its authenticated delete endpoint
  --    (.../object/public/photos/x -> .../object/photos/x) and fire an async
  --    DELETE via pg_net. Skipped entirely if the Vault secret is missing.
  IF service_key IS NOT NULL THEN
    FOR photo_url IN
      -- before/after photos (JSON arrays)
      SELECT elem.url
      FROM tasks t
      CROSS JOIN LATERAL jsonb_array_elements_text(
        coalesce(t.before_photo, '[]'::jsonb) || coalesce(t.completion_photo, '[]'::jsonb)
      ) AS elem(url)
      WHERE t.category = 'daily'
         OR (t.category = 'weekly'  AND EXTRACT(DOW FROM ist) = 1)
         OR (t.category = 'monthly' AND EXTRACT(DAY FROM ist) = 1)
      UNION ALL
      -- send-back voice note audio (single URL column), if any
      SELECT t.rejection_voice_url
      FROM tasks t
      WHERE t.rejection_voice_url IS NOT NULL AND t.rejection_voice_url <> ''
        AND (t.category = 'daily'
         OR (t.category = 'weekly'  AND EXTRACT(DOW FROM ist) = 1)
         OR (t.category = 'monthly' AND EXTRACT(DAY FROM ist) = 1))
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
  END IF;

  -- 2. Clear the whole workflow (incl. both photo columns) and mark tasks pending.
  --    Issue fields are cleared ONLY when the issue was already resolved — an
  --    unresolved issue (issue / issue_working) survives the reset so the admin
  --    doesn't lose it. (CASE reads the pre-update issue_status.)
  UPDATE tasks SET
    status                  = 'pending',
    issue_status            = CASE WHEN issue_status = 'issue_resolved' THEN NULL ELSE issue_status END,
    resolved_at             = CASE WHEN issue_status = 'issue_resolved' THEN NULL ELSE resolved_at END,
    notes                   = CASE WHEN issue_status = 'issue_resolved' THEN NULL ELSE notes END,
    before_photo            = '[]'::jsonb,
    started_at              = NULL,
    started_by              = NULL,
    completion_photo        = '[]'::jsonb,
    completion_note         = NULL,
    completion_requested_at = NULL,
    completed_at            = NULL,
    completed_by            = NULL,
    approved_by             = NULL,
    approved_at             = NULL,
    rejection_note          = NULL,
    rejection_voice_url     = NULL,
    task_date               = (now() AT TIME ZONE 'Asia/Kolkata')::date
  WHERE
        category = 'daily'
     OR (category = 'weekly'  AND EXTRACT(DOW  FROM ist) = 1)   -- Monday
     OR (category = 'monthly' AND EXTRACT(DAY  FROM ist) = 1);  -- 1st of month
END;
$$;

-- 3. Schedule it for 06:00 AM IST every day.
--    Supabase servers run in UTC, and 06:00 IST = 00:30 UTC.
--    cron.schedule(name, ...) is idempotent — re-running just updates it.
SELECT cron.schedule(
  'reset-recurring-tasks',
  '30 0 * * *',                       -- 00:30 UTC daily = 06:00 IST
  $$ SELECT reset_recurring_tasks(); $$
);

-- =============================================
-- USEFUL CHECKS
-- =============================================
-- See the scheduled job:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'reset-recurring-tasks';
--
-- Confirm the Vault secret exists:
--   SELECT name FROM vault.secrets WHERE name = 'service_role_key';
--
-- Run the reset right now (to test it — deletes today's photos + resets tasks):
--   SELECT reset_recurring_tasks();
--
-- Inspect recent pg_net calls (did the storage deletes go out / succeed?):
--   SELECT id, created FROM net.http_request_queue ORDER BY id DESC LIMIT 10;         -- still queued
--   SELECT id, status_code, error_msg FROM net._http_response ORDER BY id DESC LIMIT 10; -- results
--
-- Remove the schedule later if needed:
--   SELECT cron.unschedule('reset-recurring-tasks');
-- =============================================
