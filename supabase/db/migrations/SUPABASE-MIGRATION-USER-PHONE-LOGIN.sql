-- =============================================
-- AMBRIA OPS — phone-number login + 4-digit PIN
-- Users can now sign in with EITHER their username OR their phone number,
-- and their password is a 4-digit PIN. Phone must be unique when set (it's a
-- login identifier), but stays optional — many users may have no phone.
-- Run in Supabase -> SQL Editor. Safe to run multiple times.
-- =============================================

-- 1) Normalize existing phone numbers to the same canonical form the app now
--    stores (digits only, India country code / leading 0 stripped to 10 digits).
--    This makes login match regardless of how the number was originally typed.
--    Idempotent — safe to run again.
UPDATE users SET phone = regexp_replace(phone, '\D', '', 'g')
  WHERE phone IS NOT NULL AND phone ~ '\D';
UPDATE users SET phone = right(phone, 10) WHERE phone ~ '^91[0-9]{10}$';
UPDATE users SET phone = right(phone, 10) WHERE phone ~ '^0[0-9]{10}$';

-- 2) Enforce unique phone numbers, but only for rows that actually have one.
--    (Partial unique index → multiple NULL/blank phones are still allowed.)
--    If this errors, normalization revealed duplicate phones — find them with:
--      SELECT phone, count(*) FROM users
--      WHERE phone IS NOT NULL AND phone <> '' GROUP BY phone HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- Verify:
--   SELECT indexname FROM pg_indexes WHERE tablename='users' AND indexname='users_phone_unique';
