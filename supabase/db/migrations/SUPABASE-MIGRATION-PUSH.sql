-- =============================================
-- AMBRIA OPS — Web Push (Phase 2)
-- Stores each device's push subscription so a Supabase Edge Function can send
-- OS-level push notifications (even when the app is closed) whenever a row is
-- inserted into `notifications`.
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,   -- the browser push endpoint (one per device/browser)
  p256dh     TEXT NOT NULL,          -- public key from the subscription
  auth       TEXT NOT NULL,          -- auth secret from the subscription
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions (user_id);

-- Match the app's existing open-RLS model so the anon key can save/remove a
-- device subscription. (The Edge Function reads these with the service role,
-- which bypasses RLS.)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON push_subscriptions;
CREATE POLICY "Allow all" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- Verify:
--   SELECT count(*) FROM push_subscriptions;
