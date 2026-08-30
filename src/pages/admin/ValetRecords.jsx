// Valet records — one row per car, on screen.
//
// This data was already being fetched here: the Analytics tab's guest-list CSV
// downloads it. It just never appeared on screen, so answering "which car did
// Sharma leave on the 14th" meant exporting a file and opening Excel.
//
// It comes from the VALET PARKING system, a different Supabase project, through
// the valet-analytics edge function that holds the API key. See
// src/lib/valetReport.js and VALET_REPORT_API.md.
//
// What this data is, and why the page is careful with it: every guest's NAME and
// PHONE NUMBER. That is the reason the key never reaches a browser, and the
// reason there is no "copy all" on this screen.

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useColors } from '../../context/ThemeContext'
import { useLang } from '../../context/LangContext'
import { Card, Button, Loader, EmptyState, inputStyle } from '../../components/common/UI'
import Icon from '../../components/common/Icon'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { valetReport, allValetRecords, EXPORT_CAP } from '../../lib/valetReport'
import { downloadCsv } from '../../lib/csv'
import {
  useValetScope, useMyVenues, PeriodBar, VenuePicker, ValetError, fmtDay, rangeLabel,
  useAutoRefresh, LiveStamp,
} from './valetScope'

// A screenful, not the API's 1000. The endpoint caps each call at 1000 rows and
// a busy month is more than that, so one call returns a partial result that
// looks complete — the pager below is not decoration.
const PAGE = 50

/* ------------------------------------------------------------- formatting -- */

// Statuses are NOT hardcoded to a list. The brief names three and the live data
// already has a fourth ('re_parking'), so an unknown one has to render as
// itself rather than disappear or crash.
const STATUS_TONE = {
  delivered: 'green',
  parked: 'blue',
  returned: 'yellow',
}
const humanise = (s) => String(s || '')
  .replace(/_/g, ' ')
  .replace(/^./, (c) => c.toUpperCase())

// ink and fill named outright rather than derived from each other — deriving
// 'gBg' from 'green' by its first letter works right up to the first colour
// whose initial collides.
const RATING_TONE = {
  excellent: { ink: 'green', bg: 'gBg' },
  good: { ink: 'blue', bg: 'bBg' },
  poor: { ink: 'red', bg: 'rBg' },
}
const ratingLabel = (r, hi) => ({
  excellent: hi ? 'बहुत बढ़िया' : 'Excellent',
  good: hi ? 'ठीक' : 'Good',
  poor: hi ? 'ख़राब' : 'Poor',
}[r] || '')

const fmtClock = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

/* ------------------------------------------------------------------ page --- */

