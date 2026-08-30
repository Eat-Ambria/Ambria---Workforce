// The controls the Valet Analytics and Records tabs share: which dates, and
// which venue.
//
// Written once because they are the same control. Two tabs sitting next to each
// other, each with its own copy of a six-button period bar and a venue picker,
// is how the two quietly stop agreeing — one gains a period the other lacks, or
// a scoped admin is locked to their venue on one tab and not the other.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PROPERTIES } from '../../constants/org'
import { inputStyle } from '../../components/common/UI'
import Icon from '../../components/common/Icon'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { valetReport } from '../../lib/valetReport'

/* ------------------------------------------------------------------ dates -- */

// The calendar day HERE. toISOString() answers that in UTC, and IST is far
// enough ahead that midnight local is the previous day there — which is how
// every period on the task analytics page once came to start a day early.
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Inclusive of both ends, because that is what the valet API takes. The task
// analytics page uses half-open windows; do not copy that convention across.
export function periodDates(key, custom) {
  const now = new Date()
  const today = ymd(now)
  const back = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return ymd(d) }

  if (key === 'today') return { from: today, to: today }
  if (key === 'week') return { from: back((now.getDay() + 6) % 7), to: today } // back to Monday
  if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  if (key === 'last_month') {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)), // day 0 = last day of the previous month
    }
  }
  if (key === 'custom') {
    const from = custom?.from || today
    // Leaving "to" empty means that single day.
    return { from, to: custom?.to || from }
  }
  return { from: back(89), to: today } // 'quarter'
}

export const fmtDay = (iso, hi) => {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(hi ? 'hi-IN' : 'en-GB', { day: '2-digit', month: 'short' })
}

export const rangeLabel = (from, to, hi) => (
  from === to ? fmtDay(from, hi) : `${fmtDay(from, hi)} – ${fmtDay(to, hi)}`
)

/* ----------------------------------------------------------- the controls -- */

// Everything a tab needs to answer "which dates, which venue", held in one place
// so the caller does not have to wire six pieces of state to draw two controls.
export function useValetScope() {
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState(ymd(new Date()))
  const [customTo, setCustomTo] = useState('')
  const [propId, setPropId] = useState('')   // '' = every property combined
  const [props, setProps] = useState(null)   // valet-side property list
  const [listError, setListError] = useState(null)

  const range = useMemo(
    () => periodDates(period, { from: customFrom, to: customTo }),
    [period, customFrom, customTo],
  )

  // Their uuids differ between the valet team's dev and live projects, so the
  // list is fetched rather than hardcoded.
  useEffect(() => {
    let alive = true
    valetReport('properties')
      .then((r) => { if (alive) setProps(r.properties || []) })
      .catch((e) => { if (alive) { setProps([]); setListError(e) } })
    return () => { alive = false }
  }, [])

  return {
    period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
    propId, setPropId, props, listError, range,
  }
}

// Valet names its venues "Ambria Pushpanjali"; ours are "Pushpanjali". Matched
// by name because the two projects share no ids at all.
const codeOf = (name) => {
  const n = String(name || '').toLowerCase()
  return PROPERTIES.find((p) => n.includes(p.name.toLowerCase()))?.code || null
}

// An admin posted to one venue sees that venue. Not "all, defaulted to theirs" —
// the list itself is cut, so there is no combined figure to land on.
export function useMyVenues({ props, scopeAll, visibleProps, propId, setPropId }) {
  const myProps = useMemo(() => {
    if (!props) return []
    if (scopeAll) return props
    const mine = new Set((visibleProps || []).map((p) => p.code))
    return props.filter((p) => mine.has(codeOf(p.name)))
  }, [props, scopeAll, visibleProps])

  // A scoped admin must never sit on the combined figure, so their first venue
  // is selected for them as soon as the list arrives.
  useEffect(() => {
    if (scopeAll || !myProps.length) return
    setPropId((cur) => (myProps.some((p) => p.id === cur) ? cur : myProps[0].id))
  }, [scopeAll, myProps, setPropId])

  const nameOf = useCallback(
    (id) => (props || []).find((p) => p.id === id)?.name || '',
    [props],
  )

  return { myProps, nameOf }
}

export const PERIODS = (hi) => [
  { key: 'today', label: hi ? 'आज' : 'Today', short: hi ? 'आज' : 'Today' },
  { key: 'week', label: hi ? 'यह हफ़्ता' : 'This Week', short: hi ? 'हफ़्ता' : 'Week' },
  { key: 'month', label: hi ? 'यह महीना' : 'This Month', short: hi ? 'महीना' : 'Month' },
  { key: 'last_month', label: hi ? 'पिछला महीना' : 'Last Month', short: hi ? 'पिछला' : 'Last mo' },
  { key: 'quarter', label: hi ? '90 दिन' : 'Last 90 Days', short: hi ? '90 दिन' : '90d' },
  { key: 'custom', label: hi ? 'तारीख़ चुनें' : 'Pick dates', short: hi ? 'तारीख़' : 'Dates' },
]

