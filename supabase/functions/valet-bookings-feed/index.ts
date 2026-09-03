// Supabase Edge Function: valet-bookings-feed
// -----------------------------------------------------------------------------
// WHY THIS EXISTS: the Valet tab's bookings are created here, in Ambria Admin,
// but the valet team works in a DIFFERENT Supabase project and needs to see
// them. This is the read-only window into `valet_bookings` that the other
// project calls.
//
//   valet-admin browser ──> valet-admin's own function ──(x-feed-key)──> THIS ──> valet_bookings
//
// It deliberately does NOT hand the other project Ambria's anon key. Every table
// in this project carries a permissive "Allow all" RLS policy — the app gates on
// roles in the UI, not in the database — so that key is not a read key for valet
// bookings, it is full read/write on staff, tasks, attendance and everything
// else. A separate secret that unlocks exactly one read is the difference
// between sharing a window and sharing the front door.
//
// That is also why the answer to "make it live" here is polling rather than
// Realtime: a cross-project Realtime subscription needs the anon key in the
// other project's browser, which is the thing being avoided. The bookings
// change a few times a day, so a poll on the visible tab is no worse.
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

// Property names live in src/constants/org.js, which a Deno function cannot
// import. Repeated here so the caller never has to hardcode the mapping — one
// copy on a server beats a copy in every client. Add a venue in BOTH places.
const PROPERTY_NAMES: Record<string, string> = {
  pp: 'Pushpanjali',
  ex: 'Exotica',
  mk: 'Manaktala',
  rs: 'Restro',
  jp: 'Janakpuri',
}

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SPAN_DAYS = 400

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

  // POST body or query string, so neither calling style is a surprise.
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
  if (property && !PROPERTY_NAMES[property]) {
    return json({ ok: false, code: 'NO_SUCH_PROPERTY', error: `Unknown property "${property}". Expected one of ${Object.keys(PROPERTY_NAMES).join(', ')}.` }, 400)
  }

  // Columns listed rather than select=* — a column added here later should not
  // start flowing to another project because nobody re-read this line.
  const cols = [
    'id', 'property', 'event_date', 'event_time', 'customer_name', 'phone',
    'guests', 'staff_total', 'staff_breakdown', 'heavy_date', 'notes', 'created_at',
  ].join(',')

  const q = new URLSearchParams({
    select: cols,
    event_date: `gte.${from}`,
    // event_time is TEXT ("7 PM onwards"), so this second key sorts
    // lexicographically, not chronologically. It is here to keep two rows on the
    // same date in a stable order, nothing more.
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
  if (!res.ok) {
    return json({ ok: false, code: 'QUERY_FAILED', error: text }, 502)
  }

  const rows = JSON.parse(text) as Array<Record<string, unknown>>

  return json({
    ok: true,
    from,
    to,
    count: rows.length,
    // Resolved server-side so the caller renders a name it did not have to know.
    bookings: rows.map((r) => ({
      ...r,
      property_name: PROPERTY_NAMES[String(r.property)] ?? String(r.property),
    })),
  })
})