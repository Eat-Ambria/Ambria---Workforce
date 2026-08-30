// @vitest-environment jsdom
//
// The heavy-date uplift, against the real staffing matrix rather than a made-up
// breakdown — the rule has to hold for the venues that run a Rider and the two
// that do not.

import { describe, expect, it } from 'vitest'

import { allocateValet, VALET_MATRIX } from '../../constants/valetMatrix'

// Copied from Valet.jsx. If these drift, the test is measuring the wrong thing —
// which is why the values are asserted against the source below.
const HEAVY_ROLE = 'Driver'
const HEAVY_EXTRA = 2
const withHeavy = (breakdown, heavy) => {
  if (!heavy || !breakdown) return breakdown
  if (!breakdown.some((b) => b.role === HEAVY_ROLE)) return breakdown
  return breakdown.map((b) => (b.role === HEAVY_ROLE ? { ...b, count: b.count + HEAVY_EXTRA } : b))
}

const drivers = (bd) => bd.find((b) => b.role === HEAVY_ROLE)?.count
const total = (bd) => bd.reduce((n, b) => n + b.count, 0)

describe('the heavy-date uplift', () => {
  it('is what Valet.jsx actually uses', async () => {
    const src = await import('fs').then((fs) => fs.readFileSync('src/pages/admin/Valet.jsx', 'utf8'))
    expect(src).toContain("const HEAVY_ROLE = 'Driver'")
    expect(src).toContain('const HEAVY_EXTRA = 2')
  })

  it('adds two drivers at every venue, and touches nothing else', () => {
    for (const code of Object.keys(VALET_MATRIX)) {
      const base = allocateValet(code, 250, VALET_MATRIX)
      if (!base?.breakdown) continue
      const heavy = withHeavy(base.breakdown, true)

      expect(drivers(heavy)).toBe(drivers(base.breakdown) + 2)
      expect(total(heavy)).toBe(total(base.breakdown) + 2)

      // Same roles, same order — the panel renders them positionally.
      expect(heavy.map((b) => b.role)).toEqual(base.breakdown.map((b) => b.role))
      // Every other role is untouched.
      base.breakdown
        .filter((b) => b.role !== HEAVY_ROLE)
        .forEach((b) => expect(heavy.find((h) => h.role === b.role).count).toBe(b.count))
    }
  })

  it('changes nothing when the date is light', () => {
    const base = allocateValet('pp', 250, VALET_MATRIX)
    expect(withHeavy(base.breakdown, false)).toBe(base.breakdown)
  })

  it('does not mutate the matrix result it was given', () => {
    const base = allocateValet('pp', 250, VALET_MATRIX)
    const before = drivers(base.breakdown)
    withHeavy(base.breakdown, true)
    // Toggling heavy on and off must not ratchet the number upwards.
    expect(drivers(base.breakdown)).toBe(before)
  })

  it('invents no role where the venue has none', () => {
    // A venue running no Driver at all must gain nothing rather than have the
    // role appended. Restro and Janakpuri already run no Rider, so a role being
    // absent from a breakdown is a real shape here.
    const noDriver = [{ role: 'Key Man', count: 1 }, { role: 'Guard', count: 2 }]
    expect(withHeavy(noDriver, true)).toBe(noDriver)
  })

  it('holds at a small guest count too, where the matrix gives few drivers', () => {
    const small = allocateValet('rs', 50, VALET_MATRIX)
    const heavy = withHeavy(small.breakdown, true)
    expect(drivers(heavy)).toBe(drivers(small.breakdown) + 2)
  })
})