// One setting with six values, drawn as one object rather than six pills
// stretched edge to edge. Made to fit rather than made to scroll; overflow stays
// as a backstop for a longer translation, with the bar hidden.
export function PeriodBar({ C, hi, period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const roomy = useMediaQuery('(min-width: 560px)')
  const today = ymd(new Date())

  return (
    <>
      <div className="no-bar" style={{
        display: 'flex', gap: 2, marginBottom: 12, padding: 3,
        background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {PERIODS(hi).map((p) => {
          const on = period === p.key
          return (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={on}
              style={{
                flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap',
                padding: roomy ? '8px 16px' : '7px 5px', borderRadius: 9,
                fontSize: roomy ? 13.5 : 11.5, fontWeight: on ? 700 : 600,
                background: on ? C.card : 'transparent',
                color: on ? C.maroon : C.tl,
                border: 'none', boxShadow: on ? C.shadow : 'none', cursor: 'pointer',
              }}
            >
              {roomy ? p.label : p.short}
            </button>
          )
        })}
      </div>

      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 150px', minWidth: 140 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tl, marginBottom: 4 }}>
              {hi ? 'तारीख़ / से' : 'Date / from'}
            </div>
            <input
              type="date" max={today} value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ ...inputStyle(C), padding: '9px 11px', fontSize: 13 }}
            />
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 140 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tl, marginBottom: 4 }}>
              {hi ? 'तक (वैकल्पिक)' : 'To (optional)'}
            </div>
            <input
              type="date" min={customFrom} max={today} value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ ...inputStyle(C), padding: '9px 11px', fontSize: 13 }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, flex: '1 1 190px', paddingBottom: 9, lineHeight: 1.5 }}>
            {hi ? 'सिर्फ़ एक दिन देखना हो तो "तक" खाली छोड़ दें।' : 'Leave "to" empty to look at a single day.'}
          </div>
        </div>
      )}
    </>
  )
}

export function VenuePicker({ C, hi, props, myProps, scopeAll, propId, setPropId }) {
  return (
    <select
      value={propId}
      onChange={(e) => setPropId(e.target.value)}
      disabled={!props || (!scopeAll && myProps.length < 2)}
      style={{ ...inputStyle(C), width: 'auto', minWidth: 180, padding: '8px 12px', fontSize: 13, borderRadius: 999 }}
    >
      {scopeAll && <option value="">{hi ? 'सभी प्रॉपर्टी' : 'All properties'}</option>}
      {myProps.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}{p.is_active === false ? (hi ? ' (बंद)' : ' (closed)') : ''}
        </option>
      ))}
    </select>
  )
}

// A setup problem is not retryable, and a Retry button on one just hides the
// thing somebody has to go and fix. Both tabs say it the same way.
export function ValetError({ C, hi, err }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Icon name="warning" size={18} color={C.red} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 4 }}>
          {err.isSetup
            ? (hi ? 'वैले की तरफ़ सेटअप बाकी है' : 'The valet side is not set up yet')
            : (hi ? 'आँकड़े नहीं आ पाए' : 'Could not load the figures')}
        </div>
        <div style={{ fontSize: 12.5, color: C.tl, lineHeight: 1.55 }}>{err.message}</div>
        {err.isSetup ? (
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>
            {hi ? `कोड ${err.code} — दोबारा कोशिश करने से ठीक नहीं होगा, वैले टीम को बताएँ।`
                : `Code ${err.code} — retrying will not fix this; tell the valet team.`}
          </div>
        ) : (
          // No Try-again button: the page already retries on its own every few
          // seconds and clears this card the moment one succeeds. A button that
          // does what is about to happen anyway is a control you have to explain.
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.faint, marginTop: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.yellow, flexShrink: 0 }} />
            {hi ? 'अपने आप दोबारा कोशिश हो रही है…' : 'Trying again on its own…'}
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- auto refresh --- */

export const REFRESH_MS = 5000

// Re-run `fn` on a timer, for a screen somebody leaves open on a wall.
//
// Four things this has to get right, all of which are the difference between a
// live page and a page that fights you:
//
//   * ONLY WHILE VISIBLE. A backgrounded tab would otherwise poll two Supabase
//     projects forever — every one of these calls hops browser -> our edge
//     function -> the valet edge function -> a Postgres aggregate.
//   * NO OVERLAP. If a round trip takes longer than the interval, ticks would
//     queue up behind each other and an early reply could land after a late one.
//   * IMMEDIATELY ON RETURN. Coming back to a tab should not show up to five
//     seconds of stale figures while the next tick is waited out.
//   * QUIETLY. The caller passes a refresh that does not raise the page's
//     loading flag — at this interval a full-page spinner would make the screen
//     blank more often than not.
export function useAutoRefresh(fn, ms = REFRESH_MS) {
  // The latest fn, without re-arming the timer on every render — `load` changes
  // identity whenever a filter does, and a re-armed interval restarts its clock.
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })

  const running = useRef(false)

  useEffect(() => {
    if (!ms) return undefined

    const tick = async () => {
      if (document.hidden || running.current) return
      running.current = true
      try { await ref.current() } finally { running.current = false }
    }

    const id = setInterval(tick, ms)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [ms])
}

// "Live · updated 2:41 PM", or what went wrong the last time it tried. A page
// that refreshes itself has to say so, or you cannot tell a frozen screen from
// a quiet one.
export function LiveStamp({ C, hi, at, failed }) {
  if (!at && !failed) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end',
      fontSize: 11.5, color: failed ? C.yellow : C.faint, marginBottom: 10,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: failed ? C.yellow : C.green,
      }} />
      {failed
        // The figures on screen are the last good ones, not nothing — say that
        // rather than replacing a working page with an error every few seconds.
        ? (hi ? 'ताज़ा नहीं हो पाया — पुराने आँकड़े दिख रहे हैं' : 'Could not refresh — showing the last figures')
        : `${hi ? 'लाइव · ' : 'Live · '}${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
    </div>
  )
}
