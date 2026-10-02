// "Paid" moves a bill to the same day next month. The month end is the part
// that goes wrong by default: new Date(y, m + 1, 31) in a 30-day month rolls
// into the month after. This matches what the nightly rollover does in Postgres.

import { describe, expect, it } from 'vitest'
import { nextMonthISO } from './WifiServices'

describe('nextMonthISO', () => {
  it('moves to the same day next month', () => {
    expect(nextMonthISO('2026-10-05')).toBe('2026-11-05')
    expect(nextMonthISO('2026-09-09')).toBe('2026-10-09')
  })

  it('crosses the year', () => {
    expect(nextMonthISO('2026-12-15')).toBe('2027-01-15')
  })

  it('clamps to the last day of a shorter month instead of spilling over', () => {
    expect(nextMonthISO('2027-01-31')).toBe('2027-02-28')
    expect(nextMonthISO('2028-01-31')).toBe('2028-02-29')   // leap year
    expect(nextMonthISO('2026-10-31')).toBe('2026-11-30')
  })
})