export default function ValetRecords({ visibleProps, scopeAll }) {
  const C = useColors()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const wide = useMediaQuery('(min-width: 900px)')

  const scope = useValetScope()
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
    propId, setPropId, props, range } = scope
  const { myProps, nameOf } = useMyVenues({ props, scopeAll, visibleProps, propId, setPropId })

  // What is typed, and what has actually been asked for. Firing a request per
  // keystroke would put six queries behind a five-letter name and let an early
  // one land last.
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)

  const [data, setData] = useState(null)  // { records, total }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [at, setAt] = useState(null)         // when the rows on screen were read
  const [staleErr, setStaleErr] = useState(null)

  useEffect(() => {
    const id = setTimeout(() => setQuery(typed.trim()), 350)
    return () => clearTimeout(id)
  }, [typed])

  // Page 3 of a search for "sharma" is not page 3 of the next search, and
  // leaving the offset behind shows an empty table over a non-empty result.
  useEffect(() => { setOffset(0) }, [query, range.from, range.to, propId])

  // `quiet` is the auto-refresh: same request, but it must not raise the loading
  // flag. At a five-second interval a full-page spinner would replace the table
  // more often than you could read it.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) { setLoading(true); setErr(null) }
    try {
      const r = await valetReport('records', {
        from: range.from,
        to: range.to,
        ...(propId ? { property_id: propId } : {}),
        ...(query ? { query } : {}),
        limit: PAGE,
        offset,
      })
      setData({ records: r.records || [], total: r.total ?? 0 })
      setAt(new Date())
      setErr(null)
      setStaleErr(null)
    } catch (e) {
      // A failed background tick keeps the rows that are already on screen.
      if (quiet) setStaleErr(e)
      else { setErr(e); setData(null) }
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [range.from, range.to, propId, query, offset])

  useEffect(() => { load() }, [load])
  useAutoRefresh(() => load({ quiet: true }))

  const total = data?.total ?? 0
  const rows = data?.records || []
  const from = total ? offset + 1 : 0
  const to = Math.min(offset + PAGE, total)
  // Only when nothing is picked — with one venue chosen the column would repeat
  // the same name down the page.
  const showVenue = !propId

  const scopeLabel = propId ? nameOf(propId) : (hi ? 'सभी प्रॉपर्टी' : 'All properties')

  /* --- the guest list, for the current filters ---------------------------- */
  async function exportCsv() {
    setBusy(true)
    setNote('')
    try {
      // Everything the filters match, not the page on screen — a file of the 50
      // rows you happen to be looking at is a trap.
      const all = await allValetRecords({
        from: range.from,
        to: range.to,
        ...(propId ? { property_id: propId } : {}),
        ...(query ? { query } : {}),
      }, (got, n) => setNote(hi ? `${got} / ${n} पंक्तियाँ…` : `${got} / ${n} rows…`))

      if (!all.length) {
        setNote(hi ? 'कुछ नहीं मिला।' : 'Nothing to download.')
        return
      }
      // The same three columns as the Analytics tab, so the two files match.
      // 'Number' stays LAST: CSV carries no column width, and Excel only spills
      // text past a cell edge when the cells to its right are empty.
      downloadCsv(
        `valet-guests-${range.to}.csv`,
        [
          { key: 'name', label: hi ? 'मेहमान का नाम' : 'Guest name' },
          { key: 'tier', label: hi ? 'गाड़ी की श्रेणी' : 'Car tier' },
          { key: 'phone', label: hi ? 'नंबर' : 'Number', text: true },
        ],
        all.map((r) => ({ name: r.guest_name ?? '', tier: r.car_tier ?? '', phone: r.guest_phone ?? '' })),
      )
      setNote(hi ? `${all.length} पंक्तियाँ डाउनलोड हुईं` : `${all.length} rows downloaded`)
    } catch (e) {
      setNote(e?.code === 'TOO_MANY'
        ? (hi ? `${e.total} पंक्तियाँ — इतनी एक फ़ाइल में नहीं (सीमा ${EXPORT_CAP})। तारीख़ें छोटी करें।`
              : `${e.total} rows is over the ${EXPORT_CAP} limit — narrow the dates.`)
        : (e?.message || (hi ? 'डाउनलोड नहीं हो पाया।' : 'The download failed.')))
    } finally {
      setBusy(false)
    }
  }

  if (props && !scopeAll && !myProps.length) {
    return (
      <EmptyState
        icon={null}
        title={hi ? 'इस जगह पर वैले का डेटा नहीं है' : 'Valet has no records for your venue'}
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <VenuePicker C={C} hi={hi} props={props} myProps={myProps} scopeAll={scopeAll} propId={propId} setPropId={setPropId} />

        {/* One box for four things, because the API matches all four and a
            four-way picker above a search box would be a control that only
            narrows what the search already finds. */}
        <span style={{ position: 'relative', flex: '1 1 220px', minWidth: 190, display: 'inline-flex', alignItems: 'center' }}>
          <Icon name="search" size={15} color={C.faint} style={{ position: 'absolute', left: 11, pointerEvents: 'none' }} />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={hi ? 'नाम, नंबर, गाड़ी या टोकन' : 'Name, number, car or token'}
            style={{ ...inputStyle(C), padding: '8px 30px 8px 32px', fontSize: 13, borderRadius: 999 }}
          />
          {typed && (
            <button
              type="button"
              onClick={() => setTyped('')}
              title={hi ? 'हटाएँ' : 'Clear'}
              style={{ position: 'absolute', right: 8, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
            >
              <Icon name="close" size={14} color={C.faint} />
            </button>
          )}
        </span>

        <Button variant="ghost" disabled={!total || busy} onClick={exportCsv} style={{ padding: '8px 13px', fontSize: 13 }}>
          <Icon name="download" size={15} color={C.tl} style={{ marginRight: 5 }} />
          {busy ? (hi ? 'बन रहा है…' : 'Preparing…') : (hi ? 'गेस्ट लिस्ट (CSV)' : 'Guest list (CSV)')}
        </Button>
      </div>

      {note && <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 10, textAlign: 'right' }}>{note}</div>}

      <LiveStamp C={C} hi={hi} at={at} failed={staleErr} />

      {loading ? <Loader /> : err ? (
        <Card><ValetError C={C} hi={hi} err={err} /></Card>
      ) : !total ? (
        <EmptyState
          icon={null}
          title={query
            ? (hi ? `"${query}" से कुछ नहीं मिला` : `Nothing matches "${query}"`)
            : (hi ? 'इन तारीख़ों में कोई गाड़ी नहीं' : 'No cars in these dates')}
          hint={query
            ? (hi ? 'नाम, फ़ोन, गाड़ी नंबर या टोकन से खोजें।' : 'Search by name, phone, car number or token.')
            : `${rangeLabel(range.from, range.to, hi)} · ${scopeLabel}`}
        />
      ) : (
        <>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 8 }}>
            {hi ? `${total} में से ${from}–${to}` : `${from}–${to} of ${total}`}
            {' · '}{rangeLabel(range.from, range.to, hi)}{' · '}{scopeLabel}
          </div>

          {/* Wide, so it scrolls inside its own box. The page body must never
              scroll sideways. */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: wide ? 940 : 820 }}>
                <Head C={C} hi={hi} showVenue={showVenue} />
                {rows.map((r) => (
                  <Row key={r.id} C={C} hi={hi} r={r} showVenue={showVenue} />
                ))}
              </div>
            </div>
          </Card>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
            <Button
              variant="ghost"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              style={{ padding: '7px 13px', fontSize: 13 }}
            >
              <Icon name="chevronLeft" size={15} color={C.tl} style={{ marginRight: 4 }} />
              {hi ? 'पिछला' : 'Previous'}
            </Button>
            <span style={{ fontSize: 12.5, color: C.tl, fontVariantNumeric: 'tabular-nums' }}>
              {hi ? `पेज ${Math.floor(offset / PAGE) + 1} / ${Math.max(1, Math.ceil(total / PAGE))}`
                  : `Page ${Math.floor(offset / PAGE) + 1} of ${Math.max(1, Math.ceil(total / PAGE))}`}
            </span>
            <Button
              variant="ghost"
              disabled={to >= total}
              onClick={() => setOffset((o) => o + PAGE)}
              style={{ padding: '7px 13px', fontSize: 13 }}
            >
              {hi ? 'अगला' : 'Next'}
              <Icon name="chevronRight" size={15} color={C.tl} style={{ marginLeft: 4 }} />
            </Button>
          </div>

          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
            {hi
              ? 'दिन 05:30 बजे से गिना जाता है — रात 1 बजे आई गाड़ी पिछले दिन की मानी जाती है। रेटिंग सिर्फ़ मेहमान देता है, और ज़्यादातर जवाब नहीं देते — इसलिए "—" का मतलब जवाब नहीं आया, ख़राब नहीं।'
              : 'A service day starts at 05:30 — a car that arrives at 01:00 belongs to the night before. The rating is the guest\'s, asked once; most never reply, so "—" means no answer, not a bad one.'}
          </div>
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- table --- */

const cols = (showVenue) => `78px 46px minmax(130px, 1.4fr) 104px ${showVenue ? 'minmax(104px, 1fr) ' : ''}minmax(120px, 1.1fr) minmax(120px, 1.2fr) 92px`

function Head({ C, hi, showVenue }) {
  const cells = [
    hi ? 'तारीख़' : 'Date',
    hi ? 'टोकन' : 'Token',
    hi ? 'मेहमान' : 'Guest',
    hi ? 'गाड़ी' : 'Car',
    ...(showVenue ? [hi ? 'प्रॉपर्टी' : 'Property'] : []),
    hi ? 'पार्क / वापस' : 'Parked / Fetched',
    hi ? 'रेटिंग' : 'Rating',
    hi ? 'स्थिति' : 'Status',
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols(showVenue), gap: 10,
      padding: '9px 14px', background: C.cardAlt, borderBottom: `1px solid ${C.border}`,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.faint,
      position: 'sticky', top: 0, zIndex: 1,
    }}>
      {cells.map((c) => <span key={c}>{c}</span>)}
    </div>
  )
}

