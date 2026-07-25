-- =============================================
-- AMBRIA OPS — store each user's language for localized push
-- The in-app bell already localizes on the client, but push text is built
-- server-side (Edge Function), which needs to know each user's language.
-- The app writes users.lang whenever a user changes language / logs in.
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'en';

-- Verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='lang';
