// Organization reference data: properties, departments, roles.

export const PROPERTIES = [
  { code: 'pp', name: 'Pushpanjali', nameHi: 'पुष्पांजलि', area: 'Dwarka', areaHi: 'द्वारका', acreage: '3 Acres' },
  { code: 'ex', name: 'Exotica', nameHi: 'एक्सोटिका', area: 'Dwarka', areaHi: 'द्वारका', acreage: '4 Acres' },
  { code: 'mk', name: 'Manaktala', nameHi: 'मनकतला', area: 'Kapashera', areaHi: 'कापसहेड़ा', acreage: '3 Acres' },
  { code: 'rs', name: 'Restro', nameHi: 'रेस्ट्रो', area: 'Palam Vihar', areaHi: 'पालम विहार', acreage: '0.75 Acre' },
  // TODO: confirm the area / acreage for Janakpuri — placeholders for now
  { code: 'jp', name: 'Janakpuri', nameHi: 'जनकपुरी', area: 'Janakpuri', areaHi: 'जनकपुरी', acreage: '—' },
]

// property lookup incl. "all" (Vicky, Sandeep, Super Admin)
export const PROPERTY_MAP = PROPERTIES.reduce((m, p) => ({ ...m, [p.code]: p }), {
  all: { code: 'all', name: 'All Properties', nameHi: 'सभी प्रॉपर्टी', area: '', acreage: '' },
})

// Pickable departments (teams). "Admin" is a ROLE, not a department, so it's
// intentionally not selectable here — filter/assign by role instead.
// The four departments the venues actually run on. Admin is one of them here:
// it is also a role, but people are posted to it as a team.
// `color` is the department's band / dot — always carries WHITE text, so it has
// to be dark enough for that (Horticulture's old #16A34A gave white only 3.3:1,
// which is why the roster's green band was hard to read).
// `ink` is the same identity as TEXT on a pale tint of itself, where the band
// colour would be too light. Both are ≥ 4.5:1 against what they sit on.
export const DEPARTMENTS = [
  { code: 'a', name: 'Admin', nameHi: 'एडमिन', color: '#7B1E2F', ink: '#7B1E2F' },
  { code: 'h', name: 'Horticulture', nameHi: 'बागवानी', color: '#15803D', ink: '#166534' },
  { code: 'k', name: 'Housekeeping', nameHi: 'हाउसकीपिंग', color: '#2563EB', ink: '#1D4ED8' },
  { code: 's', name: 'Security', nameHi: 'सुरक्षा', color: '#6B21A8', ink: '#6B21A8' },
  // Added for repair requests — kitchen faults go to their own person. It has no
  // roster work yet; the band simply reads 0 until some is written.
  // Code 'kt' because 'k' has meant Housekeeping since the first schema.
  // Orange sits furthest from the other four under colour-blind simulation
  // (worst-case ΔE 17.6 against them, well clear of the 8 floor).
  { code: 'kt', name: 'Kitchen', nameHi: 'रसोई', color: '#9A3412', ink: '#9A3412' },
  // The trades. Added for repair work, but staff are posted to them, so they are
  // departments like any other — they appear in the roster, the staff form and
  // analytics too.
  //
  // Colours searched, not chosen: worst-case dE 15.2 across all nine under
  // normal / deuteranope / protanope / tritanope vision, against the floor of 8
  // Kitchen set. Nine categories is tight — Electrician sits near Housekeeping
  // in the blues and Painter near Kitchen in the oranges. They separate, but not
  // at a glance, so never let a dot be the only thing saying which is which.
  { code: 'el', name: 'Electrician', nameHi: 'बिजली मिस्त्री', color: '#1E40AF', ink: '#1E40AF' },
  { code: 'ms', name: 'Mistri work', nameHi: 'मिस्त्री का काम', color: '#86198F', ink: '#86198F' },
  { code: 'pt', name: 'Painter', nameHi: 'पेंटर', color: '#C2410C', ink: '#C2410C' },
  { code: 'cp', name: 'Carpenter', nameHi: 'बढ़ई', color: '#1F2937', ink: '#1F2937' },
]

