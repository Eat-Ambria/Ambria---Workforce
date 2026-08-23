// Supabase Edge Function: valet-analytics
// -----------------------------------------------------------------------------
// WHY THIS EXISTS: the valet parking system lives in a DIFFERENT Supabase
// project. Its report API is guarded by an API key that reads every property's
// figures, and anything in a Vite bundle is public — `view-source` is enough.
// So the key lives here, as a secret, and the browser never sees it.
//
// The valet API also sends NO CORS headers and answers OPTIONS with 405, on
// purpose: a direct fetch() from the app physically cannot work, so the wrong
// integration breaks loudly instead of shipping a leaked key quietly.
//
//   browser ──(anon key)──> this function ──(X-API-Key)──> valet_report ──> valet DB
//
// SECRETS (Ambria Admin project → Edge Functions → Secrets):
//   VALET_REPORT_URL = https://vyirixtdgheypbpffsct.supabase.co/functions/v1/valet_report
//   VALET_REPORT_KEY = <the key from the valet team>
// Note the upstream function name is valet_report with an UNDERSCORE.
//
// DEPLOY:  supabase functions deploy valet-analytics --no-verify-jwt
//
// ── About --no-verify-jwt, which the handover spec does NOT assume ────────────
// The spec's version of this function calls supabase.auth.getUser() and 401s
// when there is no user. That cannot work here: Ambria Admin does not use
// Supabase Auth. It authenticates against its own `users` table, so there is no
// Supabase session and getUser() would return null for EVERY caller — the page
// would 401 for admins and employees alike.
//
// So the gate is the same one the rest of this app uses: the Valet page is only
// reachable by an admin, and the Analytics tab checks the role before it calls.
// That is a UI-level gate, and it is worth saying plainly rather than implying
// otherwise — anyone who can read the bundle can read the anon key and call this
// endpoint directly. It exposes read-only aggregate valet figures, nothing
// writable, and it is the same posture as lms-proxy, which fronts the CRM.
//
// If that is not good enough later, the fix is a shared secret this app's
// backend can check — not re-adding the getUser() call, which would just fail.
// -----------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

// Only the documented reports. Without this the `report` parameter is a path
// segment the caller chooses, and a stray '../' would reach for whatever else
// sits under that origin.
const REPORTS = new Set(['properties', 'summary', 'operators', 'by-property', 'records'])

// The upstream parameters. Anything else is dropped rather than forwarded — a
// typo'd key reaching the valet side comes back as a 400 that reads like our bug.
const PARAMS = ['from', 'to', 'property_id', 'limit', 'offset', 'query']

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: CORS })

Deno.serve(async (req) => {
  // Our own frontend IS a browser, so this half does need CORS — unlike the
  // valet API this forwards to.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const base = Deno.env.get('VALET_REPORT_URL')
  const key = Deno.env.get('VALET_REPORT_KEY')
  if (!base || !key) {
    // Named separately from the valet side's own NOT_CONFIGURED so the message
    // points at the project that actually needs the secret set.
    return json({ ok: false, code: 'PROXY_NOT_CONFIGURED', error: 'VALET_REPORT_URL / VALET_REPORT_KEY are not set on this project.' }, 503)
  }

  // supabase.functions.invoke() sends a POST by default and only reaches GET
  // when asked. Both are accepted here so a caller that forgets is not left
  // debugging a 405 from two hops away; the request upstream is always a GET.
  let incoming: URLSearchParams
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    incoming = new URLSearchParams(
      Object.entries(body ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    )
  } else {
    incoming = new URL(req.url).searchParams
  }

  const report = incoming.get('report') ?? 'summary'
  if (!REPORTS.has(report)) {
    return json({ ok: false, code: 'NO_SUCH_REPORT', error: `Unknown report "${report}".` }, 404)
  }

  const params = new URLSearchParams()
  for (const k of PARAMS) {
    const v = incoming.get(k)
    if (v != null && v !== '') params.set(k, v)
  }

  let upstream: Response
  try {
    upstream = await fetch(`${base}/${report}?${params}`, { headers: { 'X-API-Key': key } })
  } catch (e) {
    return json({ ok: false, code: 'UNREACHABLE', error: String((e as Error)?.message || e) }, 502)
  }

  const text = await upstream.text()

  // The valet API answers {ok, code, error}. Supabase's OWN gateway answers
  // {code: 'NOT_FOUND', message} when the function name in VALET_REPORT_URL does
  // not exist on that project — a different shape, with no `ok` and no `error`,
  // so it would reach the page as a blank 404 that reads like "unknown report".
  //
  // This is not hypothetical: the handover doc says the upstream function is
  // named `valet_report` with an underscore, and the deployed one is
  // `valet-report` with a HYPHEN. Whoever sets that secret from the doc gets
  // exactly this, and it is worth naming rather than guessing at.
  if (upstream.status === 404) {
    try {
      const parsed = JSON.parse(text)
      if (parsed?.ok === undefined && parsed?.code === 'NOT_FOUND') {
        return json({
          ok: false,
          code: 'UPSTREAM_NOT_FOUND',
          error: `VALET_REPORT_URL points at a function that does not exist (${base}). The deployed name is valet-report, with a hyphen.`,
        }, 503)
      }
    } catch {
      // not JSON — fall through and pass the body along untouched
    }
  }

  // Otherwise passed through as-is, status included, so a 503 NOT_MIGRATED stays
  // a 503 and does not get flattened into a generic failure nobody can diagnose.
  return new Response(text, { status: upstream.status, headers: CORS })
})
