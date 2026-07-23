// Organization reference data: properties, departments, roles.

export const PROPERTIES = [
  { code: 'pp', name: 'Pushpanjali', area: 'Dwarka', acreage: '3 Acres' },
  { code: 'ex', name: 'Exotica', area: 'Dwarka', acreage: '4 Acres' },
  { code: 'mk', name: 'Manaktala', area: 'Kapashera', acreage: '3 Acres' },
  { code: 'rs', name: 'Restro', area: 'Palam Vihar', acreage: '0.75 Acre' },
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

// A task is overdue when it has a due date in the past and isn't completed yet.
// Tasks without a due_date are never overdue. `today` is an ISO date (YYYY-MM-DD).
export function isTaskOverdue(task, today) {
  return !!task?.due_date && task.due_date < today && task.status !== TASK_STATUS.COMPLETED
}
