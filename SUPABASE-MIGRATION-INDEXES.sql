-- =============================================
-- AMBRIA OPS — PERFORMANCE INDEXES
-- Run this in the Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS).
-- Speeds up the queries the app runs most as data grows
-- (task lists, dashboards, fix requests, user management).
-- =============================================

-- ---- tasks ----------------------------------------------------------------
-- Employee "My Tasks" filters by assignee; admin lists filter by property /
-- department / status / category and sort by task_date.
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_property     ON tasks(property);
CREATE INDEX IF NOT EXISTS idx_tasks_department   ON tasks(department);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category     ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date     ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_task_date    ON tasks(task_date);
-- common admin combo: a property's tasks in a given status
CREATE INDEX IF NOT EXISTS idx_tasks_prop_status  ON tasks(property, status);

-- ---- work_board (fix requests) --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_work_board_assigned_to ON work_board(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_board_property    ON work_board(property);
CREATE INDEX IF NOT EXISTS idx_work_board_department  ON work_board(department);
CREATE INDEX IF NOT EXISTS idx_work_board_status      ON work_board(status);

-- ---- users ----------------------------------------------------------------
-- username is already UNIQUE (indexed). These help the User Management filters
-- and the per-request scoping / member dropdowns.
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_property   ON users(property);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_is_active  ON users(is_active);

-- =============================================
-- SAFETY LIMITS — protect the database under heavy concurrent load
-- =============================================
-- Cap how long any single API query may run. Without this, one accidental
-- heavy/looping query can hold resources and slow the site for everyone.
-- 15s is generous for this app's queries (most finish in a few ms once indexed).
-- 'anon' and 'authenticated' are the roles the Supabase REST API uses.
ALTER ROLE anon           SET statement_timeout = '15s';
ALTER ROLE authenticated  SET statement_timeout = '15s';

-- Don't let a stuck/abandoned transaction pin a connection open.
ALTER ROLE anon           SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE authenticated  SET idle_in_transaction_session_timeout = '30s';

-- Apply the new role settings to the API immediately.
NOTIFY pgrst, 'reload config';

-- =============================================
-- DONE.
-- =============================================
