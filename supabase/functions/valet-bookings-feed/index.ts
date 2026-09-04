// Supabase Edge Function: valet-bookings-feed
// -----------------------------------------------------------------------------
// WHY THIS EXISTS: the Valet tab's bookings are created here, in Ambria Admin,
// but the valet team works in a DIFFERENT Supabase project and needs to see the
// same screen. This is the read-only window that the other project calls. It
// returns two lists:
//
//   bookings  — rows from Ambria's `valet_bookings`
//   events    — confirmed venue events from the CRM (LMS) that have NO booking
//               yet, which is the list the Valet tab shows underneath
//
//   valet-admin browser ──> valet-admin's own function ──(x-feed-key)──> THIS
//                                                                         │
//                                                    valet_bookings <─────┤
//                                                    lms-proxy ──> CRM <──┘
//
// It deliberately does NOT hand the other project Ambria's anon key. Every table
// in this project carries a permissive "Allow all" RLS policy — the app gates on
// roles in the UI, not in the database — so that key is not a read key for valet
// bookings, it is full read/write on staff, tasks, attendance and everything
// else. A separate secret that unlocks exactly one read is the difference
// between sharing a window and sharing the front door.
//
// That is also why the answer to "make it live" is polling rather than Realtime:
// a cross-project Realtime subscription needs the anon key in the other
// project's browser, which is the thing being avoided.
//
// GUEST PHONE IS NOT RETURNED, on purpose. Ambria hides it from the valet role
// (canSeeGuestPhone in src/constants/org.js), and the audience on the other side
// of this feed is the valet team. Sending it here would route around a rule that
// already exists rather than honouring it. If the valet project ever genuinely
// needs it, that is a decision to make out loud — add 'phone' to BOOKING_COLS
// and the event mapping, and say why in this comment.
//
// SECRETS (Ambria Admin project → Edge Functions → Secrets):
//   VALET_FEED_KEY = <a long random string; share it with the valet project only>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// DEPLOY:  supabase functions deploy valet-bookings-feed --no-verify-jwt
//
// --no-verify-jwt is required, not a shortcut: with JWT verification on, the
// caller would need an Ambria key to get past the gateway, which defeats the
// point of the shared secret. The secret below IS the gate.
// -----------------------------------------------------------------------------

// Deno treats every file as a module; a TypeScript server pointed at this repo
// does not, and then reads this file and valet-analytics/index.ts as one global
// scope, where both declaring `CORS` is a redeclaration error. This marks the
// file as the module it already is, so the editor agrees with the runtime.
export {}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-feed-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: CORS })

// ---------------------------------------------------------------- venues
// Mirrors src/constants/org.js (PROPERTIES) and src/lib/lms.js (the venue id map
// and VENUE_COLORS), neither of which a Deno function can import. Colours ride
// along so the other project's calendar can shade a day the same way Ambria
// does instead of inventing its own five colours. Add a venue in ALL of those
// places, not just here.
const PROPERTIES: Record<string, { name: string; color: string; lmsVenueId: number | null }> = {
  pp: { name: 'Pushpanjali', color: '#2a78d6', lmsVenueId: 3 },
  ex: { name: 'Exotica', color: '#e87ba4', lmsVenueId: 19 },
  mk: { name: 'Manaktala', color: '#008300', lmsVenueId: 6 },
  rs: { name: 'Restro', color: '#eda100', lmsVenueId: 16 },
  // Janakpuri has no LMS venue id, so it never produces events — only bookings.
  jp: { name: 'Janakpuri', color: '#4a3aa7', lmsVenueId: null },
}

const PROP_BY_LMS_VENUE: Record<number, string> = Object.fromEntries(
  Object.entries(PROPERTIES)
    .filter(([, v]) => v.lmsVenueId != null)
    .map(([code, v]) => [v.lmsVenueId as number, code]),
)