// Retired codes. NOT offered when choosing a department, but kept here so any
// user or task still carrying one renders a readable name instead of a raw code
// — history should not turn into gibberish because a list was shortened.
const RETIRED_DEPARTMENTS = {
  sales: { code: 'sales', name: 'Sales', nameHi: 'बिक्री', color: '#D97706' },
  ops: { code: 'ops', name: 'Operations', nameHi: 'संचालन', color: '#4F46E5' },
  finance: { code: 'finance', name: 'Finance', nameHi: 'वित्त', color: '#059669' },
  marketing: { code: 'marketing', name: 'Marketing', nameHi: 'मार्केटिंग', color: '#DC2626' },
  oh: { code: 'oh', name: 'Overall Head', nameHi: 'ओवरऑल हेड', color: '#7C3AED' },
  sth: { code: 'sth', name: 'Site Head', nameHi: 'साइट हेड', color: '#B45309' },
  sv: { code: 'sv', name: 'Supervisor', nameHi: 'सुपरवाइज़र', color: '#0E7490' },
  sech: { code: 'sech', name: 'Security Head', nameHi: 'सिक्योरिटी हेड', color: '#9D174D' },
}

// Lookup: every live department plus every retired code, for display only.
export const DEPARTMENT_MAP = DEPARTMENTS.reduce(
  (m, d) => ({ ...m, [d.code]: d }),
  { ...RETIRED_DEPARTMENTS }
)

// Localized department / property display name. `lang` = 'hi' | 'en'.
export const deptName = (code, lang) => {
  const d = DEPARTMENT_MAP[code]
  if (!d) return code || ''
  return lang === 'hi' && d.nameHi ? d.nameHi : d.name
}
export const propName = (code, lang) => {
  const p = PROPERTY_MAP[code]
  if (!p) return code || ''
  return lang === 'hi' && p.nameHi ? p.nameHi : p.name
}

// A person's Hindi name when the UI is in Hindi and one has been entered,
// otherwise their normal name. Names are data, so they live on the user row
// (users.name_hi) rather than in the translation dictionary.
export const personName = (user, lang) =>
  (lang === 'hi' && user?.name_hi ? user.name_hi : (user?.name || ''))

// Measurement units in words for the Hindi UI. Codes stay English in the DB.
const UNIT_HI = { L: 'लीटर', ml: 'ml', kg: 'किलो', g: 'ग्राम', pcs: 'नग', cans: 'कैन' }
export const unitName = (unit, lang) =>
  (lang === 'hi' && UNIT_HI[unit] ? UNIT_HI[unit] : (unit || ''))

// Roles
export const ROLES = {
  SUPER_ADMIN: 'sa',
  ADMIN: 'a',
  EMPLOYEE: 'e',
}

export const isAdminRole = (role) => role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN
export const isSuperAdmin = (role) => role === ROLES.SUPER_ADMIN
export const isEmployee = (role) => role === ROLES.EMPLOYEE

// --- Access scope -----------------------------------------------------------
// Only the Super Admin and these named admins may see EVERY property.
// Any other admin is locked to their own `property`.
export const ALL_PROPERTY_ADMINS = ['vicky', 'sandeep']

// Admins locked to a single department regardless of property scope.
// Sandeep (Security Head) oversees every property but only Security data.
export const DEPARTMENT_LOCKED_ADMINS = { sandeep: 's' }

const uname = (user) => (user?.username || '').trim().toLowerCase()

// True when the user should see data across ALL properties.
export const canSeeAllProperties = (user) =>
  isSuperAdmin(user?.role) ||
  (isAdminRole(user?.role) && ALL_PROPERTY_ADMINS.includes(uname(user)))

// The single property this user is locked to, or null when they see all.
export const scopedProperty = (user) =>
  canSeeAllProperties(user) ? null : (user?.property || null)

// Every venue this person may see right now: their own posting plus any venue
// they are covering today (staff_deployments, loaded into the session as
// `cover`). Returns null for the all-venue roles, meaning "no filter".
//
// Cover is what makes a temporary posting real: without it a person lent to
// another venue could be handed work there but could not see the venue's repair
// board, so they had no idea what else was going on around them.
export const scopedProperties = (user) => {
  const own = scopedProperty(user)
  if (!own) return null
  const cover = Array.isArray(user?.cover) ? user.cover.filter(Boolean) : []
  return [...new Set([own, ...cover])]
}

// The single department this user is locked to (e.g. Sandeep → security), or null.
export const scopedDepartment = (user) =>
  isSuperAdmin(user?.role) ? null : (DEPARTMENT_LOCKED_ADMINS[uname(user)] || null)

