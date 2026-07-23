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
    const { path, body } = await req.json()

    // only allow the documented LMS API paths through this proxy
    if (typeof path !== 'string' || !path.startsWith('/api/')) {
      return json({ error: 'invalid or missing "path" (must start with /api/)' }, 400)
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
