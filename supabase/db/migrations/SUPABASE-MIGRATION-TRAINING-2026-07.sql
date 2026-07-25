-- =============================================
-- AMBRIA OPS — TRAINING MIGRATION (July 2026)
-- Adds: per-video deadline, per-staff assignments, assessment quiz tables,
--       and seeds the default department training topics.
-- HOW TO RUN:
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file -> Run
-- Safe to run multiple times (idempotent).
-- =============================================

-- ---------------------------------------------
-- 1. TRAINING VIDEOS: optional default (department-wide) deadline
-- ---------------------------------------------
ALTER TABLE training_videos
  ADD COLUMN IF NOT EXISTS deadline DATE;

-- ---------------------------------------------
-- 2. TRAINING ASSIGNMENTS: assign a video to specific staff,
--    each with their own deadline (overrides the video's default).
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS training_assignments (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  deadline DATE,
  assigned_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_training_assignments_user ON training_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_training_assignments_video ON training_assignments(video_id);

-- ---------------------------------------------
-- 3. ASSESSMENT tables (created earlier in COMPLETE-SCHEMA;
--    re-declared here with IF NOT EXISTS so this migration is self-contained).
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS training_quizzes (
  id SERIAL PRIMARY KEY,
  video_id INTEGER,
  question TEXT NOT NULL,
  question_hi TEXT,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,          -- 'a' | 'b' | 'c' | 'd'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_quizzes_video ON training_quizzes(video_id);

CREATE TABLE IF NOT EXISTS quiz_results (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed BOOLEAN DEFAULT false,
  answers JSONB,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_video ON quiz_results(video_id);

-- ---------------------------------------------
-- 4. RLS: "Allow all" (matches every other table's pattern)
-- ---------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['training_assignments','training_quizzes','quiz_results']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
    EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ---------------------------------------------
-- 5. SEED default department training topics (only if not already present).
--    department codes: k=Housekeeping, h=Horticulture, a=Admin, s=Security
-- ---------------------------------------------
INSERT INTO training_videos (department, topic, topic_hi, youtube_url, youtube_id, sort_order, is_active, created_by)
SELECT d, topic, topic_hi, '', '', so, true, 'system'
FROM (VALUES
  ('k','Housekeeping Full Training','हाउसकीपिंग फुल ट्रेनिंग',0),
  ('k','Washroom Cleaning SOP','शौचालय सफ़ाई SOP',1),
  ('k','Floor Mopping Technique','फ़र्श पोछा तकनीक',2),
  ('k','Bed Making Standards','बिस्तर बनाने की विधि',3),
  ('k','Chemical Safety & Handling','केमिकल सुरक्षा',4),
  ('k','Guest Room Inspection','गेस्ट रूम निरीक्षण',5),
  ('h','Lawn Care & Maintenance','लॉन केयर',0),
  ('h','Hedge Trimming Guide','हेज कटाई गाइड',1),
  ('h','Fertilizer Application','खाद का उपयोग',2),
  ('h','Pest Control Methods','कीट नियंत्रण',3),
  ('h','Tree Pruning Technique','पेड़ काटने की तकनीक',4),
  ('h','Sprinkler System Operation','स्प्रिंकलर ऑपरेशन',5),
  ('a','Facility Management Basics','फैसिलिटी मैनेजमेंट',0),
  ('a','DG Set Operation','डीजी सेट',1),
  ('a','CCTV System Monitoring','सीसीटीवी मॉनिटरिंग',2),
  ('a','Vendor Management','वेंडर प्रबंधन',3),
  ('a','Event Coordination','इवेंट समन्वय',4),
  ('s','Fire Safety Training','अग्नि सुरक्षा ट्रेनिंग',0),
  ('s','Fire Extinguisher Usage','अग्निशामक उपयोग',1),
  ('s','First Aid & CPR','प्राथमिक उपचार',2),
  ('s','Security Guard Protocol','सुरक्षा प्रोटोकॉल',3),
  ('s','Emergency Evacuation Drill','आपातकालीन निकासी',4),
  ('s','CCTV Monitoring','सीसीटीवी मॉनिटरिंग',5)
) AS seed(d, topic, topic_hi, so)
WHERE NOT EXISTS (
  SELECT 1 FROM training_videos v WHERE v.department = seed.d AND v.topic = seed.topic
);

-- =============================================
-- DONE!
-- Verify:
--   SELECT department, count(*) FROM training_videos GROUP BY department;
--   SELECT * FROM training_assignments LIMIT 1;
-- =============================================
