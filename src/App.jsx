import { lazy, Suspense } from 'react'
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
const PublicFixRequest = lazy(() => import('./pages/PublicFixRequest'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MyTasks = lazy(() => import('./pages/employee/MyTasks'))
const AdminTasks = lazy(() => import('./pages/admin/AdminTasks'))
const TaskBoard = lazy(() => import('./pages/shared/TaskBoard'))
const Training = lazy(() => import('./pages/shared/Training'))
const Valet = lazy(() => import('./pages/admin/Valet'))
const Vendors = lazy(() => import('./pages/admin/Vendors'))
const Users = lazy(() => import('./pages/admin/Users'))
const Account = lazy(() => import('./pages/Account'))

// redirect to /login when not authenticated
function RequireAuth({ children }) {
  const { isAuthed, loading } = useAuth()
  const C = useColors()
  if (loading) return <div style={{ background: C.bg, minHeight: '100vh' }}><Loader /></div>
  if (!isAuthed) return <Navigate to="/login" replace />
  return children
}

// block a route if role not allowed -> send to dashboard
function RoleRoute({ allow, children }) {
  const { user } = useAuth()
  if (!allow(user?.role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const { isAuthed } = useAuth()
  const C = useColors()

  return (
    <Suspense fallback={<div style={{ background: C.bg, minHeight: '100vh' }}><Loader /></div>}>
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* PUBLIC — no login. Shareable link for outside users to raise a fix
          request. Lands in the Task Board as an 'open' request for admins. */}
      <Route path="/fix-request" element={<PublicFixRequest />} />

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

        {/* super admin only — user management */}
        <Route path="/users" element={<RoleRoute allow={isSuperAdmin}><Users /></RoleRoute>} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthed ? '/dashboard' : '/login'} replace />} />
    </Routes>
    </Suspense>
  )
}
