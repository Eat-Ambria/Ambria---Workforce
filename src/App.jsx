import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useColors } from './context/ThemeContext'
import { canSeeValet, homeFor, isAdminRole, isSuperAdmin, isValetRole } from './constants/org'
import { Loader } from './components/common/UI'
import AppLayout from './components/layout/AppLayout'

// Login stays eager — it's the first paint for signed-out users, so no flash.
import Login from './pages/Login'

// Everything else is code-split: each page downloads only when its route is
// visited, keeping the initial bundle small.
const PublicFixRequest = lazy(() => import('./pages/PublicFixRequest'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MyTasks = lazy(() => import('./pages/employee/MyTasks'))
const AdminTasks = lazy(() => import('./pages/admin/AdminTasks'))
const TaskBoard = lazy(() => import('./pages/shared/TaskBoard'))
const Training = lazy(() => import('./pages/shared/Training'))
const Valet = lazy(() => import('./pages/admin/Valet'))
const Vendors = lazy(() => import('./pages/admin/Vendors'))
const Users = lazy(() => import('./pages/admin/Users'))
const Analytics = lazy(() => import('./pages/admin/Analytics'))
const Account = lazy(() => import('./pages/Account'))

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
// Home is per role, not always /dashboard: a valet user bounced to /dashboard
// would land on a page built for other roles, and — since they are blocked there
// too — bounce again.
function RoleRoute({ allow, children }) {
  const { user } = useAuth()
  if (!allow(user?.role)) return <Navigate to={homeFor(user?.role)} replace />
  return children
}

// Everything that is NOT the valet team's. These three routes carried no gate at
// all, which was fine while every role could use them — hiding an item from the
// sidebar is not access control, and a valet user could reach /my-tasks by
// typing it.
const notValet = (role) => !isValetRole(role)

export default function App() {
  const { isAuthed, user } = useAuth()
  const C = useColors()

  return (
    <Suspense fallback={<div style={{ background: C.bg, minHeight: '100vh' }}><Loader /></div>}>
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to={homeFor(user?.role)} replace /> : <Login />} />

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
        <Route path="/dashboard" element={<RoleRoute allow={notValet}><Dashboard /></RoleRoute>} />

        {/* self-service profile — any signed-in user */}
        <Route path="/account" element={<Account />} />

        {/* employee task view */}
        <Route path="/my-tasks" element={<RoleRoute allow={notValet}><MyTasks /></RoleRoute>} />

        {/* admin task management + approval queue */}
        <Route path="/tasks" element={<RoleRoute allow={isAdminRole}><AdminTasks /></RoleRoute>} />

        {/* shared */}
        <Route path="/task-board" element={<RoleRoute allow={notValet}><TaskBoard /></RoleRoute>} />
        <Route path="/training" element={<RoleRoute allow={notValet}><Training /></RoleRoute>} />

        {/* admin only */}
        <Route path="/valet" element={<RoleRoute allow={canSeeValet}><Valet /></RoleRoute>} />
        <Route path="/vendors" element={<RoleRoute allow={isAdminRole}><Vendors /></RoleRoute>} />

        {/* super admin only — user management + org-wide performance analytics */}
        <Route path="/users" element={<RoleRoute allow={isSuperAdmin}><Users /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute allow={isSuperAdmin}><Analytics /></RoleRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthed ? homeFor(user?.role) : '/login'} replace />} />
    </Routes>
    </Suspense>
  )
}
