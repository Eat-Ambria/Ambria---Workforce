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
//
// `n` is how many things the rate was measured over. With none, there is no rate
// to judge and the figure is grey: pct(0, 0) is 0, and a red 0% for a day nobody
// has recorded yet reads as a failure rather than as an empty page.
export function rateTone(rate, C, n = 1) {
  if (!n) return C.faint
  if (rate >= 85) return C.green
  if (rate >= 60) return C.yellow
  return C.red
}

// A number worth reading, or a grey placeholder. Zero is information only when
// something was expected; twelve zeros down a column are just noise.
export const zeroTone = (value, C, tone) => (value ? (tone || C.text) : C.faint)
