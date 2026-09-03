// LMS (gyv.inqcrm.in) client — talks to the CRM through the `lms-proxy` edge
// function (see supabase/functions/lms-proxy) to avoid browser CORS.
//
// Field names below are mapped from REAL sample responses:
//   get_venue_information_list          -> { leadinfo: [...] }      (enquiries)
//   get_venue_contract_information_list -> { Contractinfo: [...] }  (confirmed events)
// Contracts carry venue id / date / timings / pax / amount, so the valet
// calendar is driven by CONTRACTS (real confirmed events). Leads are enquiries
// and mostly have no venue/date, so they're available but not shown on the grid.

import { supabase } from './supabase'

// internal property code <-> LMS venue id (from LMS_API_Mapping.md "Venue Map")
export const LMS_VENUE_BY_PROP = { pp: 3, ex: 19, mk: 6, rs: 16 }
export const PROP_BY_LMS_VENUE = { 3: 'pp', 19: 'ex', 6: 'mk', 16: 'rs' }
// The CRM's catch-all venue. An event filed against it applies to every
// property, so it must not be filtered out as "some other venue".
// (18 = TENDER PROGRAM is internal and deliberately not mapped.)
export const LMS_ALL_VENUES = 20

// One hue per venue for the calendar dots — blue / magenta / green / yellow.
//
// A calendar can show all four venues on the same day, so every PAIR has to be
// separable, not just neighbours in a legend. Of the 70 four-hue combinations in
// the data-viz palette this scored best on both measures the validator reports:
// worst pair 19.6 to the naked eye and 13.0 under colour-blind simulation.
//
// Do not substitute brand colours here. The obvious picks fail hard: blue+violet
// are 0.4 apart under deuteranopia (identical), and green+amber are 6.8 under
// protanopia. Re-run scripts/validate_palette.js --pairs all before changing one.
//
// Yellow and magenta sit under 3:1 on white, so the dots carry a neutral ring to
// stay visible, and the legend above the grid names every venue — identity is
// never left to colour alone.
export const VENUE_COLORS = { pp: '#2a78d6', ex: '#e87ba4', mk: '#008300', rs: '#eda100', jp: '#4a3aa7' }

// keeps a faint dot (yellow, magenta) legible against a white cell
export const VENUE_DOT_RING = 'rgba(16,24,40,0.22)'

// LMS function-type id -> readable name
const FUNCTION_TYPES = {
  1: 'Ring Ceremony', 2: 'Birthday', 3: 'Wedding', 4: 'Reception', 5: 'Kua Poojan',
  6: 'Anniversary', 7: 'Lagan', 8: 'Sagan', 9: 'Cocktail', 10: 'Religious', 11: 'Corporate',
  12: 'Proposal Ceremony', 14: 'Haldi', 15: 'Mehendi', 16: 'Roka Ceremony', 17: 'Residential Wedding',
  18: 'Destination Wedding', 19: 'Kothi Booking', 20: 'Sangeet', 21: 'Baby Shower', 22: 'Engagement',
  23: 'Tender', 24: 'Barat Assembly', 25: 'House Party', 26: 'Lunch Function', 27: 'Breakfast Function',
  28: 'Dinner Function', 29: 'Breakfast', 30: 'Lunch', 31: 'Kitty Party', 32: 'Restaurant Sale',
  33: 'Lohri', 34: 'Diwali Party', 35: 'Get Together', 36: 'Mata Ki Chowki',
}
const fnType = (v) => (v == null || v === '' ? undefined : (FUNCTION_TYPES[Number(v)] || String(v)))

// call the LMS via the edge-function proxy.
// paginate=true tells the proxy to walk `page_limit` (which is a PAGE NUMBER,
// not a row count) until the pages run out. Without it the API answers with a
// perfectly valid-looking page 1 of ten rows and no hint that more exist.
async function lmsCall(path, body = {}, paginate = false) {
  const { data, error } = await supabase.functions.invoke('lms-proxy', { body: { path, body, paginate } })
  if (error) throw new Error(error.message || 'LMS request failed')
  if (data && data.error) throw new Error(data.error)
  return data
}

// first value whose key ends with one of the given suffixes (case-insensitive).
// 0 is kept; empty-string / null are skipped.
function pick(obj, ...suffixes) {
  if (!obj || typeof obj !== 'object') return undefined
  const keys = Object.keys(obj)
  for (const suf of suffixes) {
    const k = keys.find((key) => key.toLowerCase().endsWith(suf.toLowerCase()))
    if (k != null && obj[k] !== '' && obj[k] != null) return obj[k]
  }
  return undefined
}

// The whole original row used to ride along on every contract as `raw`. Nothing
// in the app ever read it, and it was 92% of the payload — 2.18 MB against the
// 176 KB the named fields come to. Add a named field here instead of putting it
// back; a cache cannot hold 2 MB and this is what made one possible.

// pull the array out of the response envelope (leadinfo / Contractinfo / etc.)
function asArray(res) {
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object') {
    for (const key of ['leadinfo', 'Contractinfo', 'contractinfo', 'data', 'result', 'list', 'records', 'rows']) {
      if (Array.isArray(res[key])) return res[key]
    }
    const arr = Object.values(res).find((v) => Array.isArray(v)) // fallback: first array value
    if (arr) return arr
  }
  return []
}

// normalize an LMS date (YYYY-MM-DD[ time], DD-MM-YYYY, DD/MM/YYYY) -> YYYY-MM-DD
export function lmsDateToIso(d) {
  if (!d) return ''
  const s = String(d).trim().slice(0, 10)
  let m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)   // DD-MM-YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)         // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return s
}

