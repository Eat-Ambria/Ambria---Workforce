// Supabase Edge Function: lms-proxy
// -----------------------------------------------------------------------------
// WHY THIS EXISTS: the Ambria app is a static PWA (GitHub Pages). Calling the
// LMS CRM at https://gyv.inqcrm.in directly from the browser is blocked by CORS.
// This function calls the LMS server-side and returns the JSON to the app, with
// permissive CORS headers so the browser is happy.
//
// The frontend calls it via:  supabase.functions.invoke('lms-proxy', {
//   body: { path: '/api/v1/processerp_api/get_venue_contract_information_list',
//           body: {}, paginate: true }
// })
//
// DEPLOY:  supabase functions deploy lms-proxy --no-verify-jwt
// (No secrets needed — the LMS auth is just loggeduserid in the body.)
// -----------------------------------------------------------------------------

const LMS_BASE = 'https://gyv.inqcrm.in'
const DEFAULT_LOGGED_USER = '1'

// ---------------------------------------------------------------------------
// PAGINATION — the thing that makes or breaks this integration
//
// `page_limit` is a PAGE NUMBER, not a row count. Send it once and you get a
// perfectly valid-looking 10-row response that is merely page 1; there is no
// `total`, `has_more` or `next` in the reply, so nothing tells you the rest
// exists. Increment it until a page comes back empty.
//
// Every filter key must be present even when blank — omitting them can make the
// API apply a default filter instead of treating them as unset.
//
// Pages are independent, so we fetch them in small concurrent batches and stop
// at the first batch that yields nothing new. ~700 contracts arrive in seconds.
// ---------------------------------------------------------------------------
const PAGE_BATCH = 8      // pages fetched concurrently
const PAGE_CEILING = 200  // runaway guard

// filter keys per endpoint — blank, but present
const VENUE_FILTERS = {
  fromdate: '', uptodated: '', search_venue_contract: '', priority_search: '',
  venue_datetype: '', source_search: '', venue_search: '', balance_pending: '',
  contract_venue_search: '', contract_assginee_search: '', leadtype_search: '',
  report_fac: '',
}
const DECOR_FILTERS = {
  entertain_search: '', source_search: '', lead_type_search: '',
  entertain_venue_search: '', priority_search: '', fromdate: '', uptodated: '',
  entertain_assginee_search: '', entertain_status_search: '', search_date_type: '',
  visited_search: '', follow_dated: '',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const rowsOf = (res: unknown): Record<string, unknown>[] => {
  if (!res || typeof res !== 'object') return []
  const obj = res as Record<string, unknown>
  const key = ['Contractinfo', 'contractinfo', 'leadinfo'].find((k) => Array.isArray(obj[k]))
  return key ? (obj[key] as Record<string, unknown>[]) : []
}

async function fetchPage(path: string, body: Record<string, unknown>, page: number) {
  try {
    const r = await fetch(LMS_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, page_limit: String(page) }),
    })
    if (!r.ok) return []
    return rowsOf(await r.json())
  } catch {
    return []   // one bad page must not sink the sweep
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // `fanout` is the old flag name — still accepted so an un-updated client keeps working
    const { path, body, paginate, fanout } = await req.json()

    // only allow the documented LMS API paths through this proxy
    if (typeof path !== 'string' || !path.startsWith('/api/')) {
      return json({ error: 'invalid or missing "path" (must start with /api/)' }, 400)
    }

    if (paginate || fanout) {
      const filters = path.includes('decor') || path.includes('entertain') ? DECOR_FILTERS : VENUE_FILTERS
      const base = { loggeduserid: DEFAULT_LOGGED_USER, ...filters, ...(body || {}) }
      const merged = new Map<string, Record<string, unknown>>()
      let page = 1
      let pages = 0

      while (page <= PAGE_CEILING) {
        const batch = Array.from({ length: PAGE_BATCH }, (_, i) => page + i)
        const results = await Promise.all(batch.map((p) => fetchPage(path, base, p)))
        const before = merged.size

        for (const rows of results) {
          for (const row of rows) {
            const rid = String(row?.id ?? `${row?.headid}-${row?.fiscd_entryno}`)
            if (!merged.has(rid)) merged.set(rid, row)
          }
        }
        pages += batch.length
        // stop when a whole batch adds nothing new — either empty pages, or the
        // API started repeating a page instead of returning []
        if (merged.size === before) break
        page += PAGE_BATCH
      }

      return json({
        Contractinfo: [...merged.values()],
        message: `merged ${merged.size} records from ${pages} pages`,
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
