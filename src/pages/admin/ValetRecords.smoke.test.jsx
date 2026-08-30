// @vitest-environment jsdom
//
// The environment is declared HERE rather than in a config file: this repo has
// no vitest config, and `npm test` would otherwise run this in Node and fail on
// `document`. One docblock beats a config file added for one test.
// A render smoke test, because this codebase's recurring failure is a page that
// BUILDS cleanly and throws on render — a name never imported, a const read
// before its line. Vite resolves modules, not identifiers, so the build says
// nothing about either.
//
// Rows below are copied from the live API, including the awkward ones: a car
// still parked (no fetched_by, no delivered_at), a status the brief does not
// list ('re_parking'), a null rating, and a 'poor' whose comment has not
// arrived yet.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../lib/valetReport', () => ({
  EXPORT_CAP: 5000,
  allValetRecords: vi.fn(async () => []),
  valetReport: vi.fn(async (report) => {
    if (report === 'properties') {
      return { ok: true, properties: [{ id: 'ex-uuid', name: 'Ambria Exotica', is_active: true }] }
    }
    return {
      ok: true,
      total: 3,
      records: [
        {
          id: '1', service_date: '2026-08-30', property_id: 'ex-uuid', property_name: 'Ambria Exotica',
          token_number: 4, guest_name: 'Bipul', guest_phone: '7011775583', car_number: '2580',
          car_tier: 'Premium', parking_location: 'parking', notes: null,
          status: 're_parking',                       // NOT one of the three the brief names
          parked_at: '2026-08-30T06:51:39.871308+00:00',
          delivered_at: null, retrievals: 1, no_shows: 1,
          parked_by: 'test 2', parked_by_hi: 'टेस्ट 2',
          fetched_by: null, fetched_by_hi: null,      // still on site
          rating: null, review_comment: null,         // never answered
        },
        {
          id: '2', service_date: '2026-08-21', property_name: 'Ambria Exotica',
          token_number: 11, guest_name: 'Kbks', guest_phone: '6575676571', car_number: '9797',
          car_tier: 'Standard', status: 'delivered',
          parked_at: '2026-08-21T09:00:00Z', delivered_at: '2026-08-21T14:30:00Z',
          parked_by: 'test', fetched_by: 'test 2',
          rating: 'poor', review_comment: null,       // the reason has not landed yet
        },
        {
          // A valet deployment without migration 0044 omits rating and
          // review_comment ENTIRELY rather than sending null.
          id: '3', service_date: '2026-08-05', property_name: 'Ambria Exotica',
          token_number: 1, guest_name: 'Msm', guest_phone: '9999949494', car_number: '4949',
          car_tier: 'VIP', status: 'delivered',
          parked_at: '2026-08-05T04:00:00Z', delivered_at: '2026-08-05T18:05:00Z',
          parked_by: 'test', fetched_by: 'test',
        },
      ],
    }
  }),
  ValetReportError: class extends Error {},
}))

// eslint-disable-next-line import/first
import ValetRecords from './ValetRecords'
// eslint-disable-next-line import/first
import { LangProvider } from '../../context/LangContext'
// eslint-disable-next-line import/first
import { ThemeProvider } from '../../context/ThemeContext'

const flush = () => new Promise((r) => setTimeout(r, 0))

// The component reads colours and language from context, the way it does in the
// app. Rendering it bare would only prove the providers are missing.
const draw = () => render(
  <ThemeProvider>
    <LangProvider>
      <ValetRecords visibleProps={[{ code: 'ex' }]} scopeAll />
    </LangProvider>
  </ThemeProvider>,
)

describe('ValetRecords', () => {
  it('renders live-shaped rows without throwing', async () => {
    draw()
    await flush()
    await flush()

    expect(await screen.findByText('Bipul')).toBeTruthy()
    expect(screen.getByText('7011775583')).toBeTruthy()

    // An unlisted status renders as itself rather than vanishing or crashing.
    expect(screen.getByText('Re parking')).toBeTruthy()

    // A guest who never answered is an em dash, not 0 and not blank. Three of
    // these: the unrated row's rating, and the two missing operator names on it.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)

    // A Poor with no comment yet must not read as "no comment given".
    expect(screen.getByText('awaiting their reason')).toBeTruthy()

    // The row missing the 0044 keys entirely must still render.
    expect(screen.getByText('Msm')).toBeTruthy()

    // The pager reads off `total`, not the page length.
    expect(screen.getByText(/1–3 of 3/)).toBeTruthy()
  })
})

describe('ValetRecords auto refresh', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('re-reads on the timer, and not while the tab is hidden', async () => {
    const { valetReport } = await import('../../lib/valetReport')
    const records = () => valetReport.mock.calls.filter(([r]) => r === 'records').length

    vi.useFakeTimers({ shouldAdvanceTime: true })
    draw()
    await vi.advanceTimersByTimeAsync(0)
    const first = records()
    expect(first).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(records()).toBe(first + 1)

    await vi.advanceTimersByTimeAsync(10000)
    expect(records()).toBe(first + 3)

    // A backgrounded tab must stop. Left running it would poll two Supabase
    // projects for as long as the tab exists.
    const after = records()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(20000)
    expect(records()).toBe(after)
  })
})
