// Valet analytics — cars, waits, peak hours, per-operator workload.
//
// The figures come from the VALET PARKING system, which is a different Supabase
// project with its own database and its own users. Nothing here is a supabase
// query; every number arrives through the valet-analytics edge function, which
// holds the API key. See src/lib/valetReport.js and VALET_REPORT_API.md.
//
// Two things about the valet side that shape this page and are easy to get
// wrong from the outside:
//
//   * Dates are SERVICE days, not calendar days, and a service day starts at
//     05:30 IST. A car checked in at 01:00 on Saturday belongs to Friday. The
//     whole valet system agrees on that, so nothing here re-buckets by
//     timestamp.
//   * The waits are MEDIANS, and they are null — not zero — when nothing
//     completed. A zero would read as instant service, which is the opposite of
//     "we have no idea".

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useColors } from '../../context/ThemeContext'
import { useLang } from '../../context/LangContext'
import { Card, Button, Loader, EmptyState } from '../../components/common/UI'
import Icon from '../../components/common/Icon'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { valetReport, allValetRecords, EXPORT_CAP } from '../../lib/valetReport'
import { downloadCsv } from '../../lib/csv'
import { openPrintable, esc } from '../../lib/printable'
import {
  useValetScope, useMyVenues, PeriodBar, VenuePicker, ValetError, fmtDay, rangeLabel,
  useAutoRefresh, LiveStamp,
} from './valetScope'

/* ------------------------------------------------------------- formatting -- */

// A median of null is "nothing completed", which is not the same as zero and
// must never be drawn as one.
const mins = (v, hi) => (v == null ? '—' : `${Number(v).toFixed(1)} ${hi ? 'मिनट' : 'min'}`)
const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'))

/* ------------------------------------------------------------------ page --- */

