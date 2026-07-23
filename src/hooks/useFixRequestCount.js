import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isAdminRole, scopedProperty, scopedDepartment } from '../constants/org'

// Live count for the nav badge next to "Fix Request", role-dependent:
//   - admin / super admin: requests AWAITING THEIR APPROVAL
//     (status 'approval_requested'), within their property/department scope
//   - staff: fix requests ASSIGNED TO THEM (status 'assigned')
// Refreshes on mount, every 60s, and whenever the window regains focus.
export function useFixRequestCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!user) { setCount(0); return }
    try {
      let q = supabase.from('work_board').select('id', { count: 'exact', head: true })
      if (isAdminRole(user.role)) {
        q = q.eq('status', 'approval_requested')
        const propScope = scopedProperty(user)   // null = every property
        const deptScope = scopedDepartment(user) // null = every department
        if (propScope) q = q.eq('property', propScope)
        if (deptScope) q = q.eq('department', deptScope)
      } else {
        q = q.eq('assigned_to', user.id).eq('status', 'assigned')
      }
      const { count: n } = await q
      setCount(n || 0)
    } catch {
      /* ignore — a failed count just leaves the badge as-is */
    }
  }, [user])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [load])

  return count
}
