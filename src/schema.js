/**
 * SUPABASE DATABASE SCHEMA — AMBRIA WORKFORCE APP
 * Reference this file before writing ANY Supabase query.
 * Never use column names not listed here.
 *
 * TABLE: tasks
 * COLUMNS: id, property, department, category, title, title_hi, area, priority,
 *          duration, description, description_hi, time_block, assigned_to, assignee_name,
 *          status, is_team, completed_at, completed_by, notes, task_date, created_at
 * NOTE: NO "date" column — use "task_date". NO "task_key" — use "id". NO "photos" column.
 *
 * TABLE: assigned_tasks
 * COLUMNS: id, from_user, from_name, to_user, to_name, to_color, property, text,
 *          photo_url, status, due_date, completed_at, completion_note, completion_photo,
 *          remarks_sa, created_at
 * NOTE: NO "photo" column — use "photo_url". NO "from" or "to" — use "from_user"/"to_user".
 *
 * TABLE: attendance
 * COLUMNS: id, user_id, user_name, date, check_in, check_out, status, created_at
 * NOTE: NO "property" column. NO "ci"/"co" — use "check_in"/"check_out".
 *       NO "check_in_photo" or "check_out_photo".
 *
 * TABLE: leaves
 * COLUMNS: id, user_id, user_name, leave_date, leave_type, reason, status, approved_by, created_at
 * NOTE: NO "start_date" or "end_date" — single "leave_date" only.
 *
 * TABLE: duty_roster
 * COLUMNS: id, user_id, user_name, property, shift_type, shift_start, shift_end,
 *          date, assigned_by, notes, created_at
 *
 * TABLE: training_progress
 * COLUMNS: id, user_id, department, video_key, completed, completed_at
 *
 * TABLE: photos
 * COLUMNS: id, task_id, user_id, photo_url, caption, taken_at
 *
 * TABLE: users
 * COLUMNS: id, username, password, name, role, property, department, phone,
 *          joining_date, is_active, left_date, created_at
 *
 * TABLE: notifications
 * COLUMNS: id, type, task_text, by_user, by_name, for_user, property, is_read, created_at
 *
 * TABLE: assigned_task_replies
 * COLUMNS: id, task_id, by_user, by_name, text, photo_url, reply_type, created_at
 * NOTE: NO "from_user"/"from_name" — use "by_user"/"by_name".
 *       NO "photo" — use "photo_url". NO "type" — use "reply_type".
 */

export {}; // keep as module
