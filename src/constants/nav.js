// Role-based navigation. Each item: path, translation key, icon,
// and which roles can see it.
// 'e' = employee, 'a' = admin, 'sa' = super admin, 'v' = valet team.

export const NAV_ITEMS = [
  { path: '/dashboard', key: 'dashboard', icon: 'dashboard', roles: ['sa', 'a', 'e'] },
  // admins get this too — work can be assigned to them, and this is where an
  // assignee does it (/tasks stays the org-wide management view). Not the super
  // admin, who oversees rather than carries out work.
  // Employees only. An admin's own work is a tab inside /tasks instead, so the
  // same list is not reachable from two places in their sidebar.
  { path: '/my-tasks', key: 'myTasks', icon: 'myTasks', roles: ['e'] },
  { path: '/tasks', key: 'tasks', icon: 'tasks', roles: ['sa', 'a'] },
  { path: '/task-board', key: 'taskBoard', icon: 'taskBoard', roles: ['sa', 'a', 'e'] },
  { path: '/training', key: 'training', icon: 'training', roles: ['sa', 'a', 'e'] },
  // The valet team's only item. They are not on any other line in this list,
  // which is the whole definition of the role.
  { path: '/valet', key: 'valet', icon: 'valet', roles: ['sa', 'a', 'v'] },
  { path: '/vendors', key: 'vendors', icon: 'vendors', roles: ['sa', 'a'] },
  { path: '/analytics', key: 'analytics', icon: 'dashboard', roles: ['sa'] },
  { path: '/users', key: 'userManagement', icon: 'team', roles: ['sa'] },
]

// One item a per-user access list can never remove, so nobody can be locked out
// of the app. For the valet team that item is Valet, not Dashboard — a dashboard
// they cannot use is not a way back in.
export const alwaysVisibleFor = (role) => (role === 'v' ? ['/valet'] : ['/dashboard'])

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
  const pinned = alwaysVisibleFor(user?.role)
  return base.filter((i) => pinned.includes(i.path) || access.includes(i.path))
}

// Items shown in the mobile bottom tab bar. All of the user's nav items are
// included — the bar scrolls horizontally when they don't all fit (e.g. admins
// with Vendors + User Management).
export function bottomTabsForUser(user) {
  return navForUser(user)
}
