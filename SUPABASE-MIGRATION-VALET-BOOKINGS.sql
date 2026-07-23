-- =============================================
-- AMBRIA OPS — VALET BOOKINGS
-- Adds a calendar of valet bookings. Each booking is an event on a date at a
-- property, with a guest count (used to compute valet staffing) and contact.
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> your project -> SQL Editor -> New query
--   2. Paste this ENTIRE file
--   3. Click "Run"
--
-- ⚠️  This DROPS and recreates valet_bookings to guarantee the correct schema
--     (an earlier run created it with the wrong `id` type). The table holds no
--     real data yet, so this is safe. If you already have bookings you want to
--     keep, tell me before running and I'll write a non-destructive version.
-- =============================================

DROP TABLE IF EXISTS valet_bookings CASCADE;

CREATE TABLE valet_bookings (
  id TEXT PRIMARY KEY,                    -- app-generated, e.g. "v_1784526630906_..."
  property TEXT NOT NULL,                 -- pp, ex, mk, rs
  event_date DATE NOT NULL,              -- the day valet service is needed
  event_time TEXT,                       -- free text, e.g. "7 PM onwards"
  customer_name TEXT,
  phone TEXT,
  guests INTEGER DEFAULT 0,             -- expected guest count
  staff_total INTEGER,                   -- valet staff snapshot from the matrix at booking time
  staff_breakdown JSONB,                 -- per-booking override [{role,count}]; NULL = use matrix
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- at most one booking per property per day
  CONSTRAINT valet_bookings_property_date_unique UNIQUE (property, event_date)
);

CREATE INDEX IF NOT EXISTS idx_valet_bookings_property ON valet_bookings(property);
CREATE INDEX IF NOT EXISTS idx_valet_bookings_date ON valet_bookings(event_date);

-- Refresh PostgREST's schema cache so the API sees the table immediately.
NOTIFY pgrst, 'reload schema';

-- RLS + "Allow all" policy (matches every other table's pattern)
ALTER TABLE valet_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON valet_bookings;
CREATE POLICY "Allow all" ON valet_bookings FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DONE! Verify with:
--   SELECT * FROM valet_bookings LIMIT 1;
-- =============================================
