// Small date/time helpers.
export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function nowISO() {
  return new Date().toISOString()
}

export function fmtDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

export function fmtDateTime(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return d
  }
}

// Normalize a stored time into 24-hour "HH:MM" for a native <input type="time">.
// Accepts "HH:MM(:SS)" or free-text like "7 PM" / "7:30 pm"; returns '' if it
// can't be represented (so the picker just starts empty).
export function to24h(t) {
  if (!t) return ''
  const s = String(t).trim()
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (m && parseInt(m[1], 10) <= 23) return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (m) {
    let h = parseInt(m[1], 10) % 12
    if (/p/i.test(m[3])) h += 12
    return `${String(h).padStart(2, '0')}:${m[2] || '00'}`
  }
  return ''
}

// Format a time for display in 12-hour (AM/PM) form.
// Accepts 24-hour "HH:MM" / "HH:MM:SS"; anything already free-text (e.g. "7 PM")
// is returned unchanged so we never mangle a hand-typed value.
export function fmtTime(t) {
  if (!t) return ''
  const s = String(t).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return s
  const hr = parseInt(m[1], 10)
  if (Number.isNaN(hr) || hr > 23) return s
  const ampm = hr >= 12 ? 'PM' : 'AM'
  const h12 = hr % 12 || 12
  return `${h12}:${m[2]} ${ampm}`
}
