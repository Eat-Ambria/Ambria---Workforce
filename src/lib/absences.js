import { supabase } from './supabase'

// Who was not in, on which day.
//
// Two screens read this and they must agree: the task board hides an absent
// person's work for today, and Analytics stops counting it against them for the
// same day. If one of them used a different rule the board would say a day was
// written off and the report would still call it missed — so the rule lives
// here once and both import it.
//
// A day is a plain 'YYYY-MM-DD' string throughout, never a Date. The column is
// `date`, PostgREST hands it back as that string, and comparing strings is what
// every other date filter in this app already does. Turning them into Dates
// would only introduce a timezone to get wrong.

// The set is keyed by both together, because the question is never "is this
// person ever absent" — it is always "was this person out on THAT day".
export const absenceKey = (userId, day) => `${userId}|${day}`

/**
 * Every absence between two dates, as a Set of `${user_id}|${date}` keys.
 *
 * `to` is inclusive: callers pass the last day they are reporting on, not the
 * day after. Analytics' own range is half-open and steps its `to` back by one
 * before it gets here, which is the same convention its RPC arguments use.
 *
 * Returns an empty Set on any failure, including the table not existing yet.
 * That is deliberate: before the migration is run, every screen that uses this
 * should behave exactly as it did before rather than refusing to render. An
 * empty set means "nobody was absent", which is the old behaviour precisely.
 */
export async function loadAbsences(from, to) {
  try {
    const { data, error } = await supabase
      .from('staff_absences')
      .select('user_id, absent_date')
      .gte('absent_date', from)
      .lte('absent_date', to)
    if (error) return new Set()
    return new Set((data || []).map((r) => absenceKey(r.user_id, r.absent_date)))
  } catch {
    return new Set()
  }
}

/**
 * The rows for one day, with who recorded them and why — what the board needs
 * to show an "absent today" line and undo it.
 *
 * Kept separate from `loadAbsences` rather than given a flag: the board wants a
 * handful of rows with their reasons, Analytics wants thousands of keys and
 * none of the detail. One function returning both shapes would make every
 * caller sort out which half it asked for.
 */
export async function loadAbsentOn(day) {
  try {
    const { data, error } = await supabase
      .from('staff_absences')
      .select('id, user_id, absent_date, reason, created_by')
      .eq('absent_date', day)
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

/**
 * Record somebody as absent on a day.
 *
 * An upsert, not an insert: marking the same person absent twice on one day is
 * the same statement made twice. Without the conflict target the second tap
 * would be a unique-violation the admin has to read and dismiss.
 */
export async function markAbsent(userId, day, { reason = null, by = null } = {}) {
  return supabase
    .from('staff_absences')
    .upsert(
      { user_id: userId, absent_date: day, reason: reason || null, created_by: by || null },
      { onConflict: 'user_id,absent_date' }
    )
}

/**
 * Undo it — they turned up after all.
 *
 * A delete rather than a status column. An absence that was recorded by mistake
 * is not a fact about the day, and keeping it as `cancelled` would mean every
 * reader above has to remember to exclude it. The row's whole job is to exist.
 */
export async function clearAbsent(userId, day) {
  return supabase
    .from('staff_absences')
    .delete()
    .eq('user_id', userId)
    .eq('absent_date', day)
}
