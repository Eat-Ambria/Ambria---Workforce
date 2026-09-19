import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useColors } from './context/ThemeContext'
import { isAdminRole, isSuperAdmin } from './constants/org'
import { Loader } from './components/common/UI'
import AppLayout from './components/layout/AppLayout'

// Login stays eager — it's the first paint for signed-out users, so no flash.
import Login from './pages/Login'

// Everything else is code-split: each page downloads only when its route is
// visited, keeping the initial bundle small.
//
// The import functions are named rather than written inline so the same ones can
// be WARMED after the app settles — see the effect below. Split alone, every tab
// paid for its own chunk the first time it was opened, and on an old phone that
// is a visible spinner between the tap and the page.
const page = {
  publicFixRequest: () => import('./pages/PublicFixRequest'),
  dashboard: () => import('./pages/Dashboard'),
  myTasks: () => import('./pages/employee/MyTasks'),
  adminTasks: () => import('./pages/admin/AdminTasks'),
  taskBoard: () => import('./pages/shared/TaskBoard'),
  training: () => import('./pages/shared/Training'),
  valet: () => import('./pages/admin/Valet'),
  vendors: () => import('./pages/admin/Vendors'),
  users: () => import('./pages/admin/Users'),
  analytics: () => import('./pages/admin/Analytics'),
  account: () => import('./pages/Account'),
}

const PublicFixRequest = lazy(page.publicFixRequest)
const Dashboard = lazy(page.dashboard)
const MyTasks = lazy(page.myTasks)
const AdminTasks = lazy(page.adminTasks)
const TaskBoard = lazy(page.taskBoard)
const Training = lazy(page.training)
const Valet = lazy(page.valet)
const Vendors = lazy(page.vendors)
const Users = lazy(page.users)
const Analytics = lazy(page.analytics)
const Account = lazy(page.account)

// The pages a signed-in person can reach from the sidebar, in the order they are
// most likely to want them. The public repair page is left out: whoever is
// signed in is not about to open it, and it is the one route reached by a link
// from outside rather than by a tap in here.
const WARM = [
  page.dashboard, page.adminTasks, page.myTasks, page.taskBoard,
  page.account, page.valet, page.vendors, page.training,
  page.users, page.analytics,
]

/**
 * Fetch the route chunks in the background, one at a time, once the app has
 * gone quiet.
 *
 * The chunk is in the service worker's cache already — it is precached — so this
 * is rarely a download. What it buys is the PARSE: a phone that takes a moment
 * to compile 110 KB of Training does it while nobody is waiting, instead of
 * between a tap and the screen.
 *
 * One at a time and only when idle, so it never competes with the page somebody
 * is actually on. A failure is ignored: this is a head start, not a dependency —
 * the route still imports normally when it is opened.
 */
function warmRoutes() {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300))
  let i = 0
  const next = () => {
    if (i >= WARM.length) return
    const load = WARM[i++]
    load().catch(() => {}).finally(() => idle(next))
  }
  idle(next)
}

// redirect to /login when not authenticated
function RequireAuth({ children }) {
  const { isAuthed, loading } = useAuth()
  const C = useColors()
  if (loading) return <div style={{ background: C.bg, minHeight: '100vh' }}><Loader /></div>
  if (!isAuthed) return <Navigate to="/login" replace />
  return children
}

// block a route if the role is not allowed -> send it home
//
// Every role can use the Dashboard, so it is home for all of them. Keep that
// true of anything added here: a role bounced to a page it is also blocked on
// would bounce again, which is a redirect loop rather than a denial.
function RoleRoute({ allow, children }) {
  const { user } = useAuth()
  if (!allow(user?.role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const { isAuthed } = useAuth()
  const C = useColors()

  // Only once somebody is in. A signed-out visitor is looking at the login form
  // or the public repair page, and pulling ten admin screens behind that would
  // be spending their data on pages they cannot open.
  useEffect(() => {
    if (isAuthed) warmRoutes()
  }, [isAuthed])

  return (
    <Suspense fallback={<div style={{ background: C.bg, minHeight: '100vh' }}><Loader /></div>}>
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* PUBLIC — no login. Shareable link for outside users to raise a fix
          request. Lands in the Task Board as an 'open' request for admins. */}
      {/* both spellings: the app is served from /fix-request/ now, but links
          without the slash have already been shared */}
      <Route path="/fix-request" element={<PublicFixRequest />} />
      <Route path="/fix-request/" element={<PublicFixRequest />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        {/* self-service profile — any signed-in user */}
        <Route path="/account" element={<Account />} />

        {/* employee task view */}
        <Route path="/my-tasks" element={<MyTasks />} />

        {/* admin task management + approval queue */}
        <Route path="/tasks" element={<RoleRoute allow={isAdminRole}><AdminTasks /></RoleRoute>} />

        {/* shared */}
        <Route path="/task-board" element={<TaskBoard />} />
        <Route path="/training" element={<Training />} />

        {/* admin only */}
        <Route path="/valet" element={<RoleRoute allow={isAdminRole}><Valet /></RoleRoute>} />
        <Route path="/vendors" element={<RoleRoute allow={isAdminRole}><Vendors /></RoleRoute>} />

        {/* super admin only — user management + org-wide performance analytics */}
        <Route path="/users" element={<RoleRoute allow={isSuperAdmin}><Users /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute allow={isSuperAdmin}><Analytics /></RoleRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthed ? '/dashboard' : '/login'} replace />} />
    </Routes>
    </Suspense>
  )
}
