// Role-based navigation. Each item: path, translation key, icon,
// and which roles can see it. 'e' = employee, 'a' = admin, 'sa' = super admin.

export const NAV_ITEMS = [
  { path: '/dashboard', key: 'dashboard', icon: 'dashboard', roles: ['sa', 'a', 'e'] },
  { path: '/my-tasks', key: 'myTasks', icon: 'myTasks', roles: ['e'] },
  { path: '/tasks', key: 'tasks', icon: 'tasks', roles: ['sa', 'a'] },
  { path: '/task-board', key: 'taskBoard', icon: 'taskBoard', roles: ['sa', 'a', 'e'] },
  { path: '/training', key: 'training', icon: 'training', roles: ['sa', 'a', 'e'] },
  { path: '/valet', key: 'valet', icon: 'valet', roles: ['sa', 'a'] },
  { path: '/vendors', key: 'vendors', icon: 'vendors', roles: ['sa', 'a'] },
  { path: '/users', key: 'userManagement', icon: 'team', roles: ['sa'] },
]

// Dashboard is always visible so a user can never be locked out of the app.
export const ALWAYS_VISIBLE = ['/dashboard']

export function navForRole(role) {
  return NAV_ITEMS.filter((i) => i.roles.includes(role))
}

// Nav for a specific user: role items narrowed by the per-user `access` list.
// `access` is an array of allowed paths managed by the super admin in User
// Management. An empty/absent list means "role defaults" (show everything the
// role allows) — this keeps existing users working before any access is set.
export function navForUser(user) {
  const base = navForRole(user?.role)
  const access = Array.isArray(user?.access) ? user.access : []
  if (access.length === 0) return base
  return base.filter((i) => ALWAYS_VISIBLE.includes(i.path) || access.includes(i.path))
}

// Items shown in the mobile bottom tab bar. All of the user's nav items are
// included — the bar scrolls horizontally when they don't all fit (e.g. admins
// with Vendors + User Management).
export function bottomTabsForUser(user) {
  return navForUser(user)
}
