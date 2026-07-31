// Supabase Edge Function: lms-proxy
// -----------------------------------------------------------------------------
// WHY THIS EXISTS: the Ambria app is a static PWA (GitHub Pages). Calling the
// LMS CRM at https://gyv.inqcrm.in directly from the browser is blocked by CORS.
// This function calls the LMS server-side and returns the JSON to the app, with
// permissive CORS headers so the browser is happy.
//
// The frontend calls it via:  supabase.functions.invoke('lms-proxy', {
//   body: { path: '/api/v1/processerp_api/get_venue_information_list', body: {} }
// })
// It forwards `body` to `${LMS_BASE}${path}` as JSON, injecting loggeduserid.
//
// DEPLOY:  supabase functions deploy lms-proxy --no-verify-jwt
// (No secrets needed — the LMS auth is just loggeduserid in the body.)
// -----------------------------------------------------------------------------

const LMS_BASE = 'https://gyv.inqcrm.in'
const DEFAULT_LOGGED_USER = '1'

// ---------------------------------------------------------------------------
// WHY THE FAN-OUT MODE EXISTS
//
// get_venue_contract_information_list returns AT MOST 10 contracts and ignores
// every filter or paging parameter (verified against ~34 of them: from_date,
// page, limit, offset, venue_id, entryno, ...). What it does honour is
// `loggeduserid`: each CRM user gets THEIR OWN 10 most recent contracts.
//
// So the only way to see the whole diary is to ask as every user and merge the
// answers. Sweeping ids 1..75 (nothing above 72 has data) turns 10 contracts
// into ~85, and is what makes near-term months — August included — appear at
// all. Doing it here rather than in the browser keeps it to ONE request from
// the app instead of 75.
// ---------------------------------------------------------------------------
const FANOUT_MAX_USER = 75
const FANOUT_BATCH = 10   // concurrent upstream calls

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { path, body, fanout } = await req.json()

    // only allow the documented LMS API paths through this proxy
    if (typeof path !== 'string' || !path.startsWith('/api/')) {
      return json({ error: 'invalid or missing "path" (must start with /api/)' }, 400)
    }

    // fan-out mode: ask as every CRM user and merge, de-duplicated by row id
    if (fanout) {
      const merged = new Map<string, Record<string, unknown>>()
      let envelopeKey = 'Contractinfo'
      let reached = 0

      for (let start = 1; start <= FANOUT_MAX_USER; start += FANOUT_BATCH) {
        const ids: number[] = []
        for (let u = start; u < start + FANOUT_BATCH && u <= FANOUT_MAX_USER; u++) ids.push(u)

        const results = await Promise.all(ids.map(async (uid) => {
          try {
            const r = await fetch(LMS_BASE + path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ ...(body || {}), loggeduserid: String(uid) }),
            })
            if (!r.ok) return null
            return await r.json()
          } catch {
            return null   // one unhappy user must not sink the whole sweep
          }
        }))

        for (const res of results) {
          if (!res || typeof res !== 'object') continue
          reached++
          const obj = res as Record<string, unknown>
          const key = ['Contractinfo', 'contractinfo', 'leadinfo'].find((k) => Array.isArray(obj[k]))
          if (!key) continue
          envelopeKey = key
          for (const row of obj[key] as Record<string, unknown>[]) {
            // `id` is the contract-detail row id and is unique per event
            const rid = String(row?.id ?? `${row?.headid}-${row?.fiscd_entryno}`)
            if (!merged.has(rid)) merged.set(rid, row)
          }
        }
      }

      return json({
        [envelopeKey]: [...merged.values()],
        message: `merged ${merged.size} records from ${reached} user views`,
        status: true,
      })
    }

    const payload = { loggeduserid: DEFAULT_LOGGED_USER, ...(body || {}) }
    const r = await fetch(LMS_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })

    // pass the LMS response through verbatim (text so we don't choke on non-JSON)
    const text = await r.text()
    return new Response(text, {
      status: r.status,
      headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/json' },
    })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