function Row({ C, hi, r, showVenue }) {
  // Read defensively: a valet deployment without migration 0044 omits these two
  // keys entirely rather than sending null, and `undefined` down this path would
  // take the table with it.
  const rating = r.rating ?? null
  const comment = r.review_comment ?? null
  const tone = C[STATUS_TONE[r.status] || 'tl'] || C.tl

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols(showVenue), gap: 10,
      padding: '9px 14px', borderBottom: `1px solid ${C.border}`, alignItems: 'start',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{fmtDay(r.service_date, hi)}</span>

      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.tl, fontVariantNumeric: 'tabular-nums' }}>
        {r.token_number ?? '—'}
      </span>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.guest_name || '—'}
        </span>
        {r.guest_phone && (
          <span style={{ display: 'block', fontSize: 11.5, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
            {r.guest_phone}
          </span>
        )}
      </span>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {r.car_number || '—'}
        </span>
        {r.car_tier && (
          <span style={{
            display: 'inline-block', marginTop: 2, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.03em', textTransform: 'uppercase',
            color: r.car_tier === 'VIP' ? C.maroon : C.tl,
            background: r.car_tier === 'VIP' ? C.maroonSoft : C.cardAlt,
            border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 7px',
          }}>
            {r.car_tier}
          </span>
        )}
      </span>

      {showVenue && (
        <span style={{ fontSize: 12, color: C.tl, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.property_name || '—'}
        </span>
      )}

      {/* Who handled it, each with the time. fetched_by is null until the car
          goes back out, which is the normal state of anything still parked. */}
      <span style={{ minWidth: 0, fontSize: 12, color: C.tl, lineHeight: 1.5 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(hi && r.parked_by_hi) || r.parked_by || '—'}
          {r.parked_at && <span style={{ color: C.faint }}> · {fmtClock(r.parked_at)}</span>}
        </span>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(hi && r.fetched_by_hi) || r.fetched_by || '—'}
          {r.delivered_at && <span style={{ color: C.faint }}> · {fmtClock(r.delivered_at)}</span>}
        </span>
      </span>

      <span style={{ minWidth: 0 }}>
        {rating ? (
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 800,
            color: C[(RATING_TONE[rating] || {}).ink] || C.tl,
            background: C[(RATING_TONE[rating] || {}).bg] || C.cardAlt,
            border: `1px solid ${C.border}`, borderRadius: 999, padding: '1px 8px',
          }}>
            {ratingLabel(rating, hi)}
          </span>
        ) : (
          // Not 0 and not blank: the guest is asked once and most never reply,
          // so this cell means "no answer", which is not a bad score.
          <span style={{ fontSize: 12.5, color: C.faint }}>—</span>
        )}
        {comment && (
          <span style={{ display: 'block', fontSize: 11.5, color: C.tl, marginTop: 3, lineHeight: 1.45 }}>
            {comment}
          </span>
        )}
        {/* A Poor with nothing under it usually means the guest's reply has not
            landed yet — they are asked what went wrong and type back minutes
            later. Saying "no comment" here would be wrong more often than right. */}
        {rating === 'poor' && !comment && (
          <span style={{ display: 'block', fontSize: 11, color: C.faint, marginTop: 3, fontStyle: 'italic' }}>
            {hi ? 'वजह का इंतज़ार' : 'awaiting their reason'}
          </span>
        )}
      </span>

      <span style={{ fontSize: 11.5, fontWeight: 700, color: tone, whiteSpace: 'nowrap' }}>
        {humanise(r.status)}
      </span>
    </div>
  )
}
