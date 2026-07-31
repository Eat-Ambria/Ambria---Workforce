// Canonicalize a phone number so any format the user types matches what's
// stored. Strips spaces/dashes/+, and reduces common India formats to the
// 10-digit local number:
//   "+91 98765 43210" / "091-98765-43210" / "9876543210" → "9876543210"
// Non-Indian / unusual lengths just return the digits as-is.
export function normalizePhone(raw) {
  if (!raw) return ''
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)   // +91XXXXXXXXXX
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1) // 0XXXXXXXXXX
  return d
}

// Keep a phone box numeric while it is being typed. Letters and punctuation are
// dropped outright; a pasted +91 / 0-prefixed number collapses to the 10-digit
// local number rather than being truncated into a different number.
export function typedPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '').slice(0, 12)
  if (d.length > 10) d = normalizePhone(d)
  return d.slice(0, 10)
}

// A phone is only usable as a login identifier at full length.
export const isValidPhone = (raw) => normalizePhone(raw).length === 10

// True when a typed identifier is "phone-ish" enough to try as a phone login
// (so short numeric usernames / PINs aren't mistaken for phone numbers).
export function looksLikePhone(raw) {
  return normalizePhone(raw).length >= 6
}