// --- Assignment -------------------------------------------------------------
// Work (tasks + repair requests) can be handed to staff AND to fellow admins —
// department heads and admins do fieldwork too. Super admins are included so
// work can be handed "up", and so an admin can assign something to themselves.
export const ASSIGNABLE_ROLES = [ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.SUPER_ADMIN]

// Whose output Analytics reports on. Admins are in: they are given tasks and
// they close repairs, so leaving them out under-reported the venue. The super
// admin is not: they are the person reading the page and the one everyone else
// reports to, so their own row is noise on their own report. They can still be
// assigned work — this governs measurement, not assignment.
export const MEASURED_ROLES = [ROLES.EMPLOYEE, ROLES.ADMIN]

// An "all properties" user (property='all', e.g. Vicky / Sandeep / the super
// admin) belongs to every venue, so they stay assignable whichever property is
// selected. `property` = the venue being assigned within ('all' = no filter).
export const memberInProperty = (member, property) =>
  !property || property === 'all' || member?.property === property || member?.property === 'all'

// Short role tag shown beside a name when assigning ('' for regular staff).
export const roleTag = (role, lang) => {
  if (role === ROLES.SUPER_ADMIN) return lang === 'hi' ? 'सुपर एडमिन' : 'Super Admin'
  if (role === ROLES.ADMIN) return lang === 'hi' ? 'एडमिन' : 'Admin'
  return ''
}

// "Name · Housekeeping · Admin" — the department is dropped when the list is
// already filtered to one, and falls back to the designation ("Site Head") for
// admins with no department. `showRole` is off once the list is one role only.
// Deduped so someone on the legacy "Admin" department isn't "… · Admin · Admin".
export const assigneeLabel = (member, { showDept = true, showRole = true, lang } = {}) => {
  const where = member?.department ? deptName(member.department, lang) : member?.designation
  const parts = [
    personName(member, lang),
    showDept ? where : null,
    showRole ? roleTag(member?.role, lang) : null,
  ].filter(Boolean)
  return [...new Set(parts)].join(' · ')
}

// Admin powers never apply to your OWN assigned work. An admin who was given a
// task / repair request acts purely as its assignee there: they do the work,
// but approving, rating, reassigning and deleting it is somebody else's call —
// any other admin, or the super admin (who is never restricted). Their admin
// rights over everyone else's work are untouched.
export const isOwnAssignedWork = (user, assignedTo) =>
  !!assignedTo && assignedTo === user?.id && !isSuperAdmin(user?.role)

// Task categories & statuses (My Tasks workflow)
// 'alternate' = every other day. Unlike the others it has no fixed weekday or
// date to key off, so the nightly reset works from the task's own last date:
// it comes back two days after it was last set, giving a day-on/day-off rhythm.
// Job titles offered on the user form. Free text is still allowed — this is a
// suggestion list, not a restriction — but picking from it keeps the spelling
// consistent, which matters because "Department Head" is read as a marker by
// Analytics and the sidebar, and "overall head" != "Overall Head" to a computer.
export const DESIGNATIONS = [
  'Overall Head',
  'Site Head',
  'Department Head',
  'Supervisor',
  'Security Head',
]

export const TASK_CATEGORIES = ['daily', 'alternate', 'weekly', 'monthly']
export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETION_REQUESTED: 'completion_requested',
  COMPLETED: 'completed',
  ISSUE: 'issue',                 // staff reported a problem
  ISSUE_WORKING: 'issue_working', // admin is working on the reported issue
  ISSUE_RESOLVED: 'issue_resolved', // admin resolved the reported issue
}

export const PRIORITIES = ['low', 'medium', 'high']

// A priority label only earns its space when it changes what someone does.
// 'normal' is the default on every request, so badging it says nothing and
// buries the ones that matter. Only high and urgent are labelled.
export const isFlaggedPriority = (p) => p === 'high' || p === 'urgent'

// A daily task carries no due date — it is simply "for today" — so its lateness
// cannot come from due_date. It is late once the working day is nearly over and
// the work still isn't done; the 06:00 reset clears the flag next morning.
// Move the cutoff by changing this hour (device clock, i.e. IST for our staff).
export const DAILY_OVERDUE_HOUR = 18

// has today's cutoff passed?
export const dailyOverdueActive = (now = new Date()) => now.getHours() >= DAILY_OVERDUE_HOUR

