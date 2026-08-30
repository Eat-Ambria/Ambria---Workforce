// @vitest-environment jsdom
//
// The contract call is 88 pages and about twelve seconds. Everything below is
// about not paying that twice — and about the cache never being the reason the
// page breaks.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The proxy call, stubbed. `hits` counts what actually reached the network.
let hits = 0
let rows = [{ rowId: 1, date: '2026-09-01', cancelled: false }]
let fails = false

vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: async () => {
        hits += 1
        if (fails) return { data: null, error: { message: 'LMS down' } }
        return { data: { Contractinfo: rows.map((r) => ({ id: r.rowId, fiscd_function_date: r.date })) } }
      },
    },
  },
}))

const KEY = 'ambria.lms.contracts.v1'

let lms
beforeEach(async () => {
  hits = 0
  fails = false
  rows = [{ rowId: 1, date: '2026-09-01', cancelled: false }]
  localStorage.clear()
  vi.resetModules()             // a fresh module means fresh in-memory state
  lms = await import('./lms')
})
afterEach(() => { vi.useRealTimers() })

describe('the contract cache', () => {
  it('fetches once, then serves from memory', async () => {
    await lms.lmsVenueContracts()
    await lms.lmsVenueContracts()
    await lms.lmsVenueContracts()
    expect(hits).toBe(1)
  })

  it('makes ONE request when several callers arrive together', async () => {
    // Two mounts in the same tick. Without the in-flight promise this is two
    // twelve-second requests racing each other.
    const [a, b] = await Promise.all([lms.lmsVenueContracts(), lms.lmsVenueContracts()])
    expect(hits).toBe(1)
    expect(a).toEqual(b)
  })

  it('survives a reload through localStorage', async () => {
    await lms.lmsVenueContracts()
    expect(hits).toBe(1)
    expect(localStorage.getItem(KEY)).toBeTruthy()

    // A reload: module state is gone, storage is not.
    vi.resetModules()
    const fresh = await import('./lms')
    const got = await fresh.lmsVenueContracts()
    expect(hits).toBe(1)          // still one — no second network call
    expect(got.length).toBe(1)
  })

  it('serves stale rows immediately and refreshes behind them', async () => {
    await lms.lmsVenueContracts()
    expect(hits).toBe(1)

    // Push the stored entry past the ten-minute TTL.
    const held = JSON.parse(localStorage.getItem(KEY))
    held.at = Date.now() - 11 * 60 * 1000
    localStorage.setItem(KEY, JSON.stringify(held))
    vi.resetModules()
    const fresh = await import('./lms')

    rows = [{ rowId: 1, date: '2026-09-01' }, { rowId: 2, date: '2026-09-02' }]
    const onFresh = vi.fn()
    const immediate = await fresh.lmsVenueContracts({}, { onFresh })

    // Handed back at once, from the stale copy — not after a refetch.
    expect(immediate.length).toBe(1)
    await vi.waitFor(() => expect(onFresh).toHaveBeenCalled())
    expect(onFresh.mock.calls[0][0].length).toBe(2)
    expect(hits).toBe(2)
  })

  it('does not serve a filtered query from the full-list cache', async () => {
    await lms.lmsVenueContracts()
    expect(hits).toBe(1)
    // A filter must reach the network, or the calendar's full list would be
    // returned as if it were the filtered answer.
    await lms.lmsVenueContracts({ venue_search: '3' })
    expect(hits).toBe(2)
  })

  it('retries after a failure instead of latching onto the rejected promise', async () => {
    fails = true
    await expect(lms.lmsVenueContracts()).rejects.toThrow()
    fails = false
    const got = await lms.lmsVenueContracts()
    expect(got.length).toBe(1)
    expect(hits).toBe(2)
  })

  it('still works when storage throws, as it does in a private window', async () => {
    const boom = () => { throw new Error('access denied') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.resetModules()
    const fresh = await import('./lms')

    const got = await fresh.lmsVenueContracts()
    expect(got.length).toBe(1)
    vi.restoreAllMocks()
  })

  it('clearLmsCache forces the next call back to the network', async () => {
    await lms.lmsVenueContracts()
    lms.clearLmsCache()
    await lms.lmsVenueContracts()
    expect(hits).toBe(2)
  })
})
