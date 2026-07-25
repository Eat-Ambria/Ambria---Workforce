import { supabase } from './supabase'
import { ASSIGNABLE_ROLES } from '../constants/org'

// Everyone an admin may hand work to: active staff *and* fellow admins.
// Scope mirrors the admin's own — `propScope` / `deptScope` come from
// scopedProperty() / scopedDepartment(); null means "no limit".
// Users on property='all' belong to every venue, so they always qualify.
export function assigneesQuery({ propScope, deptScope } = {}) {
  let q = supabase
    .from('users')
    // designation ("Site Head", "Supervisor", …) stands in for the department
    // on admins who aren't attached to one
    .select('id, name, role, department, property, designation')
    .eq('is_active', true)
    .in('role', ASSIGNABLE_ROLES)
    .order('name')
  if (propScope) q = q.or(`property.eq.${propScope},property.eq.all`)
  if (deptScope) q = q.eq('department', deptScope)
  return q
}
