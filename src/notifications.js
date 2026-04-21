import { supabase } from "./supabase.js";

let _adminCache = null;
let _cacheTs = 0;

async function _loadAdmins() {
  const now = Date.now();
  if (_adminCache && now - _cacheTs < 10 * 60 * 1000) return _adminCache;
  const { data } = await supabase.from("users").select("id,role,property").in("role", ["sa", "a"]);
  _adminCache = data || [];
  _cacheTs = now;
  return _adminCache;
}

export async function getSAIds() {
  const admins = await _loadAdmins();
  return admins.filter(u => u.role === "sa").map(u => u.id);
}

export async function getPropertyAdminIds(property) {
  const admins = await _loadAdmins();
  return admins
    .filter(u => u.role === "a" && (u.property === property || u.property === "all"))
    .map(u => u.id);
}

export async function getSAAndAdminIds(property) {
  const admins = await _loadAdmins();
  const ids = admins
    .filter(u => u.role === "sa" || u.property === property || u.property === "all")
    .map(u => u.id);
  return [...new Set(ids)];
}

export async function notifyMultiple(type, text, byUser, byName, forUsers, property) {
  const targets = [...new Set((forUsers || []).filter(Boolean))];
  if (targets.length === 0) return;
  const inserts = targets.map(uid => ({
    type,
    task_text: (text || "").substring(0, 150),
    by_user: byUser,
    by_name: byName,
    for_user: uid,
    property: property || null,
    is_read: false,
  }));
  await supabase.from("notifications").insert(inserts);
}
