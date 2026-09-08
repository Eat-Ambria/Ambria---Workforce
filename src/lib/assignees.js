import { supabase } from './supabase'
import { WORK_ASSIGNEE_ROLES } from '../constants/org'

// Everyone an admin may hand work to: active staff *and* fellow admins.
// Filtered to the roles this app defines, so a row left on a retired role is
// not offered work nobody will ever see. See WORK_ASSIGNEE_ROLES.
// Scope mirrors the admin's own — `propScope` / `deptScope` come from
// scopedProperty() / scopedDepartment(); null means "no limit".
// Users on property='all' belong to every venue, so they always qualify.
export function assigneesQuery({ propScope, deptScope } = {}) {
  let q = supabase
    .from('users')
    // designation ("Site Head", "Supervisor", …) stands in for the department
    // on admins who aren't attached to one. `shift` comes along because the
    // roster picks people for a day or a night row and has to know which they
    // work — an explicit column list is exactly as good as its last entry.
    .select('id, name, name_hi, role, department, property, designation, shift')
    .eq('is_active', true)
    .in('role', WORK_ASSIGNEE_ROLES)
    .order('name')
  if (propScope) q = q.or(`property.eq.${propScope},property.eq.all`)
  if (deptScope) q = q.eq('department', deptScope)
  return q
}