// LMS function-type id -> readable name. Copied from src/lib/lms.js so the
// caller renders "Wedding" without having to carry this table too.
const FUNCTION_TYPES: Record<number, string> = {
  1: 'Ring Ceremony', 2: 'Birthday', 3: 'Wedding', 4: 'Reception', 5: 'Kua Poojan',
  6: 'Anniversary', 7: 'Lagan', 8: 'Sagan', 9: 'Cocktail', 10: 'Religious', 11: 'Corporate',
  12: 'Proposal Ceremony', 14: 'Haldi', 15: 'Mehendi', 16: 'Roka Ceremony', 17: 'Residential Wedding',
  18: 'Destination Wedding', 19: 'Kothi Booking', 20: 'Sangeet', 21: 'Baby Shower', 22: 'Engagement',
  23: 'Tender', 24: 'Barat Assembly', 25: 'House Party', 26: 'Lunch Function', 27: 'Breakfast Function',
  28: 'Dinner Function', 29: 'Breakfast', 30: 'Lunch', 31: 'Kitty Party', 32: 'Restaurant Sale',
  33: 'Lohri', 34: 'Diwali Party', 35: 'Get Together', 36: 'Mata Ki Chowki',
}
const fnType = (v: unknown) =>
  v == null || v === '' ? undefined : (FUNCTION_TYPES[Number(v)] || String(v))

// ---------------------------------------------------------------- helpers
// Length-independent compare. A plain === leaks how many leading characters
// matched through timing, which is a needless thing to hand an attacker when the
// fix is six lines.
function secretMatches(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

// first value whose key ENDS WITH one of the suffixes. The CRM prefixes its
// columns per table (fiscd_pax_no, fisc_guest_name), so suffix matching is what
// survives that. 0 is kept — a pax count of 0 is a value the CRM really sends.
function pick(obj: Record<string, unknown>, ...suffixes: string[]): unknown {
  const keys = Object.keys(obj || {})
  for (const suf of suffixes) {
    const k = keys.find((key) => key.toLowerCase().endsWith(suf.toLowerCase()))
    if (k != null && obj[k] !== '' && obj[k] != null) return obj[k]
  }
  return undefined
}

// The CRM wraps its rows under a different key per endpoint.
function asArray(res: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>
    for (const key of ['Contractinfo', 'contractinfo', 'leadinfo', 'data', 'result', 'list', 'records', 'rows']) {
      if (Array.isArray(o[key])) return o[key] as Array<Record<string, unknown>>
    }
    const arr = Object.values(o).find((v) => Array.isArray(v))
    if (arr) return arr as Array<Record<string, unknown>>
  }
  return []
}

// The CRM sends dates as YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY depending on the
// endpoint. Everything here compares ISO strings, so normalise once.
function lmsDateToIso(d: unknown): string {
  if (!d) return ''
  const s = String(d).trim().slice(0, 10)
  let m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return s
}

// "10:00", "10:00 AM", "7 PM" -> "10:00" / "19:00". Returns '' for free text
// like "7 PM onwards", which is why the slot key below falls back to the raw
// string rather than treating every unparseable time as the same slot.
function to24h(t: unknown): string {
  if (!t) return ''
  const s = String(t).trim()
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (m && parseInt(m[1], 10) <= 23) return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (m) {
    let h = parseInt(m[1], 10) % 12
    if (/p/i.test(m[3])) h += 12
    return `${String(h).padStart(2, '0')}:${m[2] || '00'}`
  }
  return ''
}

// ---------------------------------------------------------------- LMS cache
// The CRM sweep is slow, and that is the CRM's cost rather than ours: lms-proxy
// measured 14.3s and 15.2s on two consecutive full sweeps. The other project
// polls, so without a cache every poll pays that again.
//
// The cache is a table, NOT module memory. Module memory was tried first and did
// nothing measurable — three back-to-back requests took 13.8s, 15.1s and 16.0s,
// because module scope only survives inside one warm isolate and these requests
// did not share one. See SUPABASE-MIGRATION-LMS-FEED-CACHE.sql.
//
// What is stored is the NORMALISED events for every venue, unfiltered by date.
// Filtering per request is cheap; re-sweeping is not. Raw contracts would be
// 2.18 MB against 176 KB for the named fields, which is why src/lib/lms.js
// stopped carrying them too.
const LMS_TTL_MS = 10 * 60 * 1000
const CACHE_ID = 'contracts'