function normEvent(row) {
  return {
    rowId: row.id ?? pick(row, 'entryno'),
    entryNo: pick(row, 'entryno'),
    venueId: pick(row, 'venue_id', 'venueid'),
    venueName: pick(row, 'venue_name', 'venuename'),
    date: pick(row, 'function_date'),
    time: pick(row, 'function_timings', 'session'),
    customer: pick(row, 'guest_name', 'client_name'),
    phone: pick(row, 'client_mobile', 'secondary_mobileno'),
    functionType: fnType(pick(row, 'function_type')),
    guests: pick(row, 'pax_no', 'no_of_pax'),
    cancelled: !!pick(row, 'cancel_remarks'),
  }
}

function normContract(row) {
  return {
    rowId: row.id ?? pick(row, 'entryno'),
    entryNo: pick(row, 'entryno'),
    venueId: pick(row, 'venue_id', 'venueid'),
    venueName: pick(row, 'venue_name', 'venuename'),
    date: pick(row, 'function_date'),
    time: pick(row, 'function_timings'),
    session: pick(row, 'session'),
    customer: pick(row, 'guest_name', 'client_name'),
    phone: pick(row, 'client_mobile', 'secondary_contact'),
    functionType: fnType(pick(row, 'function_type')),
    guests: pick(row, 'pax_no', 'no_of_pax'),
    amount: pick(row, 'total_amt', 'grand_total', 'total_amount'),
    balance: pick(row, 'balance'),
    location: pick(row, 'location_name', 'location'),
    status: pick(row, 'status'),
    cancelled: !!pick(row, 'cancel_remarks'),
  }
}

// venue enquiries (leads) — available but rarely have a firm date/venue.
export async function lmsVenueEvents(body = {}) {
  const res = await lmsCall('/api/v1/processerp_api/get_venue_information_list', body)
  return asArray(res).map(normEvent).filter((e) => !e.cancelled)
}

// venue contracts — CONFIRMED events with venue/date/time/pax/amount.
// Every page by default; pass { paginate: false } for the raw first page (10
// rows) when debugging.
// --- the contract cache -----------------------------------------------------
//
// This one call is 88 pages, 2.2 MB and about twelve seconds, and the valet
// calendar makes it on every mount — so walking away from the page and coming
// back means watching the spinner again for work that was already done.
//
// Three layers, each covering what the one before cannot:
//
//   * an in-flight promise, so two mounts in the same tick make ONE request
//     rather than two twelve-second ones racing each other;
//   * memory, so moving around the app is instant;
//   * localStorage, so a reload or a PWA relaunch is instant too — which is the
//     common case on a phone, where the app gets killed between uses.
//
// Stale-while-revalidate rather than a hard expiry: past the TTL the cached
// contracts are still handed back immediately and a refresh runs behind them,
// because a twelve-second wait for figures that are ten minutes old helps
// nobody. The caller gets the new rows through `onFresh` when they land.
const CONTRACTS_TTL_MS = 10 * 60 * 1000
// Bump the version whenever a stored field changes shape. v1 was written while a
// pax count of 0 was being dropped, so those rows carry no `guests` key at all —
// reverting the code cannot fix a browser that already holds one. A new key
// abandons the old rows instead of trying to repair them; the old key is left to
// expire on its own rather than swept, which would need a scan on every load.
export const CONTRACTS_KEY = 'ambria.lms.contracts.v2'

let contractsMemo = null   // { at, rows }
let contractsInFlight = null

// Every storage call is guarded: a private window throws on access rather than
// returning empty, and a cache is never worth taking the page down for.
const readStore = () => {
  try {
    const raw = localStorage.getItem(CONTRACTS_KEY)
    const v = raw ? JSON.parse(raw) : null
    return v && Array.isArray(v.rows) ? v : null
  } catch { return null }
}
const writeStore = (v) => {
  try { localStorage.setItem(CONTRACTS_KEY, JSON.stringify(v)) } catch { /* full or blocked */ }
}

export function clearLmsCache() {
  contractsMemo = null
  try { localStorage.removeItem(CONTRACTS_KEY) } catch { /* ignore */ }
}

async function fetchContracts(body, paginate) {
  const res = await lmsCall('/api/v1/processerp_api/get_venue_contract_information_list', body, paginate)
  return asArray(res)
    .map(normContract)
    .filter((c) => !c.cancelled)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/**
 * Confirmed venue events.
 *
 * @param body      LMS filters. Anything non-empty bypasses the cache entirely —
 *                  a filtered result must never be served as the full list.
 * @param onFresh   called with newer rows if the cache was stale and a
 *                  background refresh brought something back.
 */
export async function lmsVenueContracts(body = {}, { paginate = true, onFresh } = {}) {
  const cacheable = paginate && Object.keys(body).length === 0
  if (!cacheable) return fetchContracts(body, paginate)

  const load = () => {
    // One request, however many callers. Cleared in a finally so a failure does
    // not leave every later call awaiting a promise that already rejected.
    if (!contractsInFlight) {
      contractsInFlight = fetchContracts(body, paginate)
        .then((rows) => {
          contractsMemo = { at: Date.now(), rows }
          writeStore(contractsMemo)
          return rows
        })
        .finally(() => { contractsInFlight = null })
    }
    return contractsInFlight
  }

  const cached = contractsMemo || readStore()
  if (cached?.rows?.length) {
    contractsMemo = cached
    if (Date.now() - cached.at < CONTRACTS_TTL_MS) return cached.rows
    // Stale: hand back what we have now, and let the refresh catch up behind it.
    // The rejection is swallowed on purpose — the caller already has usable
    // rows, and an unhandled rejection over a background refresh is noise.
    if (onFresh) load().then((rows) => onFresh(rows)).catch(() => {})
    return cached.rows
  }

  return load()
}
