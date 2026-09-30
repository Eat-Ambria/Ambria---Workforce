// Monthly work used to stay visible for a whole week (four "weeks" a month
// spread the load out); it is now pinned to one exact date, the same as any
// other same-day work — not due before, gone after, missed rather than caught
// up on. These tests pin the arithmetic behind that: which date a stored value
// means, whether today is that date, and whether a miss reads as a miss.

import { describe, expect, it } from 'vitest'
import {
  monthlyDate, ordinal, isDueToday, isTaskOverdue, overdueReason,
  expectedOccurrences, isTodaysWork, DAILY_OVERDUE_HOUR,
} from './org'

const d = (iso) => {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}
const at = (iso, hour) => { const x = d(iso); x.setHours(hour); return x }

describe('monthlyDate', () => {
  it('is the stored value itself, not a formula on it', () => {
    expect(monthlyDate(15)).toBe(15)
    expect(monthlyDate(1)).toBe(1)
    expect(monthlyDate(31)).toBe(31)
  })

  it('still reads the old week-index values as themselves — 2, 3 and 4 are real dates now, not weeks', () => {
    // this is exactly why the data migration converts existing rows rather than
    // leaving the column's old contents to be reinterpreted
    expect(monthlyDate(2)).toBe(2)
    expect(monthlyDate(4)).toBe(4)
  })

  it('defaults a missing value to the 1st, as it always has', () => {
    expect(monthlyDate(null)).toBe(1)
    expect(monthlyDate(undefined)).toBe(1)
    expect(monthlyDate('')).toBe(1)
  })

  it('clamps out-of-range input rather than producing a date that cannot exist', () => {
    expect(monthlyDate(0)).toBe(1)
    expect(monthlyDate(-5)).toBe(1)
    expect(monthlyDate(45)).toBe(31)
  })
})

describe('ordinal', () => {
  it('suffixes the common cases', () => {
    expect(ordinal(1, 'en')).toBe('1st')
    expect(ordinal(2, 'en')).toBe('2nd')
    expect(ordinal(3, 'en')).toBe('3rd')
    expect(ordinal(4, 'en')).toBe('4th')
  })

  it('gets the 11/12/13 exception right — the one case a naive %10 formula misses', () => {
    expect(ordinal(11, 'en')).toBe('11th')
    expect(ordinal(12, 'en')).toBe('12th')
    expect(ordinal(13, 'en')).toBe('13th')
  })

  it('resumes st/nd/rd past the teens, up to the days a month actually has', () => {
    expect(ordinal(21, 'en')).toBe('21st')
    expect(ordinal(22, 'en')).toBe('22nd')
    expect(ordinal(23, 'en')).toBe('23rd')
    expect(ordinal(31, 'en')).toBe('31st')
  })

  it('returns the bare number in Hindi — Devanagari ordinals are not how a rota is written', () => {
    expect(ordinal(15, 'hi')).toBe('15')
    expect(ordinal(22, 'hi')).toBe('22')
  })
})

describe('isDueToday — monthly', () => {
  const jobOn = (day) => ({ category: 'monthly', month_week: day, assigned_to: 'u1' })

  it('is due on its exact date and no other', () => {
    const job = jobOn(15)
    expect(isDueToday(job, d('2026-09-14'))).toBe(false)
    expect(isDueToday(job, d('2026-09-15'))).toBe(true)
    expect(isDueToday(job, d('2026-09-16'))).toBe(false)
  })

  it('does not stay open for the rest of the week the way it used to', () => {
    const job = jobOn(15)
    // the 15th falls on a Tuesday in September 2026; the old "week window"
    // logic would have kept this due through Sunday the 20th
    expect(isDueToday(job, d('2026-09-18'))).toBe(false)
    expect(isDueToday(job, d('2026-09-20'))).toBe(false)
  })

  it('treats a missing value as the 1st', () => {
    const job = { category: 'monthly', assigned_to: 'u1' }
    expect(isDueToday(job, d('2026-09-01'))).toBe(true)
    expect(isDueToday(job, d('2026-09-02'))).toBe(false)
  })

  it('has no occurrence in a month too short to hold the date', () => {
    // the 31st does not exist in February; nothing stands in for it
    const job = jobOn(31)
    expect(isDueToday(job, d('2026-02-28'))).toBe(false)
    expect(isDueToday(job, d('2026-03-31'))).toBe(true)
  })
})

