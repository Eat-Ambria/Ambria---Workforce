// Shared maths + formatting for the Analytics page and its presentational parts.

export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0)

export function fmtDur(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// The database returns sums + counts, never averages — averaging a set of
// averages is wrong once the groups have different sizes.
export const avgOf = (sum, n) => (n > 0 ? sum / n : null)

export const sumBy = (rows, key) => rows.reduce((total, r) => total + (Number(r[key]) || 0), 0)

// On-time percentage decides the colour everywhere it appears. These are status
// colours, so they are always shown with an icon and a word — never colour alone.
export function rateTone(rate, C) {
  if (rate >= 85) return C.green
  if (rate >= 60) return C.yellow
  return C.red
}