// "6 PM" — for the caption, derived from the hour above so the two can't drift
export function dailyOverdueLabel() {
  const h12 = DAILY_OVERDUE_HOUR % 12 || 12
  return `${h12} ${DAILY_OVERDUE_HOUR >= 12 ? 'PM' : 'AM'}`
}

// ---------------------------------------------------------------------------
// How often a task comes back, as the duty roster words it.
//
// The roster's seven bands are three DB columns underneath: `category`, plus
// `skip_sunday` for "(Mon-Sat)" and `week_day = 7` for "Sunday only". These
// helpers are the single place that mapping lives, so the roster, a staff
// member's task list and the dashboard can never label the same task
// differently.
//
// Sunday is client-visit day at every venue: no mowing, no trimming, no
// sprinklers, no machines. "(Mon-Sat)" work stands down; "Sunday only" is the
// light work done instead.
// ---------------------------------------------------------------------------
export const TASK_FREQUENCIES = [
  { key: 'daily',       en: 'Daily',                hi: 'रोज़',                     tint: '#DBEAFE', ink: '#1D4ED8' },
  { key: 'dailyMS',     en: 'Daily (Mon-Sat)',      hi: 'रोज़ (सोम-शनि)',           tint: '#DBEAFE', ink: '#1D4ED8' },
  { key: 'sunday',      en: 'Sunday only',          hi: 'सिर्फ़ रविवार',             tint: '#FEE2E2', ink: '#B91C1C' },
  { key: 'alternate',   en: 'Alternate days',       hi: 'एक दिन छोड़',              tint: '#FEF3C7', ink: '#854D0E' },
  { key: 'alternateMS', en: 'Alternate (Mon-Sat)',  hi: 'एक दिन छोड़ (सोम-शनि)',    tint: '#FEF3C7', ink: '#854D0E' },
  { key: 'weekly',      en: 'Weekly',               hi: 'साप्ताहिक',                tint: '#D1FAE5', ink: '#166534' },
  { key: 'monthly',     en: 'Monthly',              hi: 'मासिक',                    tint: '#FCE7F3', ink: '#BE185D' },
]
export const FREQUENCY_MAP = TASK_FREQUENCIES.reduce((m, f) => ({ ...m, [f.key]: f }), {})

// Accepts a DB row (skip_sunday / week_day) or the roster's in-memory group
// (skipSunday / weekDay) — the same task, spelled two ways by two layers.
export function taskFrequency(task) {
  if (!task) return 'daily'
  const skip = task.skip_sunday ?? task.skipSunday
  const day = Number(task.week_day ?? task.weekDay ?? 0)
  if (task.category === 'weekly') return day === 7 ? 'sunday' : 'weekly'
  if (task.category === 'daily') return skip ? 'dailyMS' : 'daily'
  if (task.category === 'alternate') return skip ? 'alternateMS' : 'alternate'
  return task.category || 'daily'
}

export const frequencyLabel = (key, lang) =>
  (lang === 'hi' ? FREQUENCY_MAP[key]?.hi : FREQUENCY_MAP[key]?.en) || key

// The duty roster's staffing rule — "All", "Any 2", "Day Guard 1", "Site Head" —
// in the reader's language. It is stored as the English text the sheet uses, so
// this is a lookup rather than a column: the vocabulary is small and fixed, and
// an admin who types something of their own keeps exactly what they typed.
const STAFFING_HI = {
  'all': 'सभी',
  'any 1': 'कोई 1',
  'any 2': 'कोई 2',
  'any 3': 'कोई 3',
  'rotational': 'बारी-बारी',
  'site head': 'साइट हेड',
  'site head + all': 'साइट हेड + सभी',
  'supervisor': 'सुपरवाइज़र',
  'day guard 1': 'दिन गार्ड 1',
  'day guard 2': 'दिन गार्ड 2',
  'day guards': 'दिन के गार्ड',
  'night guards': 'रात के गार्ड',
  'sandeep/head': 'संदीप / हेड',
  'sandeep + all': 'संदीप + सभी',
  'sandeep + guard': 'संदीप + गार्ड',
}
export function staffingLabel(text, lang) {
  const raw = String(text || '').trim()
  if (!raw || lang !== 'hi') return raw
  const key = raw.toLowerCase()
  if (STAFFING_HI[key]) return STAFFING_HI[key]
  // "3 persons" / "1 person" — a count, so handle any number rather than listing
  // every one the sheet happens to use today
  const n = key.match(/^(\d+)\s+persons?$/)
  if (n) return `${n[1]} व्यक्ति`
  return raw
}