describe('isTaskOverdue / overdueReason — monthly', () => {
  const job = (day, status = 'pending') => ({
    category: 'monthly', month_week: day, status, assigned_to: 'u1',
  })

  it('is not overdue on its own date before the cutoff hour', () => {
    const before = at('2026-09-15', DAILY_OVERDUE_HOUR - 1)
    expect(isTaskOverdue(job(15), '2026-09-15', before)).toBe(false)
  })

  it('is overdue on its own date once the cutoff hour passes, same as daily work', () => {
    const after = at('2026-09-15', DAILY_OVERDUE_HOUR)
    expect(isTaskOverdue(job(15), '2026-09-15', after)).toBe(true)
    expect(overdueReason(job(15), '2026-09-15', after)).toEqual({ kind: 'today' })
  })

  it('is never overdue on a day it was not due — it has already disappeared, the same as a missed alternate-day round', () => {
    const nextDay = at('2026-09-16', 23)
    expect(isTaskOverdue(job(15), '2026-09-16', nextDay)).toBe(false)
    expect(overdueReason(job(15), '2026-09-16', nextDay)).toBe(null)
  })

  it('is never late by a week — there is no monthweek kind any more', () => {
    const midMonth = at('2026-09-20', 23)
    const why = overdueReason(job(15), '2026-09-20', midMonth)
    expect(why).toBe(null)
    // and even forcing an overdue check directly never produces the old kind
    expect(isTaskOverdue(job(15), '2026-09-20', midMonth)).toBe(false)
  })

  it('a completed job is never overdue, whatever the hour', () => {
    const after = at('2026-09-15', DAILY_OVERDUE_HOUR)
    expect(isTaskOverdue(job(15, 'completed'), '2026-09-15', after)).toBe(false)
  })
})

describe('expectedOccurrences — monthly', () => {
  it('is owed exactly once across a range that contains its date', () => {
    const job = { category: 'monthly', month_week: 15, assigned_to: 'u1' }
    expect(expectedOccurrences(job, d('2026-09-01'), d('2026-09-30'))).toBe(1)
  })

  it('is owed twice across a range spanning two months', () => {
    const job = { category: 'monthly', month_week: 15, assigned_to: 'u1' }
    expect(expectedOccurrences(job, d('2026-09-01'), d('2026-10-31'))).toBe(2)
  })

  it('is owed zero when the range does not reach the date', () => {
    const job = { category: 'monthly', month_week: 15, assigned_to: 'u1' }
    expect(expectedOccurrences(job, d('2026-09-01'), d('2026-09-14'))).toBe(0)
  })

  it('skips a month too short for the date, rather than owing it on the last day instead', () => {
    const job = { category: 'monthly', month_week: 31, assigned_to: 'u1' }
    // Feb 2026 has 28 days; only January and March owe this job
    expect(expectedOccurrences(job, d('2026-02-01'), d('2026-02-28'))).toBe(0)
    expect(expectedOccurrences(job, d('2026-01-01'), d('2026-03-31'))).toBe(2)
  })
})

describe('isTodaysWork', () => {
  // 2026-09-28 is a Monday, the 30th a Wednesday
  const weekly = (day) => ({ category: 'weekly', week_day: day })

  it('counts a weekly job on its own day', () => {
    expect(isTodaysWork(weekly(1), d('2026-09-28'))).toBe(true)
  })

  it('does not count a weekly job left over from earlier in the week — that is late, not today', () => {
    // still due (it is on the list), but it is Monday's work
    expect(isDueToday(weekly(1), d('2026-09-30'))).toBe(true)
    expect(isTodaysWork(weekly(1), d('2026-09-30'))).toBe(false)
  })

  it('does not count a weekly job whose day has not come yet', () => {
    expect(isTodaysWork(weekly(5), d('2026-09-28'))).toBe(false)
  })

  it('counts Sunday-only work on a Sunday', () => {
    expect(isTodaysWork(weekly(7), d('2026-10-04'))).toBe(true)
  })

  it('agrees with isDueToday for everything that is already pinned to its day', () => {
    const daily = { category: 'daily' }
    const alt = { category: 'alternate', week_days: [1, 3] }
    const monthly = { category: 'monthly', month_week: 30 }
    for (const iso of ['2026-09-28', '2026-09-29', '2026-09-30']) {
      for (const task of [daily, alt, monthly]) {
        expect(isTodaysWork(task, d(iso))).toBe(isDueToday(task, d(iso)))
      }
    }
  })
})
