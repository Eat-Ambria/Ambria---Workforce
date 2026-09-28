// The arithmetic that decides whether somebody is blamed for a day they were
// not here.
//
// `owedOverRange` lives in Analytics.jsx because that is the only page that
// needs it, but it is tested from here beside `absenceKey`, whose format it
// depends on — the two agreeing on `"user|date"` is the whole mechanism, and a
// mismatch would fail silently in the most expensive way: every absence
// ignored, every day off counted as a miss, and no error anywhere.

import { describe, expect, it } from 'vitest'
import { absenceKey } from './absences'
import { owedOverRange } from '../pages/admin/Analytics'

// 2026-09-01 is a Tuesday; the 7th is the following Monday.
const d = (iso) => {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}

const daily = { assigned_to: 'u1', category: 'daily' }
const weeklyMonday = { assigned_to: 'u1', category: 'weekly', week_day: 1 }

// The shapes the caller actually passes: a Set of composite keys, and a Set of
// the ids appearing in it.
const absences = (...pairs) => {
  const set = new Set(pairs.map(([u, day]) => absenceKey(u, day)))
  const people = new Set(pairs.map(([u]) => u))
  return [set, people]
}

describe('owedOverRange', () => {
  it('is plain expectedOccurrences when nobody was absent', () => {
    const [set, people] = absences()
    expect(owedOverRange(daily, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(7)
  })

  it('drops one day per absence', () => {
    const [set, people] = absences(['u1', '2026-09-03'], ['u1', '2026-09-04'])
    expect(owedOverRange(daily, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(5)
  })

  it('ignores an absence outside the range', () => {
    const [set, people] = absences(['u1', '2026-08-30'], ['u1', '2026-09-20'])
    expect(owedOverRange(daily, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(7)
  })

  it('only drops a day the job would actually have fired on', () => {
    // Out on the Tuesday. A Monday-only job was owed nothing that day, so the
    // count is untouched — this is why the days are re-asked of the schedule
    // instead of subtracted flat.
    const [set, people] = absences(['u1', '2026-09-01'])
    expect(owedOverRange(weeklyMonday, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(1)
  })

  it('drops the one day that does fire', () => {
    const [set, people] = absences(['u1', '2026-09-07'])   // the Monday
    expect(owedOverRange(weeklyMonday, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(0)
  })

  it("ignores somebody else's absence", () => {
    const [set, people] = absences(['u2', '2026-09-03'])
    expect(owedOverRange(daily, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(7)
  })

  it('leaves an unassigned job alone', () => {
    // Nobody holds it, so nobody's absence can excuse it. It is an empty slot,
    // which is a different problem and one this page reports elsewhere.
    const [set, people] = absences(['u1', '2026-09-03'])
    const orphan = { category: 'daily' }
    expect(owedOverRange(orphan, d('2026-09-01'), d('2026-09-07'), set, people)).toBe(7)
  })

  it('never goes below zero', () => {
    const [set, people] = absences(
      ['u1', '2026-09-01'], ['u1', '2026-09-02'], ['u1', '2026-09-03'],
    )
    expect(owedOverRange(daily, d('2026-09-01'), d('2026-09-03'), set, people)).toBe(0)
  })

  it('takes the fast path when the person has no absences at all', () => {
    // absentPeople is the guard: a key present in the set but the id missing
    // from the people set must not be walked. Verified by proving the absence
    // is NOT applied — which is what the guard does when it short-circuits.
    const set = new Set([absenceKey('u1', '2026-09-03')])
    expect(owedOverRange(daily, d('2026-09-01'), d('2026-09-07'), set, new Set())).toBe(7)
  })
})

describe('absenceKey', () => {
  it('is the format Analytics splits back apart on the last separator', () => {
    expect(absenceKey('u1', '2026-09-03')).toBe('u1|2026-09-03')
  })

  it('survives an id containing the separator', () => {
    // Splitting on the LAST '|' is why this holds. `id.split('|')[0]` would
    // have quietly attributed these days to a person who does not exist.
    const key = absenceKey('pp|pawan', '2026-09-03')
    expect(key.slice(0, key.lastIndexOf('|'))).toBe('pp|pawan')
  })
})