// ISO weekdays, 1 = Monday.
export const WEEK_DAYS = [
  { v: 1, en: 'Monday',    short: 'Mon', hi: 'सोमवार',  hiShort: 'सोम' },
  { v: 2, en: 'Tuesday',   short: 'Tue', hi: 'मंगलवार', hiShort: 'मंगल' },
  { v: 3, en: 'Wednesday', short: 'Wed', hi: 'बुधवार',  hiShort: 'बुध' },
  { v: 4, en: 'Thursday',  short: 'Thu', hi: 'गुरुवार', hiShort: 'गुरु' },
  { v: 5, en: 'Friday',    short: 'Fri', hi: 'शुक्रवार', hiShort: 'शुक्र' },
  { v: 6, en: 'Saturday',  short: 'Sat', hi: 'शनिवार',  hiShort: 'शनि' },
  { v: 7, en: 'Sunday',    short: 'Sun', hi: 'रविवार',  hiShort: 'रवि' },
]
export const dayName = (v, lang) => {
  const d = WEEK_DAYS.find((x) => x.v === Number(v))
  return d ? (lang === 'hi' ? d.hi : d.en) : ''
}
export const dayShort = (v, lang) => {
  const d = WEEK_DAYS.find((x) => x.v === Number(v))
  return d ? (lang === 'hi' ? d.hiShort : d.short) : ''
}

// Alternate-day work is anchored to MONDAY, not to whenever it last happened.
// Counting two days from the last run drifts — miss a reset and the whole rhythm
// shifts — and nobody can answer "is it on today?" without checking history.
// Anchored, it is always Mon / Wed / Fri, plus Sunday when Sunday is a working
// day for that job.
// The default when nobody has chosen: Monday-anchored, and Sunday only where
// Sunday is a working day for that job.
export const alternateDays = (skipSunday) => (skipSunday ? [1, 3, 5] : [1, 3, 5, 7])

// The days a task actually repeats on. An explicit choice wins over the default
// AND over skip_sunday — picking Sunday is a decision, and a flag set months ago
// should not quietly overrule it.
export function taskDays(task) {
  const chosen = task?.week_days ?? task?.weekDays
  if (Array.isArray(chosen) && chosen.length) return [...chosen].map(Number).sort((a, b) => a - b)
  return alternateDays(task?.skip_sunday ?? task?.skipSunday)
}

// Which date of the month a monthly task falls on: week 1 = the 1st, week 2 the
// 8th, week 3 the 15th, week 4 the 22nd.
export const monthlyDate = (monthWeek) => 1 + (Math.min(Math.max(Number(monthWeek) || 1, 1), 4) - 1) * 7
const ORDINAL = { 1: '1st', 8: '8th', 15: '15th', 22: '22nd' }

// When the job actually comes round, in words, for the roster's Time column and
// the staff member's task card. Empty for plain daily work — "Daily" already
// said it, and repeating it adds noise to 121 rows.
export function scheduleText(task, lang) {
  const hi = lang === 'hi'
  const fk = taskFrequency(task)
  const day = task?.week_day ?? task?.weekDay
  const week = task?.month_week ?? task?.monthWeek
  if (fk === 'sunday') return hi ? 'हर रविवार' : 'Every Sunday'
  if (fk === 'weekly') return hi ? `हर ${dayName(day || 1, hi ? 'hi' : 'en')}` : `Every ${dayName(day || 1, 'en')}`
  if (fk === 'alternate' || fk === 'alternateMS') {
    return taskDays(task).map((d) => dayShort(d, lang)).join(' · ')
  }
  if (fk === 'monthly') {
    const d = monthlyDate(week)
    return hi ? `महीने की ${d}` : `${ORDINAL[d] || d} of month`
  }
  return ''
}

