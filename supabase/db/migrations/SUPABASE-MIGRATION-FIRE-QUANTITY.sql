-- =============================================
-- AMBRIA OPS — FIRE SAFETY: cylinder quantity
-- Adds a `quantity` column to fire_extinguishers so one register entry can
-- represent multiple identical cylinders at the same location (e.g. 3 × 6 kg
-- in the main lobby). Defaults to 1 so all existing rows stay valid.
--
-- HOW TO INSTALL: paste in Supabase SQL Editor and Run. Safe to re-run.
-- =============================================

ALTER TABLE fire_extinguishers ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;

-- backfill any existing rows that predate this column
UPDATE fire_extinguishers SET quantity = 1 WHERE quantity IS NULL;