export default function ValetAnalytics({ visibleProps, scopeAll }) {
  const C = useColors()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const wide = useMediaQuery('(min-width: 1000px)')

  const scope = useValetScope()
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
    propId, setPropId, props, range } = scope
  const { myProps, nameOf } = useMyVenues({ props, scopeAll, visibleProps, propId, setPropId })

  const [data, setData] = useState(null)     // { summary, operators, byProperty }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)       // ValetReportError
  const [busy, setBusy] = useState('')       // '' | 'csv' | 'pdf'
  const [note, setNote] = useState('')
  const [at, setAt] = useState(null)         // when the figures on screen were read
  const [staleErr, setStaleErr] = useState(null)

  /* --- the figures -------------------------------------------------------- */
  // `quiet` is the auto-refresh: same request, but it must not raise the loading
  // flag. At a five-second interval a full-page spinner would have the screen
  // blank more often than it is readable.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setErr(null) }
    try {
      const scope = { from: range.from, to: range.to, ...(propId ? { property_id: propId } : {}) }

      // These two ARE the page. If either fails there is nothing to draw.
      const [s, o] = await Promise.all([
        valetReport('summary', scope),
        valetReport('operators', scope),
      ])

      // The venue comparison is an extra panel, so it fails on its own rather
      // than taking the page down with it — which is exactly what happened when
      // all three shared one Promise.all: the valet side has not shipped this
      // one report's RPC yet, and every figure on the page vanished behind its
      // error. Asked for only when no venue is picked, since comparing one
      // venue with itself is what the summary is for.
      let byProperty = []
      if (!propId) {
        byProperty = await valetReport('by-property', { from: range.from, to: range.to })
          .then((r) => r.properties || [])
          .catch(() => [])
      }

      setData({ summary: s.summary || null, operators: o.operators || [], byProperty })
      setAt(new Date())
      setErr(null)
      setStaleErr(null)
    } catch (e) {
      // A background tick that fails keeps the last good figures on screen and
      // says so. Replacing a working page with an error card every few seconds
      // because one round trip timed out would be worse than the staleness.
      if (quiet) setStaleErr(e)
      else { setErr(e); setData(null) }
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [range.from, range.to, propId])

  useEffect(() => { load() }, [load])
  useAutoRefresh(() => load({ quiet: true }))

  const summary = data?.summary
  // Read the window back from the RESPONSE. A span over 730 days is clamped
  // rather than refused, and nothing announces it except this — echoing what we
  // sent would put a date on the report that no figure in it covers.
  const shown = summary ? { from: summary.from, to: summary.to } : range
  const periodLabel = rangeLabel(shown.from, shown.to, hi)
  const scopeLabel = propId ? nameOf(propId) : (hi ? 'सभी प्रॉपर्टी' : 'All properties')

  const clamped = summary && summary.from !== range.from

  /* --- exports ------------------------------------------------------------ */

  // THREE columns: who came, what they drove, how to reach them. The same three
  // the valet app's own export has, so the two files match. Everything else the
  // screen shows — date, venue, car number, who parked it — stays on the screen:
  // the table is for verifying a visit, the file is for taking a guest list away.
  //
  // 'Number' MUST STAY LAST. CSV cannot carry a column width, so Excel opens
  // every column at its default 8.43 characters and a ten-digit phone does not
  // fit — but Excel DOES spill text past a cell's edge when the cells to its
  // right are empty. As the last column the phone shows in full. Add a fourth
  // and it silently starts clipping again.
  const COLUMNS = useMemo(() => [
    { key: 'name', label: hi ? 'मेहमान का नाम' : 'Guest name' },
    { key: 'tier', label: hi ? 'गाड़ी की श्रेणी' : 'Car tier' },
    // text: true, or Excel renders 6576543210 as 6.576E+09. See lib/csv.js.
    { key: 'phone', label: hi ? 'नंबर' : 'Number', text: true },
  ], [hi])

  async function exportCsv() {
    setBusy('csv')
    setNote('')
    try {
      const rows = await allValetRecords({
        from: shown.from, to: shown.to, ...(propId ? { property_id: propId } : {}),
      }, (got, total) => setNote(hi ? `${got} / ${total} पंक्तियाँ…` : `${got} / ${total} rows…`))

      if (!rows.length) {
        setNote(hi ? 'इन तारीख़ों में कोई गाड़ी नहीं।' : 'No cars in those dates.')
        return
      }
      // One row per CAR, not per guest — /records returns vehicles, so somebody
      // who came twice in the range is two rows. Deliberately not deduped: this
      // matches the valet app's own export, which is the point of the file.
      downloadCsv(
        `valet-guests-${shown.to}.csv`,
        COLUMNS,
        rows.map((r) => ({
          name: r.guest_name ?? '',
          tier: r.car_tier ?? '',
          phone: r.guest_phone ?? '',
        })),
      )
      setNote(hi ? `${rows.length} पंक्तियाँ डाउनलोड हुईं` : `${rows.length} rows downloaded`)
    } catch (e) {
      setNote(e?.code === 'TOO_MANY'
        ? (hi ? `${e.total} पंक्तियाँ — इतनी एक फ़ाइल में नहीं (सीमा ${EXPORT_CAP})। तारीख़ें छोटी करें।`
              : `${e.total} rows is over the ${EXPORT_CAP} limit — narrow the dates.`)
        : (e?.message || (hi ? 'डाउनलोड नहीं हो पाया।' : 'The download failed.')))
    } finally {
      setBusy('')
    }
  }

  function exportPdf() {
    if (!summary) return
    setBusy('pdf')
    const ok = printValetReport({
      hi, summary, operators: data.operators, byProperty: data.byProperty, periodLabel, scopeLabel,
    })
    if (!ok) {
      setNote(hi ? 'प्रिंट विंडो ब्लॉक हो गई — पॉप-अप की अनुमति दें।'
                 : 'The print window was blocked — allow pop-ups for this site.')
    }
    setBusy('')
  }

  /* --- render ------------------------------------------------------------- */


  // A scoped admin whose venue valet does not run at all. Better said plainly
  // than left as an empty page that looks broken.
  if (props && !scopeAll && !myProps.length) {
    return (
      <EmptyState
        icon={null}
        title={hi ? 'इस जगह पर वैले का डेटा नहीं है' : 'Valet has no figures for your venue'}
      />
    )
  }

  return (
    <div>
      <PeriodBar
        C={C} hi={hi}
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
      />

      {/* venue + the two downloads ----------------------------------------- */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <VenuePicker C={C} hi={hi} props={props} myProps={myProps} scopeAll={scopeAll} propId={propId} setPropId={setPropId} />

        <span style={{ flex: 1 }} />

        <Button variant="ghost" disabled={!summary || !!busy} onClick={exportPdf} style={{ padding: '8px 13px', fontSize: 13 }}>
          <Icon name="download" size={15} color={C.tl} style={{ marginRight: 5 }} />
          {hi ? 'प्रिंट / PDF' : 'Print / PDF'}
        </Button>
        {/* The guest list behind the figures. A file rather than a printout
            because this one gets sorted and filtered, not read. */}
        <Button variant="ghost" disabled={!summary || !!busy} onClick={exportCsv} style={{ padding: '8px 13px', fontSize: 13 }}>
          <Icon name="download" size={15} color={C.tl} style={{ marginRight: 5 }} />
          {busy === 'csv' ? (hi ? 'बन रहा है…' : 'Preparing…') : (hi ? 'गेस्ट लिस्ट (CSV)' : 'Guest list (CSV)')}
        </Button>
      </div>

      {note && (
        <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 12, textAlign: 'right' }}>{note}</div>
      )}

      <LiveStamp C={C} hi={hi} at={at} failed={staleErr} />

      {/* A range over 730 days is clamped, not refused, and only the response
          says so. Silently reporting on a window nobody asked for is worse than
          a line of text. */}
      {clamped && (
        <div style={{
          fontSize: 12.5, color: C.tl, background: C.yBg, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '8px 12px', marginBottom: 12,
        }}>
          {hi ? `वैले सिर्फ़ पिछले 730 दिन रखता है — ${fmtDay(shown.from, hi)} से दिखाया जा रहा है।`
              : `Valet keeps 730 days — showing from ${fmtDay(shown.from, hi)} instead.`}
        </div>
      )}

      {loading ? <Loader /> : err ? (
        <Card><ValetError C={C} hi={hi} err={err} /></Card>
      ) : !summary ? (
        <EmptyState icon={null} title={hi ? 'कोई आँकड़ा नहीं' : 'No figures'} />
      ) : (
        <>
          <Kpis C={C} hi={hi} s={summary} />

          <div style={{
            display: 'grid', gap: 14, alignItems: 'start', marginTop: 18,
            gridTemplateColumns: wide ? 'minmax(0, 7fr) minmax(0, 5fr)' : '1fr',
          }}>
            <Panel C={C} title={hi ? 'दिन-ब-दिन गाड़ियाँ' : 'Cars per day'}>
              <DayBars C={C} hi={hi} rows={summary.per_day || []} />
            </Panel>
            <Panel
              C={C}
              title={hi ? 'किस घंटे भीड़' : 'Busiest hours'}
              note={hi ? 'गाड़ी आने का समय (IST)' : 'By arrival hour, IST'}
            >
              <HourBars C={C} hi={hi} rows={summary.per_hour || []} />
            </Panel>
          </div>

          <Panel
            C={C}
            title={hi ? 'हर कर्मचारी का काम' : 'Work per operator'}
            count={data.operators.length}
            style={{ marginTop: 18 }}
          >
            <Operators C={C} hi={hi} rows={data.operators} />
          </Panel>

          {!propId && data.byProperty.length > 1 && (
            <Panel C={C} title={hi ? 'प्रॉपर्टी की तुलना' : 'Venue by venue'} style={{ marginTop: 18 }}>
              <ByProperty C={C} hi={hi} rows={data.byProperty} />
            </Panel>
          )}

          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 16, lineHeight: 1.6 }}>
            {hi
              ? 'दिन 05:30 बजे से गिना जाता है — रात 1 बजे आई गाड़ी पिछले दिन की मानी जाती है। इंतज़ार का समय माध्य (median) है, और गिनती उसके साथ लिखी है।'
              : 'A service day starts at 05:30 — a car that arrives at 01:00 belongs to the night before. Waits are medians, shown with the count they are drawn from.'}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ parts -- */