// Not this person's problem today: a Mon-Sat job on a Sunday, or Sunday-only
// work on any other day. The row is still shown — hiding work is how it gets
// forgotten — but it is never counted as late.
// Is today one of this task's days? The same question the nightly reset asks in
// SQL — kept in step with it deliberately, because a task the database has not
// brought back should not be sitting in somebody's list either.
//
// Monthly is the exception: its "day" is the start of a week-long window, not a
// date to be at work on, so it stays visible through that week.
export function isDueToday(task, now = new Date()) {
  const iso = now.getDay() === 0 ? 7 : now.getDay()
  const fk = taskFrequency(task)
  if (fk === 'sunday') return iso === 7
  if (fk === 'dailyMS') return iso !== 7
  if (fk === 'alternate' || fk === 'alternateMS') return taskDays(task).includes(iso)
  // Weekly work stays on the list from its day until the week is out. A missed
  // Monday deep-weed is not made good by next Monday's — the weeds are still
  // there — so unlike daily and alternate work it does not get superseded, and
  // dropping it the next morning is how it silently never happens.
  if (fk === 'weekly') return iso >= Number(task?.week_day ?? task?.weekDay ?? 1)
  if (fk === 'monthly') {
    // Its week of the month, not a single date and not the whole month. Pinning
    // it to one date would make a month's work impossible to catch up on; leaving
    // it open all month put every monthly job into every day's total, which is
    // how "today's work" read 287 when 130 of those were not due today at all.
    // same reasoning, a month long: from its week until the month is out
    const wk = Math.min(Math.floor((now.getDate() - 1) / 7) + 1, 4)
    return wk >= Math.min(Math.max(Number(task?.month_week ?? task?.monthWeek) || 1, 1), 4)
  }
  return true                            // daily
}

// How many times this job was SUPPOSED to happen between two dates.
//
// Deliberately not the same question as isDueToday(). A weekly job stays VISIBLE
// from its day to the end of the week, but it was only ever expected ONCE — count
// visible days and a Monday job would look like seven missed jobs by Sunday.
//
// This is what makes "what did not get done" answerable at all: completions are
// the only thing recorded, so the gap has to be computed against what was owed.
export function expectedOccurrences(task, from, to) {
  const fk = taskFrequency(task)
  const days = fk === 'alternate' || fk === 'alternateMS' ? taskDays(task) : null
  const weekDay = Number(task?.week_day ?? task?.weekDay ?? 1)
  const monthDay = monthlyDate(task?.month_week ?? task?.monthWeek)

  let n = 0
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  while (d <= end) {
    const iso = d.getDay() === 0 ? 7 : d.getDay()
    if (fk === 'daily') n += 1
    else if (fk === 'dailyMS') n += iso === 7 ? 0 : 1
    else if (fk === 'sunday') n += iso === 7 ? 1 : 0
    else if (days) n += days.includes(iso) ? 1 : 0
    else if (fk === 'weekly') n += iso === weekDay ? 1 : 0
    else if (fk === 'monthly') n += d.getDate() === monthDay ? 1 : 0
    d.setDate(d.getDate() + 1)
  }
  return n
}

// Not this person's problem today. The row is hidden from staff — the roster
// still lists every job, because that is the plan, not the day.
export function notDueToday(task, now = new Date()) {
  if (!task) return false
  return !isDueToday(task, now)
}

// A task is overdue when it has a due date in the past and isn't completed yet.
// Dated tasks without a due_date are never overdue; DAILY tasks are the
// exception and go by the cutoff hour instead. `today` is an ISO date.
export function isTaskOverdue(task, today, now = new Date()) {
  if (!task || task.status === TASK_STATUS.COMPLETED) return false
  // a job that isn't due today cannot be late today
  if (notDueToday(task, now)) return false
  const fk = taskFrequency(task)
  const iso = now.getDay() === 0 ? 7 : now.getDay()

  // Weekly and monthly work is late once its own day / week has PASSED and it is
  // still open. On the day itself it is simply today's job, not a failure.
  if (fk === 'weekly') return iso > Number(task.week_day ?? task.weekDay ?? 1)
  if (fk === 'monthly') {
    const wk = Math.min(Math.floor((now.getDate() - 1) / 7) + 1, 4)
    return wk > Math.min(Math.max(Number(task.month_week ?? task.monthWeek) || 1, 1), 4)
  }

  if (task.category === 'daily') {
    // already sent for approval = the staff member did their part on time
    return task.status !== TASK_STATUS.COMPLETION_REQUESTED
      && !!dailyOverdueActive(now)
      // a daily task given an explicit past due date is handled by the rule below
      && !(task.due_date && task.due_date < today)
  }
  return !!task.due_date && task.due_date < today
}