type LmsEvent = {
  id: unknown
  entry_no: unknown
  property: string | undefined
  event_date: string
  event_time: unknown
  customer_name: unknown
  function_type: string | undefined
  guests: unknown
  cancelled: boolean
}

function normEvents(rows: Array<Record<string, unknown>>): LmsEvent[] {
  return rows
    .map((row) => {
      const venueId = Number(pick(row, 'venue_id', 'venueid'))
      return {
        id: row.id ?? pick(row, 'entryno'),
        entry_no: pick(row, 'entryno'),
        property: PROP_BY_LMS_VENUE[venueId],
        event_date: lmsDateToIso(pick(row, 'function_date')),
        event_time: pick(row, 'function_timings', 'session'),
        customer_name: pick(row, 'guest_name', 'client_name'),
        function_type: fnType(pick(row, 'function_type')),
        guests: pick(row, 'pax_no', 'no_of_pax'),
        cancelled: !!pick(row, 'cancel_remarks'),
      }
    })
    // A venue we run valet for, and not cancelled. Both are permanent facts
    // about the row, so they are settled once here rather than on every read.
    .filter((e) => e.property && !e.cancelled)
}

const restHeaders = (service: string) => ({
  apikey: service,
  Authorization: `Bearer ${service}`,
  'Content-Type': 'application/json',
})

async function readCache(url: string, service: string) {
  const res = await fetch(
    `${url}/rest/v1/lms_feed_cache?select=rows,fetched_at&id=eq.${CACHE_ID}&limit=1`,
    { headers: restHeaders(service) },
  )
  if (!res.ok) return null   // table missing (migration not run) — treat as a miss
  const [row] = (await res.json()) as Array<{ rows: LmsEvent[]; fetched_at: string }>
  if (!row) return null
  return { events: row.rows ?? [], at: Date.parse(row.fetched_at) }
}

async function writeCache(url: string, service: string, events: LmsEvent[]) {
  // Failure here is deliberately swallowed: a cache that cannot be written is a
  // slow feed, not a broken one, and the events in hand are still correct.
  await fetch(`${url}/rest/v1/lms_feed_cache?on_conflict=id`, {
    method: 'POST',
    headers: { ...restHeaders(service), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: CACHE_ID, rows: events, row_count: events.length, fetched_at: new Date().toISOString() }),
  }).catch(() => {})
}

