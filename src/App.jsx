import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useColors } from './context/ThemeContext'
import { isAdminRole, isSuperAdmin } from './constants/org'
import { Loader } from './components/common/UI'
import AppLayout from './components/layout/AppLayout'

import Login from './pages/Login'
import PublicFixRequest from './pages/PublicFixRequest'
import Dashboard from './pages/Dashboard'
import MyTasks from './pages/employee/MyTasks'
import AdminTasks from './pages/admin/AdminTasks'
import TaskBoard from './pages/shared/TaskBoard'
import Training from './pages/shared/Training'
import Valet from './pages/admin/Valet'
import Vendors from './pages/admin/Vendors'
import Users from './pages/admin/Users'
import Account from './pages/Account'

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

  return (
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
  )
}
