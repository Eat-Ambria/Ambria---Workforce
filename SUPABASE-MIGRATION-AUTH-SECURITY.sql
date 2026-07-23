-- =============================================
-- AMBRIA OPS — AUTH SECURITY
-- Fixes plaintext passwords + world-readable users table.
--   1. Hashes existing passwords with bcrypt (and auto-hashes future ones)
--   2. Adds verify_login() so login happens server-side and never returns the hash
--   3. Locks the users table: read-only to the app, password column NOT selectable
-- HOW TO RUN: paste this whole file in Supabase SQL Editor and Run.
-- Safe to run multiple times.
--
-- ⚠️ After running this you MUST use the updated app (AuthContext calls
--    verify_login). The old client-side password check will no longer work,
--    because the password column is now hidden and hashed.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Hash any existing plaintext passwords (skip rows already bcrypt-hashed).
UPDATE users
   SET password = crypt(password, gen_salt('bf', 10))
 WHERE password IS NOT NULL AND password NOT LIKE '$2%';

-- 2. Auto-hash on future insert/update so plaintext never persists
--    (e.g. when you add a user via the Supabase Table Editor).
CREATE OR REPLACE FUNCTION hash_user_password()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.password IS NOT NULL AND new.password NOT LIKE '$2%' THEN
    new.password := crypt(new.password, gen_salt('bf', 10));
  END IF;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS trg_hash_user_password ON users;
CREATE TRIGGER trg_hash_user_password
  BEFORE INSERT OR UPDATE OF password ON users
  FOR EACH ROW EXECUTE FUNCTION hash_user_password();

-- 3. Server-side login: verifies the hash, returns the user WITHOUT the password.
--    SECURITY DEFINER so it can read the password column even though the app can't.
CREATE OR REPLACE FUNCTION verify_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u public.users;
BEGIN
  SELECT * INTO u FROM public.users
   WHERE username = lower(trim(p_username)) LIMIT 1;
  IF u.id IS NULL THEN RETURN NULL; END IF;
  IF u.password IS NULL OR u.password <> crypt(p_password, u.password) THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(u) - 'password';
END;
$$;
GRANT EXECUTE ON FUNCTION verify_login(text, text) TO anon, authenticated;

-- 4. Lock down the users table for the public (anon) API.
--    Read-only via RLS (no insert/update/delete policy = denied), and the
--    password column is removed from what anon/authenticated may select.
--    (Admin user management still works from the Supabase dashboard, which
--     uses the service_role and bypasses all of this.)
DROP POLICY IF EXISTS "Allow all" ON users;
DROP POLICY IF EXISTS "read users" ON users;
CREATE POLICY "read users" ON users FOR SELECT USING (true);

REVOKE SELECT ON public.users FROM anon, authenticated;
GRANT SELECT (id, username, name, role, property, department, phone,
              joining_date, is_active, left_date, designation, access, created_at)
  ON public.users TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- =============================================
-- VERIFY:
--   -- passwords should now start with "$2" (bcrypt):
--   SELECT username, left(password, 4) AS hash_prefix FROM users;
--   -- login check (returns the user json, or null if wrong):
--   SELECT verify_login('some_username', 'their_password');
--   -- this should now ERROR (password column hidden from anon) — that's good:
--   -- run it in a SQL editor "as anon" if you want to confirm.
-- =============================================