function Panel({ C, title, note, count, children, style }) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 9, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{title}</h3>
        {count != null && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: C.tl, background: C.cardAlt,
            border: `1px solid ${C.border}`, borderRadius: 999, padding: '1px 9px',
          }}>
            {count}
          </span>
        )}
        {note && <span style={{ fontSize: 11.5, color: C.faint }}>{note}</span>}
      </div>
      <Card>{children}</Card>
    </div>
  )
}

function Kpis({ C, hi, s }) {
  // `days` is inclusive of both ends — a single day is 1, not 0 — so this never
  // divides by zero and never doubles a one-day figure.
  const perDay = s.days ? (s.cars / s.days) : null
  const tiers = Object.entries(s.tiers || {}).sort((a, b) => b[1] - a[1])

  const cells = [
    {
      label: hi ? 'गाड़ियाँ' : 'Cars',
      value: num(s.cars),
      sub: perDay == null ? '' : (hi ? `${perDay.toFixed(1)} / दिन` : `${perDay.toFixed(1)} a day`),
    },
    {
      label: hi ? 'गाड़ी लौटाई' : 'Delivered',
      value: num(s.delivered),
      sub: s.cars ? `${Math.round((s.delivered / s.cars) * 100)}%` : '',
    },
    // `parked` counts both parked and returned: a car brought out for a guest
    // who never came is still on site.
    { label: hi ? 'अभी खड़ी' : 'Still parked', value: num(s.parked), sub: '' },
    // Can exceed `cars` — one guest can no-show twice.
    { label: hi ? 'नहीं आए' : 'No-shows', value: num(s.no_shows), sub: '', tone: s.no_shows ? C.red : undefined },
    {
      // The number this screen exists for: measured from when the GUEST ASKED,
      // not from when somebody was dispatched — a queue nobody was watching
      // would otherwise score perfectly.
      label: hi ? 'गाड़ी आने में' : 'Guest wait',
      value: mins(s.retrieval_wait, hi),
      // Always beside its count. A median of 4 cars looks as solid as a median
      // of 4,000 when it is shown alone, and nobody should re-roster on it.
      sub: hi ? `${num(s.retrieval_count)} गाड़ियों पर` : `over ${num(s.retrieval_count)} cars`,
      wide: true,
    },
    {
      label: hi ? 'पार्क करने में' : 'Time to park',
      value: mins(s.parking_time, hi),
      sub: hi ? `${num(s.parking_count)} गाड़ियों पर` : `over ${num(s.parking_count)} cars`,
      wide: true,
    },
  ]

  return (
    <>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {cells.map((c) => (
          <Card key={c.label} style={{ padding: '12px 14px' }}>
            <div style={{
              fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: C.faint,
            }}>
              {c.label}
            </div>
            <div style={{
              fontSize: c.wide ? 20 : 24, fontWeight: 800, color: c.tone || C.text,
              marginTop: 3, fontVariantNumeric: 'tabular-nums',
            }}>
              {c.value}
            </div>
            {c.sub && <div style={{ fontSize: 11.5, color: C.tl, marginTop: 2 }}>{c.sub}</div>}
          </Card>
        ))}
      </div>

      {/* A tier with no cars is ABSENT from the object rather than zero, so this
          lists what happened rather than a fixed set of labels. */}
      {tiers.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {tiers.map(([name, n]) => (
            <span key={name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999,
              background: C.cardAlt, border: `1px solid ${C.border}`, fontSize: 12.5, color: C.tl,
            }}>
              {name}
              <b style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{num(n)}</b>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

// per_day is zero-filled by the API, so it is safe to plot straight through — a
// quiet day draws as a gap rather than being missing from the axis.
function DayBars({ C, hi, rows }) {
  if (!rows.length) return <EmptyState icon={null} title={hi ? 'कोई गाड़ी नहीं' : 'No cars'} />
  const peak = Math.max(1, ...rows.map((r) => r.cars))
  const busiest = rows.reduce((a, b) => (b.cars > a.cars ? b : a), rows[0])

  return (
    <div>
      <div className="no-bar" style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 3, height: 150,
          minWidth: rows.length * 9,
        }}>
          {rows.map((r) => (
            <div
              key={r.d}
              title={`${fmtDay(r.d, hi)} · ${r.cars}`}
              style={{
                flex: '1 1 0', minWidth: 6, borderRadius: '3px 3px 0 0',
                // A floor of 2px so a zero day is still a mark on the axis
                // rather than an invisible gap that reads as missing data.
                height: `${Math.max(2, (r.cars / peak) * 100)}%`,
                background: r.cars ? C.maroon : C.border,
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: C.faint, marginTop: 6 }}>
        <span>{fmtDay(rows[0].d, hi)}</span>
        <span style={{ color: C.tl }}>
          {hi ? 'सबसे ज़्यादा' : 'Busiest'}:{' '}
          <b style={{ color: C.text }}>{fmtDay(busiest.d, hi)} · {busiest.cars}</b>
        </span>
        <span>{fmtDay(rows[rows.length - 1].d, hi)}</span>
      </div>
    </div>
  )
}

// Always 24 entries, h = 0–23, IST, zero-filled.
function HourBars({ C, hi, rows }) {
  if (!rows.length) return <EmptyState icon={null} title={hi ? 'कोई गाड़ी नहीं' : 'No cars'} />
  const peak = Math.max(1, ...rows.map((r) => r.cars))
  const top = [...rows].sort((a, b) => b.cars - a.cars).slice(0, 3).filter((r) => r.cars)
  // 12-hour, because that is how every other time in this app is written —
  // fmtTime() renders task and booking times as AM/PM, and a chart on 24-hour
  // made the reader convert. ":00" is dropped: these are whole hours, so it was
  // the same two characters on every label.
  const hh = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150 }}>
        {rows.map((r) => (
          <div
            key={r.h}
            title={`${hh(r.h)} · ${r.cars}`}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
          >
            <div style={{
              height: `${Math.max(2, (r.cars / peak) * 100)}%`, borderRadius: '3px 3px 0 0',
              // The peak hours are the answer; the rest is the shape around them.
              background: top.some((x) => x.h === r.h) ? C.maroon : (r.cars ? `${C.maroon}55` : C.border),
            }} />
          </div>
        ))}
      </div>
      {/* Through the same formatter as the tooltip and the peak line, so the
          axis cannot end up written differently from what it labels. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.faint, marginTop: 5 }}>
        {[0, 6, 12, 18, 23].map((h) => <span key={h}>{hh(h)}</span>)}
      </div>
      {top.length > 0 && (
        <div style={{ fontSize: 12, color: C.tl, marginTop: 8 }}>
          {hi ? 'सबसे व्यस्त' : 'Peak'}:{' '}
          <b style={{ color: C.text }}>{top.map((r) => `${hh(r.h)} (${r.cars})`).join(' · ')}</b>
        </div>
      )}
    </div>
  )
}

const TABLE_GRID = 'minmax(0, 1.6fr) repeat(4, 62px)'

function Operators({ C, hi, rows }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={null}
        title={hi ? 'इस अवधि में किसी ने काम दर्ज नहीं किया' : 'Nobody logged work in this period'}
      />
    )
  }
  // Busiest first — the question is who carried the shift.
  const sorted = [...rows].sort((a, b) => (b.total_tasks || 0) - (a.total_tasks || 0))
  const head = [hi ? 'पार्क' : 'Parked', hi ? 'लाए' : 'Fetched', hi ? 'नहीं आए' : 'No-show', hi ? 'इंतज़ार' : 'Wait']

  return (
    <div className="no-bar" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 420 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: TABLE_GRID, gap: 8, padding: '0 2px 6px',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.faint,
        }}>
          <span>{hi ? 'नाम' : 'Name'}</span>
          {head.map((h) => <span key={h} style={{ textAlign: 'right' }}>{h}</span>)}
        </div>

        {sorted.map((o) => (
          <div key={o.operator_id} style={{
            display: 'grid', gridTemplateColumns: TABLE_GRID, gap: 8, alignItems: 'center',
            padding: '6px 2px', borderTop: `1px solid ${C.border}`,
          }}>
            <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 13, fontWeight: 600, color: C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {/* operator_name_hi is null for most staff. */}
                {(hi && o.operator_name_hi) || o.operator_name}
              </span>
              {/* Somebody who has left stays in a historical range — dropping
                  them makes the totals stop adding up. */}
              {o.is_active === false && (
                <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, whiteSpace: 'nowrap' }}>
                  {hi ? 'छोड़ चुके' : 'left'}
                </span>
              )}
            </span>
            <Cell C={C} v={o.parked} />
            <Cell C={C} v={o.fetched} />
            <Cell C={C} v={o.no_shows} tone={o.no_shows ? C.red : undefined} />
            <Wait C={C} v={o.retrieval_wait} />
          </div>
        ))}

        <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.55 }}>
          {hi
            ? 'सिर्फ़ पूरे किए गए काम गिने जाते हैं — दोबारा सौंपी गई गाड़ी दो लोगों के नाम नहीं चढ़ती। इंतज़ार मिनट में।'
            : 'Completed tasks only — a reassigned retrieval does not count for two people. Wait is in minutes.'}
        </div>
      </div>
    </div>
  )
}

