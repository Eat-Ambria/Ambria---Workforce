// Organization reference data: properties, departments, roles.

export const PROPERTIES = [
  { code: 'pp', name: 'Pushpanjali', nameHi: 'पुष्पांजलि', area: 'Dwarka', areaHi: 'द्वारका', acreage: '3 Acres' },
  { code: 'ex', name: 'Exotica', nameHi: 'एक्सोटिका', area: 'Dwarka', areaHi: 'द्वारका', acreage: '4 Acres' },
  { code: 'mk', name: 'Manaktala', nameHi: 'मनकतला', area: 'Kapashera', areaHi: 'कापसहेड़ा', acreage: '3 Acres' },
  { code: 'rs', name: 'Restro', nameHi: 'रेस्ट्रो', area: 'Palam Vihar', areaHi: 'पालम विहार', acreage: '0.75 Acre' },
]

// property lookup incl. "all" (Vicky, Sandeep, Super Admin)
export const PROPERTY_MAP = PROPERTIES.reduce((m, p) => ({ ...m, [p.code]: p }), {
  all: { code: 'all', name: 'All Properties', nameHi: 'सभी प्रॉपर्टी', area: '', acreage: '' },
})

// Pickable departments (teams). "Admin" is a ROLE, not a department, so it's
// intentionally not selectable here — filter/assign by role instead.
export const DEPARTMENTS = [
  { code: 'h', name: 'Horticulture', nameHi: 'बागवानी', color: '#16A34A' },
  { code: 'k', name: 'Housekeeping', nameHi: 'हाउसकीपिंग', color: '#2563EB' },
  { code: 's', name: 'Security', nameHi: 'सुरक्षा', color: '#6B21A8' },
  { code: 'sales', name: 'Sales', nameHi: 'बिक्री', color: '#D97706' },
  { code: 'tech', name: 'Technology', nameHi: 'तकनीक', color: '#0891B2' },
  { code: 'ops', name: 'Operations', nameHi: 'संचालन', color: '#4F46E5' },
  { code: 'hr', name: 'HR', nameHi: 'एचआर', color: '#D4537E' },
  { code: 'finance', name: 'Finance', nameHi: 'वित्त', color: '#059669' },
  { code: 'marketing', name: 'Marketing', nameHi: 'मार्केटिंग', color: '#DC2626' },
]

// Lookup incl. the legacy "Admin" department so any existing department='a'
// records still render a readable name (mirrors how PROPERTY_MAP keeps 'all').
export const DEPARTMENT_MAP = DEPARTMENTS.reduce((m, d) => ({ ...m, [d.code]: d }), {
  a: { code: 'a', name: 'Admin', nameHi: 'एडमिन', color: '#7B1E2F' },
})

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

// The single department this user is locked to (e.g. Sandeep → security), or null.
export const scopedDepartment = (user) =>
  isSuperAdmin(user?.role) ? null : (DEPARTMENT_LOCKED_ADMINS[uname(user)] || null)

// --- Assignment -------------------------------------------------------------
// Work (tasks + repair requests) can be handed to staff AND to fellow admins —
// department heads and admins do fieldwork too. Super admins are included so
// work can be handed "up", and so an admin can assign something to themselves.
export const ASSIGNABLE_ROLES = [ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.SUPER_ADMIN]

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
export const TASK_CATEGORIES = ['daily', 'weekly', 'monthly']
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

// A task is overdue when it has a due date in the past and isn't completed yet.
// Dated tasks without a due_date are never overdue; DAILY tasks are the
// exception and go by the cutoff hour instead. `today` is an ISO date.
export function isTaskOverdue(task, today, now = new Date()) {
  if (!task || task.status === TASK_STATUS.COMPLETED) return false
  if (task.category === 'daily') {
    // already sent for approval = the staff member did their part on time
    return task.status !== TASK_STATUS.COMPLETION_REQUESTED
      && !!dailyOverdueActive(now)
      // a daily task given an explicit past due date is handled by the rule below
      && !(task.due_date && task.due_date < today)
  }
  return !!task.due_date && task.due_date < today
}
