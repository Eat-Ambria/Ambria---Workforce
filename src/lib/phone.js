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

// True when a typed identifier is "phone-ish" enough to try as a phone login
// (so short numeric usernames / PINs aren't mistaken for phone numbers).
export function looksLikePhone(raw) {
  return normalizePhone(raw).length >= 6
}
