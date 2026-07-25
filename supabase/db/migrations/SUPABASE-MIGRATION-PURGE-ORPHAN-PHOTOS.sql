-- =============================================
-- AMBRIA OPS — one-time / recurring cleanup of ORPHANED task media
-- Deletes files in the photos bucket's `tasks/` and `task-voice/` folders that
-- are no longer referenced by ANY task (before_photo, completion_photo,
-- rejection_voice_url). These pile up because the daily reset only deletes
-- media still linked to a task at reset time — files orphaned earlier stay.
--
-- SAFE: it never deletes a file a task still points at, and only touches the
-- tasks/ and task-voice/ folders (fix-request `work_board/` and attendance
-- media are left untouched).
--
-- Needs the service_role key in Vault (same one the daily reset uses).
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================

CREATE OR REPLACE FUNCTION purge_orphan_photos()
RETURNS integer                              -- how many delete requests were fired
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
  obj_name    text;
  n           integer := 0;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF service_key IS NULL THEN
    RAISE NOTICE 'No service_role_key in Vault — nothing deleted.';
    RETURN 0;
  END IF;

  FOR obj_name IN
    -- every task-owned media URL currently referenced in the DB, as its
    -- storage object name (e.g. "tasks/123_abc.jpg")
    WITH referenced AS (
      SELECT DISTINCT substring(url FROM '/storage/v1/object/public/photos/(.*)$') AS name
      FROM (
        SELECT jsonb_array_elements_text(
                 coalesce(before_photo, '[]'::jsonb) || coalesce(completion_photo, '[]'::jsonb)
               ) AS url FROM tasks
        UNION ALL
        SELECT rejection_voice_url AS url FROM tasks
      ) u
      WHERE url IS NOT NULL AND url <> ''
    )
    SELECT o.name
    FROM storage.objects o
    WHERE o.bucket_id = 'photos'
      AND (o.name LIKE 'tasks/%' OR o.name LIKE 'task-voice/%')
      AND o.name NOT LIKE '%.emptyFolderPlaceholder'
      AND NOT EXISTS (SELECT 1 FROM referenced r WHERE r.name = o.name)
  LOOP
    PERFORM net.http_delete(
      url     := 'https://kwqbgymqbcfvtvelunxo.supabase.co/storage/v1/object/photos/' || obj_name,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'apikey',        service_key
      )
    );
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Fired % delete request(s) for orphaned task media.', n;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------------
-- RUN IT NOW (clears the current backlog). Returns how many files it removed:
--   SELECT purge_orphan_photos();
-- Then confirm the deletes succeeded (should be 200s):
--   SELECT status_code, content FROM net._http_response ORDER BY id DESC LIMIT 10;
--
-- OPTIONAL — run it automatically every Sunday 04:00 UTC (needs pg_cron):
--   select cron.schedule('purge-orphan-photos', '0 4 * * 0',
--     $$ select purge_orphan_photos(); $$);
-- ---------------------------------------------------------------------------
