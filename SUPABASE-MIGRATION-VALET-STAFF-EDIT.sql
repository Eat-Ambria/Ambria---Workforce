-- =============================================
-- AMBRIA OPS — EDITABLE VALET STAFFING
-- 1. valet_bookings.staff_breakdown  -> per-booking override of the staff numbers
-- 2. valet_matrix                    -> the staffing "logic" (tiers per property),
--                                       editable by admins in the calculator
-- HOW TO RUN: paste this whole file in Supabase SQL Editor and Run.
-- Non-destructive: safe to run multiple times, keeps existing bookings.
-- =============================================

-- 1. Per-booking staff override (array of {role, count}); NULL = use the matrix.
ALTER TABLE valet_bookings
  ADD COLUMN IF NOT EXISTS staff_breakdown JSONB;

-- 2. Editable staffing matrix, one row per property.
CREATE TABLE IF NOT EXISTS valet_matrix (
  property TEXT PRIMARY KEY,              -- pp, ex, mk, rs
  name TEXT,
  roles JSONB NOT NULL,                   -- ["Key Man","Driver","Guard","Rider"]
  tiers JSONB NOT NULL,                   -- [{"max":150,"values":[1,2,0,0]}, ...]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with the current built-in matrix (only if the row doesn't exist yet,
-- so admin edits are never overwritten by re-running this file).
INSERT INTO valet_matrix (property, name, roles, tiers) VALUES
('pp', 'Pushpanjali',
 '["Key Man","Driver","Guard","Rider"]',
 '[{"max":150,"values":[1,2,0,0]},{"max":250,"values":[1,4,0,0]},{"max":350,"values":[1,5,1,0]},{"max":500,"values":[1,7,1,0]},{"max":800,"values":[1,10,2,1]},{"max":1000,"values":[1,13,2,1]}]'),
('ex', 'Exotica',
 '["Key Man","Driver","Guard","Rider"]',
 '[{"max":100,"values":[1,2,0,0]},{"max":200,"values":[1,3,0,0]},{"max":300,"values":[1,5,1,0]},{"max":400,"values":[1,6,2,0]},{"max":500,"values":[1,8,2,0]},{"max":600,"values":[1,10,2,1]},{"max":700,"values":[2,12,2,1]},{"max":800,"values":[2,14,2,1]},{"max":900,"values":[2,17,3,1]},{"max":1000,"values":[2,19,3,1]}]'),
('mk', 'Manaktala',
 '["Key Man","Driver","Guard","Rider"]',
 '[{"max":150,"values":[1,2,0,0]},{"max":250,"values":[1,4,0,0]},{"max":350,"values":[1,5,0,0]},{"max":450,"values":[1,6,1,0]},{"max":550,"values":[1,8,1,0]},{"max":700,"values":[1,9,1,1]},{"max":900,"values":[1,11,3,1]}]'),
('rs', 'Restro',
 '["Key Man","Driver","Guard"]',
 '[{"max":100,"values":[1,3,0]},{"max":150,"values":[1,4,0]},{"max":200,"values":[1,5,1]}]')
ON CONFLICT (property) DO NOTHING;

-- RLS + "Allow all" policy (matches every other table's pattern)
ALTER TABLE valet_matrix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON valet_matrix;
CREATE POLICY "Allow all" ON valet_matrix FOR ALL USING (true) WITH CHECK (true);

-- Refresh PostgREST's schema cache so the API sees the new column + table.
NOTIFY pgrst, 'reload schema';

-- =============================================
-- DONE! Verify with:
--   SELECT property, name FROM valet_matrix ORDER BY property;
--   SELECT column_name FROM information_schema.columns WHERE table_name='valet_bookings' AND column_name='staff_breakdown';
-- =============================================
