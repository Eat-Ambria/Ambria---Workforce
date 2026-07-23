// Collision-proof id generator. Uses the platform crypto UUID when available
// (all modern browsers over HTTPS / localhost), with a safe fallback.
export function newId(prefix = '') {
  let uuid
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID()
  } else {
    // fallback: timestamp + random, still practically unique
    uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  return prefix ? `${prefix}${uuid}` : uuid
}