function ByProperty({ C, hi, rows }) {
  const sorted = [...rows].sort((a, b) => (b.cars || 0) - (a.cars || 0))
  const head = [hi ? 'गाड़ियाँ' : 'Cars', hi ? 'लौटाई' : 'Delivered', hi ? 'नहीं आए' : 'No-show', hi ? 'इंतज़ार' : 'Wait']

  return (
    <div className="no-bar" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 420 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: TABLE_GRID, gap: 8, padding: '0 2px 6px',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.faint,
        }}>
          <span>{hi ? 'प्रॉपर्टी' : 'Venue'}</span>
          {head.map((h) => <span key={h} style={{ textAlign: 'right' }}>{h}</span>)}
        </div>

        {sorted.map((p) => (
          <div key={p.property_id} style={{
            display: 'grid', gridTemplateColumns: TABLE_GRID, gap: 8, alignItems: 'center',
            padding: '6px 2px', borderTop: `1px solid ${C.border}`,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: C.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.property_name}
            </span>
            <Cell C={C} v={p.cars} />
            <Cell C={C} v={p.delivered} />
            <Cell C={C} v={p.no_shows} tone={p.no_shows ? C.red : undefined} />
            <Wait C={C} v={p.retrieval_wait} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Cell({ C, v, tone }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, textAlign: 'right',
      color: tone || (v ? C.text : C.faint), fontVariantNumeric: 'tabular-nums',
    }}>
      {v || 0}
    </span>
  )
}

// null is "nothing completed", which is not zero minutes.
function Wait({ C, v }) {
  return (
    <span style={{
      fontSize: 12.5, fontWeight: 700, textAlign: 'right',
      color: v == null ? C.faint : C.tl, fontVariantNumeric: 'tabular-nums',
    }}>
      {v == null ? '—' : Number(v).toFixed(1)}
    </span>
  )
}

/* ------------------------------------------------------------------ print -- */

// Built from the same values the page renders, so a printed sheet can never
// disagree with the screen it came from.
function printValetReport({ hi, summary: s, operators, byProperty, periodLabel, scopeLabel }) {
  const minsTxt = (v) => (v == null ? '—' : `${Number(v).toFixed(1)} min`)

  const kpis = [
    [hi ? 'गाड़ियाँ' : 'Cars', num(s.cars), s.days ? `${(s.cars / s.days).toFixed(1)} ${hi ? '/ दिन' : 'a day'}` : ''],
    [hi ? 'गाड़ी लौटाई' : 'Delivered', num(s.delivered), ''],
    [hi ? 'अभी खड़ी' : 'Still parked', num(s.parked), ''],
    [hi ? 'नहीं आए' : 'No-shows', num(s.no_shows), ''],
    [hi ? 'गाड़ी आने में' : 'Guest wait', minsTxt(s.retrieval_wait), `${num(s.retrieval_count)} ${hi ? 'गाड़ियाँ' : 'cars'}`],
    [hi ? 'पार्क करने में' : 'Time to park', minsTxt(s.parking_time), `${num(s.parking_count)} ${hi ? 'गाड़ियाँ' : 'cars'}`],
  ].map(([l, v, sub]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}${sub ? ` · ${esc(sub)}` : ''}</span></div>`).join('')

  const tiers = Object.entries(s.tiers || {})
  const tierTable = tiers.length ? `
    <h2>${hi ? 'श्रेणी' : 'By tier'}</h2>
    <table>
      <thead><tr><th>${hi ? 'श्रेणी' : 'Tier'}</th><th class="num">${hi ? 'गाड़ियाँ' : 'Cars'}</th></tr></thead>
      <tbody>${tiers.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${esc(v)}</td></tr>`).join('')}</tbody>
    </table>` : ''

  const bpTable = byProperty?.length > 1 ? `
    <h2>${hi ? 'प्रॉपर्टी की तुलना' : 'Venue by venue'}</h2>
    <table>
      <thead><tr>
        <th>${hi ? 'प्रॉपर्टी' : 'Venue'}</th>
        <th class="num">${hi ? 'गाड़ियाँ' : 'Cars'}</th>
        <th class="num">${hi ? 'लौटाई' : 'Delivered'}</th>
        <th class="num">${hi ? 'नहीं आए' : 'No-shows'}</th>
        <th class="num">${hi ? 'इंतज़ार' : 'Wait'}</th>
      </tr></thead>
      <tbody>${byProperty.map((p) => `<tr>
        <td>${esc(p.property_name)}</td>
        <td class="num">${esc(p.cars || 0)}</td>
        <td class="num">${esc(p.delivered || 0)}</td>
        <td class="num"><span class="${p.no_shows ? 'miss' : ''}">${esc(p.no_shows || 0)}</span></td>
        <td class="num">${esc(p.retrieval_wait == null ? '—' : Number(p.retrieval_wait).toFixed(1))}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''

  const opTable = operators.length ? `
    <h2>${hi ? 'हर कर्मचारी का काम' : 'Work per operator'}</h2>
    <table>
      <thead><tr>
        <th>${hi ? 'नाम' : 'Name'}</th>
        <th class="num">${hi ? 'पार्क' : 'Parked'}</th>
        <th class="num">${hi ? 'लाए' : 'Fetched'}</th>
        <th class="num">${hi ? 'नहीं आए' : 'No-shows'}</th>
        <th class="num">${hi ? 'इंतज़ार' : 'Wait'}</th>
        <th class="num">${hi ? 'कुल' : 'Total'}</th>
      </tr></thead>
      <tbody>${[...operators].sort((a, b) => (b.total_tasks || 0) - (a.total_tasks || 0)).map((o) => `<tr>
        <td>${esc(o.operator_name)}${o.is_active === false ? ` <i>(${hi ? 'छोड़ चुके' : 'left'})</i>` : ''}</td>
        <td class="num">${esc(o.parked || 0)}</td>
        <td class="num">${esc(o.fetched || 0)}</td>
        <td class="num"><span class="${o.no_shows ? 'miss' : ''}">${esc(o.no_shows || 0)}</span></td>
        <td class="num">${esc(o.retrieval_wait == null ? '—' : Number(o.retrieval_wait).toFixed(1))}</td>
        <td class="num">${esc(o.total_tasks || 0)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="note">${hi
      ? 'सिर्फ़ पूरे किए गए काम गिने जाते हैं। इंतज़ार मिनट में, और वह माध्य (median) है।'
      : 'Completed tasks only. Wait is a median, in minutes.'}</p>` : ''

  return openPrintable({
    title: 'Ambria Valet Analytics',
    heading: hi ? 'वैले विश्लेषण' : 'Valet Analytics',
    subtitle: `${periodLabel} · ${scopeLabel}`,
    body: `<div class="kpis">${kpis}</div>${tierTable}${bpTable}${opTable}
      <p class="note">${hi
        ? 'दिन 05:30 बजे से गिना जाता है — रात 1 बजे आई गाड़ी पिछले दिन की मानी जाती है।'
        : 'A service day starts at 05:30 — a car that arrives at 01:00 belongs to the night before.'}</p>`,
  })
}
