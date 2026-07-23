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

// call the LMS via the edge-function proxy
async function lmsCall(path, body = {}) {
  const { data, error } = await supabase.functions.invoke('lms-proxy', { body: { path, body } })
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
    raw: row,
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
    raw: row,
  }
}

// venue enquiries (leads) — available but rarely have a firm date/venue.
export async function lmsVenueEvents(body = {}) {
  const res = await lmsCall('/api/v1/processerp_api/get_venue_information_list', body)
  return asArray(res).map(normEvent).filter((e) => !e.cancelled)
}

// venue contracts — CONFIRMED events with venue/date/time/pax/amount.
export async function lmsVenueContracts(body = {}) {
  const res = await lmsCall('/api/v1/processerp_api/get_venue_contract_information_list', body)
  return asArray(res).map(normContract).filter((c) => !c.cancelled)
}
