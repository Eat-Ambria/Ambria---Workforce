-- =============================================
-- AMBRIA OPS — auto-delete old notifications
-- Keeps the notifications table small by removing rows older than 6 days.
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================

-- 1) The cleanup function: delete notifications older than 6 days.
--    (Removes both read and unread — 6 days is plenty of time to see them.)
CREATE OR REPLACE FUNCTION purge_old_notifications() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '6 days';
$$;

-- 2) Run it once right now to clear anything already older than 6 days:
SELECT purge_old_notifications();

-- 3) Schedule it to run automatically every day.
--    Requires the pg_cron extension: Supabase -> Database -> Extensions ->
--    search "pg_cron" -> enable. Then run the line below ONCE (uncommented):
--
--   select cron.schedule('purge-old-notifications', '45 3 * * *',
--     $$ select purge_old_notifications(); $$);
--
--   (03:45 UTC daily ≈ 09:15 IST.)

-- Verify the scheduled job exists (after step 3):
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'purge-old-notifications';