async function sweep(url: string, service: string) {
  const res = await fetch(`${url}/functions/v1/lms-proxy`, {
    method: 'POST',
    headers: restHeaders(service),
    body: JSON.stringify({
      path: '/api/v1/processerp_api/get_venue_contract_information_list',
      body: {},
      // The CRM's `page_limit` is a page NUMBER with no total in the response,
      // so without this the proxy stops at a perfectly valid-looking page one
      // and nothing says more exists.
      paginate: true,
    }),
  })
  if (!res.ok) throw new Error(`lms-proxy ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return normEvents(asArray(await res.json()))
}

/** Fresh events, or the best available with a note saying why. */
async function lmsEvents(url: string, service: string): Promise<{ events: LmsEvent[]; stale: string | null }> {
  const cached = await readCache(url, service).catch(() => null)
  if (cached && Date.now() - cached.at < LMS_TTL_MS) return { events: cached.events, stale: null }

  try {
    const events = await sweep(url, service)
    await writeCache(url, service, events)
    return { events, stale: null }
  } catch (e) {
    // A stale cache beats an empty list by a wide margin: the events barely
    // change hour to hour, and "nothing scheduled" is a far more misleading
    // thing to show than "this is a few hours old".
    if (cached) {
      const mins = Math.round((Date.now() - cached.at) / 60000)
      return { events: cached.events, stale: `CRM unreachable; showing cached events from ${mins} min ago. (${String((e as Error)?.message || e)})` }
    }
    throw e
  }
}

// ---------------------------------------------------------------- request
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SPAN_DAYS = 400

const BOOKING_COLS = [
  'id', 'property', 'event_date', 'event_time', 'customer_name',
  'guests', 'staff_total', 'staff_breakdown', 'heavy_date', 'notes', 'created_at',
  'valet_vendor_id',
]

/** Bare digits, and the last 10 of them. */
const phoneDigits = (v: unknown) => {
  const d = String(v ?? '').replace(/\D/g, '')
  // Vendor phones on file are typed by hand and inconsistent: "9818971578",
  // "+91 88604 58280", "86849 50936". Taking the last 10 drops a 91 or 091
  // country prefix without mangling a number that never had one, so both sides
  // of the join compare the same thing.
  return d.length > 10 ? d.slice(-10) : d
}

/**
 * Resolve assigned valet vendors to a name, a firm and a phone.
 *
 * Looked up here rather than stored on the booking, so a rename or a corrected
 * phone number in Ambria reaches the valet project instead of leaving a stale
 * copy behind.
 *
 * The PHONE is the join key. The valet project keeps its own logins, so an
 * Ambria vendor id means nothing there; the phone is the one identifier the same
 * person carries into both systems, and it is the number their credentials are
 * created with. This is supplier contact data, not guest data — the rule that
 * keeps guest phones out of this feed is about the people being served, not the
 * people doing the serving.
 */
async function resolveValetVendors(url: string, service: string, ids: number[]) {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))]
  if (!unique.length) return {} as Record<number, { name: unknown; company: unknown; phone: string }>
  const q = new URLSearchParams({
    select: 'id,name,company,phone',
    // Plain integers, so no quoting needed — unlike the TEXT user ids this
    // replaced, where an unquoted in.() read the dashes as list syntax.
    id: `in.(${unique.join(',')})`,
  })
  const res = await fetch(`${url}/rest/v1/vendors?${q}`, { headers: restHeaders(service) })
  if (!res.ok) return {}
  const rows = (await res.json()) as Array<{ id: number; name: unknown; company: unknown; phone: unknown }>
  return Object.fromEntries(
    rows.map((r) => [r.id, { name: r.name, company: r.company, phone: phoneDigits(r.phone) }]),
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const expected = Deno.env.get('VALET_FEED_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!expected || !url || !service) {
    return json({ ok: false, code: 'FEED_NOT_CONFIGURED', error: 'VALET_FEED_KEY is not set on the Ambria Admin project.' }, 503)
  }

  const given = req.headers.get('x-feed-key') ?? ''
  if (!given || !secretMatches(given, expected)) {
    // No detail on purpose — "wrong key" and "no key" answer the same.
    return json({ ok: false, code: 'FORBIDDEN', error: 'Missing or invalid x-feed-key.' }, 403)
  }

  let p: URLSearchParams
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    p = new URLSearchParams(
      Object.entries(body ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    )
  } else {
    p = new URL(req.url).searchParams
  }

  const from = p.get('from') ?? ''
  const to = p.get('to') ?? ''
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return json({ ok: false, code: 'BAD_RANGE', error: 'from and to are required, as YYYY-MM-DD.' }, 400)
  }
  if (from > to) {
    return json({ ok: false, code: 'BAD_RANGE', error: 'from is after to.' }, 400)
  }
  const span = (Date.parse(to) - Date.parse(from)) / 86400000
  if (span > MAX_SPAN_DAYS) {
    return json({ ok: false, code: 'RANGE_TOO_WIDE', error: `Range is ${Math.round(span)} days; the cap is ${MAX_SPAN_DAYS}.` }, 400)
  }

  const property = p.get('property') ?? ''
  if (property && !PROPERTIES[property]) {
    return json({ ok: false, code: 'NO_SUCH_PROPERTY', error: `Unknown property "${property}". Expected one of ${Object.keys(PROPERTIES).join(', ')}.` }, 400)
  }

  // Events cost an upstream sweep on a cold cache, so a caller that only wants
  // bookings can say so and skip it.
  const wantEvents = (p.get('events') ?? 'true') !== 'false'

  // ------------------------------------------------------------ bookings
  const q = new URLSearchParams({
    select: BOOKING_COLS.join(','),
    event_date: `gte.${from}`,
    // event_time is TEXT ("7 PM onwards"), so this second key sorts
    // lexicographically, not chronologically. It is here to keep two rows on
    // the same date in a stable order, nothing more.
    order: 'event_date.asc,event_time.asc',
  })
  q.append('event_date', `lte.${to}`)
  if (property) q.set('property', `eq.${property}`)

  let res: Response
  try {
    res = await fetch(`${url}/rest/v1/valet_bookings?${q}`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    })
  } catch (e) {
    return json({ ok: false, code: 'UNREACHABLE', error: String((e as Error)?.message || e) }, 502)
  }
  const text = await res.text()
  if (!res.ok) return json({ ok: false, code: 'QUERY_FAILED', error: text }, 502)

  const rows = JSON.parse(text) as Array<Record<string, unknown>>

  // A failure here leaves the names off rather than failing the request: the
  // booking itself is still correct and useful without them.
  const vendors = await resolveValetVendors(url, service, rows.map((r) => Number(r.valet_vendor_id))).catch(() => ({}))

  const bookings = rows.map((r) => {
    const who = vendors[Number(r.valet_vendor_id)]
    return {
      ...r,
      property_name: PROPERTIES[String(r.property)]?.name ?? String(r.property),
      // null, not undefined, when nobody is assigned or the id no longer matches
      // anybody — an absent key and an explicit null read differently on the
      // other side, and "nobody" is a fact worth stating.
      valet_name: who?.name ?? null,
      valet_company: who?.company ?? null,
      // Already reduced to bare digits, so the other side can compare it to its
      // own user's number without repeating the normalisation and getting it
      // subtly different.
      valet_phone: who?.phone || null,
    }
  })

  // ------------------------------------------------------------ events
  // Reported rather than thrown: the CRM being down should not blank out the
  // bookings, which come from our own database and are fine. The caller can
  // render the bookings and show a quiet note where the events would be.
  let events: Array<Record<string, unknown>> = []
  let eventsError: string | null = null

  if (wantEvents) {
    try {
      const { events: all, stale } = await lmsEvents(url, service)
      eventsError = stale

      // The same slot key both sides can produce. to24h() so "10:00" and
      // "10:00 AM" are one slot however either side wrote it; the date is in the
      // key because Ambria only ever compares within a single day.
      //
      // Venue is deliberately NOT in the key: a booking made against the wrong
      // venue should still mark its event as handled, which is what Ambria does
      // and how a real double-booking got noticed rather than hidden.
      const slot = (date: unknown, name: unknown, time: unknown) =>
        `${lmsDateToIso(date)}|${String(name ?? '').trim().toLowerCase()}|${to24h(time) || String(time ?? '').trim()}`

      // Built from ALL bookings in range, not the filtered set, so asking for one
      // property does not resurrect an event another property already booked.
      const taken = new Set(rows.map((b) => slot(b.event_date, b.customer_name, b.event_time)))

      events = all
        .filter((e) => e.event_date >= from && e.event_date <= to)
        .filter((e) => !property || e.property === property)
        .filter((e) => !taken.has(slot(e.event_date, e.customer_name, e.event_time)))
        // `cancelled` was settled during normalisation and is internal; the
        // property name is added here so the cached rows stay as small as the
        // measurement in the migration promised.
        .map(({ cancelled: _cancelled, ...e }) => ({
          ...e,
          property_name: e.property ? PROPERTIES[e.property].name : undefined,
        }))
        .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
    } catch (e) {
      eventsError = String((e as Error)?.message || e)
    }
  }

  return json({
    ok: true,
    from,
    to,
    // The venue table, so the caller never hardcodes a name or a calendar colour.
    properties: Object.entries(PROPERTIES).map(([code, v]) => ({ code, name: v.name, color: v.color })),
    count: bookings.length,
    bookings,
    events_count: events.length,
    events,
    // null when events were fetched fine, a string when the CRM leg failed, and
    // absent when the caller asked not to fetch them at all.
    ...(wantEvents ? { events_error: eventsError } : {}),
  })
})