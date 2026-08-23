// Read-only analytics from the Valet Parking system.
//
// Valet is a SEPARATE Supabase project with its own database and its own users,
// so none of this can be a normal supabase.from() query — an Ambria Admin token
// means nothing there. Every call goes through our `valet-analytics` edge
// function, which holds the API key and forwards to the valet report API.
// See supabase/functions/valet-analytics/index.ts and VALET_REPORT_API.md.
//
// The key must never reach a browser, so there is deliberately no URL and no
// header in this file to accidentally hardcode one into.

import { supabase } from './supabase'

// Setup problems, as opposed to "it broke". A spinner-and-retry on these just
// hides the thing somebody has to go and fix, so the page says so instead.
export const SETUP_CODES = new Set([
  'NOT_CONFIGURED',       // the valet team has not set REPORT_API_KEY
  'NOT_MIGRATED',         // the valet team has not run migration 0037
  'PROXY_NOT_CONFIGURED', // our own secrets are missing
  'UPSTREAM_NOT_FOUND',   // VALET_REPORT_URL names a function that is not there
  'UNAUTHORISED',         // the key does not match the valet side
])

export class ValetReportError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ValetReportError'
    this.code = code || 'ERROR'
    this.isSetup = SETUP_CODES.has(this.code)
  }
}

// supabase-js turns any non-2xx into a FunctionsHttpError whose message is just
// "Edge Function returned a non-2xx status code" — the body, which carries the
// code that says WHICH problem it is, is on error.context. Without this every
// distinguishable failure arrives as the same sentence.
async function bodyOf(error) {
  try {
    return await error?.context?.json?.()
  } catch {
    return null
  }
}

export async function valetReport(report, params = {}) {
  const body = { report }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') body[k] = v
  }

  const { data, error } = await supabase.functions.invoke('valet-analytics', { body })

  if (error) {
    const payload = await bodyOf(error)
    throw new ValetReportError(
      // `error` is the valet API's field; `message` is what Supabase's own
      // gateway uses, and one of the two is always the readable sentence.
      payload?.error || payload?.message || error.message || 'Could not reach the valet system.',
      payload?.code,
    )
  }
  if (!data?.ok) throw new ValetReportError(data?.error || 'Could not load the figures.', data?.code)
  return data
}

// The export refuses above this rather than building a file from forty
// sequential queries while somebody watches a spinner. The valet app caps its
// own export at the same number.
export const EXPORT_CAP = 5000

// One call per 1000 rows, until `total` is reached. A single call returns a
// PARTIAL export that looks complete, which is the whole reason this exists.
export async function allValetRecords(params, onProgress) {
  const rows = []
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const page = await valetReport('records', { ...params, limit: 1000, offset })
    total = page.total ?? 0

    if (total > EXPORT_CAP) {
      const e = new ValetReportError(`${total} rows — narrow the dates.`, 'TOO_MANY')
      e.total = total
      throw e
    }
    // A `total` that is briefly higher than the rows available — a car deleted
    // mid-export — would otherwise spin forever.
    if (!page.records?.length) break

    rows.push(...page.records)
    // += records.length, NOT += 1000. If a page ever comes back short, a flat
    // 1000 skips rows and nobody notices: the file is just quietly missing cars.
    offset += page.records.length
    onProgress?.(rows.length, total)
  }
  return rows
}
