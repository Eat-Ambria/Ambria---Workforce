import { supabase } from './supabase'
import { ROLES, isSuperAdmin, ALL_PROPERTY_ADMINS, DEPARTMENT_LOCKED_ADMINS } from '../constants/org'

// Insert a notification row. A Database Webhook on the `notifications` table
// turns each row into a bell entry + a Web Push to the recipient's devices.

// Notify a single user (used for admin -> employee events like approved / sent back).
export async function notifyUser(type, { taskText, forUser, property = null, entityId = null, byName = null, byUser = null }) {
  if (!forUser) return
  await supabase.from('notifications').insert({
    type,
    task_text: taskText || null,
    for_user: forUser,
    property,
    entity_id: entityId != null ? String(entityId) : null,
    by_name: byName,
    by_user: byUser,
  })
}

// Notify every admin who can see the given property/department — one row each
// (used for employee -> admin events like submitted / issue reported).
export async function notifyAdmins(type, { taskText, property, department = null, entityId = null, byName = null, byUser = null }) {
  const { data: admins } = await supabase
    .from('users')
    .select('id, role, property')
    .in('role', [ROLES.ADMIN, ROLES.SUPER_ADMIN])
    .eq('is_active', true)
  if (!admins?.length) return

  const recipients = admins.filter((a) => {
    // super admins + the named all-property admins see every property
    const seesAll = isSuperAdmin(a.role) || ALL_PROPERTY_ADMINS.includes(a.id)
    if (!seesAll && a.property !== property) return false
    // department-locked admins (e.g. Sandeep -> security) only get their dept
    const deptLock = DEPARTMENT_LOCKED_ADMINS[a.id]
    if (deptLock && department && deptLock !== department) return false
    return true
  })
  if (!recipients.length) return

  const rows = recipients.map((a) => ({
    type,
    task_text: taskText || null,
    for_user: a.id,
    property: property || null,
    entity_id: entityId != null ? String(entityId) : null,
    by_name: byName,
    by_user: byUser,
  }))
  await supabase.from('notifications').insert(rows)
}
