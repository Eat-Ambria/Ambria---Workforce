import { useMemo, useState } from 'react'

import { Card } from '../../components/common/UI'
import Icon from '../../components/common/Icon'
import { personName } from '../../constants/org'
import { rateTone } from './analyticsUtils'

// --- the day-wise report ------------------------------------------------------
// One row per day: owed, done, not done, and the share. `done` on its own could
// never say whether twelve was a good day — the denominator is the point.
export function DayReport({ C, lang, rows }) {
  const hi = lang === 'hi'
  if (!rows.length) return null
  const worst = Math.max(...rows.map((r) => r.due || r.total || 0), 1)
  const fmtDay = (iso) => {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString(hi ? 'hi-IN' : 'en-GB', { day: '2-digit', month: 'short', weekday: 'short' })
  }

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(96px, 1.4fr) 52px 52px 68px minmax(70px, 1fr)',
        gap: 8, padding: '0 2px 6px',
        fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.faint,
      }}>
        <span>{hi ? 'दिन' : 'Day'}</span>
        <span style={{ textAlign: 'right' }}>{hi ? 'आना था' : 'Due'}</span>
        <span style={{ textAlign: 'right' }}>{hi ? 'हुआ' : 'Done'}</span>
        <span style={{ textAlign: 'right' }}>{hi ? 'नहीं हुआ' : 'Not done'}</span>
        <span>{hi ? 'कितना' : 'Share'}</span>
      </div>

      {rows.map((r) => {
        // An unfinished day gets no verdict: no shortfall, no share.
        const share = r.open || !r.due ? null : Math.round((r.total / r.due) * 100)
        const tone = share == null ? C.faint : share >= 90 ? C.green : share >= 60 ? C.yellow : C.red
        return (
          <div key={r.day} style={{
            display: 'grid', gridTemplateColumns: 'minmax(96px, 1.4fr) 52px 52px 68px minmax(70px, 1fr)',
            gap: 8, alignItems: 'center', padding: '5px 2px',
            borderTop: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmtDay(r.day)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: r.due ? C.tl : C.faint, fontVariantNumeric: 'tabular-nums' }}>
              {r.due || '—'}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 800, textAlign: 'right', color: r.total ? C.text : C.faint, fontVariantNumeric: 'tabular-nums' }}>
              {r.total}
            </span>
            <span
              title={r.open ? (hi ? 'दिन बाकी है' : 'the day is not over') : undefined}
              style={{ fontSize: 13.5, fontWeight: 800, textAlign: 'right', color: r.missed ? C.red : C.faint, fontVariantNumeric: 'tabular-nums' }}
            >
              {r.open ? '—' : (r.missed || 0)}
            </span>
            {/* the bar is the whole day owed; the fill is what happened */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ flex: 1, height: 7, borderRadius: 999, background: C.cardAlt, overflow: 'hidden', minWidth: 0 }}>
                <span style={{
                  display: 'block', height: '100%', borderRadius: 999, background: tone,
                  width: `${Math.min(100, Math.round(((r.total || 0) / worst) * 100))}%`,
                }} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: tone, minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {share == null ? '' : `${share}%`}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// --- who did what, on which day ----------------------------------------------
// People down, days across, work done in the cell. Every figure here was already
// being fetched by analytics_person_day and discarded — the page has loaded that
// RPC all along and never drawn it.
export function PersonDayGrid({ C, lang, days, people }) {
  const hi = lang === 'hi'
  if (!days.length || !people.length) return null
  const peak = Math.max(1, ...people.flatMap((p) => days.map((d) => p.byDay[d] || 0)))
  const label = (iso) => {
    const d = new Date(`${iso}T00:00:00`)
    return { d: d.toLocaleDateString(hi ? 'hi-IN' : 'en-GB', { day: '2-digit' }),
             m: d.toLocaleDateString(hi ? 'hi-IN' : 'en-GB', { weekday: 'narrow' }) }
  }
  const cols = `minmax(120px, 1.6fr) repeat(${days.length}, minmax(24px, 1fr)) 46px`

  return (
    <div style={{ overflowX: 'auto' }} className="no-bar">
      <div style={{ minWidth: 120 + days.length * 26 + 46 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, alignItems: 'end', paddingBottom: 6 }}>
          <span />
          {days.map((d) => {
            const l = label(d)
            return (
              <span key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: C.faint, lineHeight: 1.15 }}>
                {l.m}<br />{l.d}
              </span>
            )
          })}
          <span style={{ textAlign: 'right', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.faint }}>
            {hi ? 'कुल' : 'Total'}
          </span>
        </div>

        {people.map((p) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, alignItems: 'center', padding: '3px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            {days.map((d) => {
              const n = p.byDay[d] || 0
              // Empty stays empty: a printed 0 in every cell makes a quiet row
              // look as busy as a working one.
              return (
                <span key={d} title={n ? `${p.name} · ${d} · ${n}` : undefined} style={{
                  height: 22, borderRadius: 4, display: 'grid', placeItems: 'center',
                  fontSize: 10.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  background: n ? `${C.green}${Math.max(2, Math.round((n / peak) * 9))}0` : C.cardAlt,
                  color: n ? C.text : 'transparent',
                }}>
                  {n || 0}
                </span>
              )
            })}
            <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: p.total ? C.text : C.faint, fontVariantNumeric: 'tabular-nums' }}>
              {p.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- one area of the app -----------------------------------------------------
// Icon, a headline figure with a sentence saying what it counts, then the
// exceptions worth acting on. The sentence is the point: a bare "12" is what the
// page was being criticised for.
export function AreaCard({ C, icon, tone, title, lead, leadNote, rows = [] }) {
  return (
    <Card style={{ padding: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: `${tone}1F`, display: 'grid', placeItems: 'center',
        }}>
          <Icon name={icon} size={16} color={tone} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 24, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', color: C.text,
        }}>
          {lead}
        </span>
        <span style={{ fontSize: 11.5, color: C.tl, lineHeight: 1.4 }}>{leadNote}</span>
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 5, marginTop: 11, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 11.5, color: C.tl, lineHeight: 1.4 }}>{r.label}</span>
              <span style={{
                fontSize: 14, fontWeight: 800, flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
                color: r.value ? (r.tone || C.text) : C.faint,
              }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// --- the KPI row ------------------------------------------------------------
// Five figures, each with the same shape: icon, number, name, and a note saying
// whether it is a period figure or a live one. `delta` is only passed where a
// previous period genuinely exists to compare against.
function Kpi({ C, icon, tone, value, label, note, delta, onClick }) {
  const dim = value === 0 || value === '—'
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: `${tone}1F`, display: 'grid', placeItems: 'center',
        }}>
          <Icon name={icon} size={17} color={tone} />
        </span>
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: C.faint, lineHeight: 1.2,
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: 26, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums', color: dim ? C.faint : (tone || C.text),
      }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.faint, lineHeight: 1.4 }}>{note}</span>
        {delta != null && delta !== 0 && (
          <span style={{
            fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap',
            color: delta > 0 ? C.green : C.red,
          }}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
          </span>
        )}
      </div>
    </>
  )
  return (
    <Card
      onClick={onClick}
      style={{ padding: 14, cursor: onClick ? 'pointer' : 'default', minWidth: 0 }}
    >
      {inner}
    </Card>
  )
}

export function KpiRow({ C, lang, totals, periodLabel, onOverdue, onOpen }) {
  const hi = lang === 'hi'
  const scored = totals.completed
  const inPeriod = hi ? periodLabel : `in ${periodLabel.toLowerCase()}`
  const rightNow = hi ? 'अभी' : 'right now'

  const cards = [
    // Not on-time % — that is the hero above, and a second copy here is the
    // same duplication one card smaller. This is the figure that was buried in
    // a tile as "Recorded / due": of the work that was actually DUE, how much
    // happened. That is the question the page is opened with; on-time rate
    // answers a later one.
    { key: 'donerate', icon: 'tasks', tone: C.green,
      value: totals.due ? `${totals.doneRate}%` : '—',
      label: hi ? 'जो आना था, हुआ' : 'Of work that was due',
      note: totals.due
        ? (hi ? `${totals.kept}/${totals.due} · ${inPeriod}` : `${totals.kept} of ${totals.due} · ${inPeriod}`)
        : (hi ? 'कुछ आना नहीं था' : 'nothing was due'),
      delta: null },
    { key: 'done', icon: 'check', tone: C.blue, value: totals.completed,
      label: hi ? 'टास्क पूरे हुए' : 'Tasks completed',
      note: hi ? `${inPeriod}` : `${inPeriod}`,
      delta: totals.prev ? totals.completed - (totals.prev.completed || 0) : null },
    { key: 'repairs', icon: 'taskBoard', tone: C.indigo, value: totals.repairs,
      label: hi ? 'मरम्मत पूरी हुई' : 'Repairs closed',
      note: hi ? `${inPeriod}` : `${inPeriod}`,
      delta: totals.prev ? totals.repairs - (totals.prev.repairs || 0) : null },
    { key: 'open', icon: 'inbox', tone: C.yellow, value: totals.openNow,
      label: hi ? 'टास्क बाकी हैं' : 'Tasks still open',
      note: hi ? `${rightNow} · तारीख़ से नहीं बदलता` : `${rightNow} · not tied to the date range`,
      onClick: totals.openNow ? onOpen : undefined },
    { key: 'overdue', icon: 'warning', tone: totals.overdueNow ? C.red : C.tl,
      value: totals.overdueNow,
      label: hi ? 'टास्क देरी से' : 'Tasks overdue',
      note: hi ? `${rightNow} · तारीख़ से नहीं बदलता` : `${rightNow} · not tied to the date range`,
      onClick: totals.overdueNow ? onOverdue : undefined },
  ]

  return (
    <div style={{
      display: 'grid', gap: 10, marginBottom: 14,
      // auto-fit rather than five fixed columns: five 26px figures side by side
      // on a phone is unreadable, and this lands on two or three without a
      // breakpoint to maintain.
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    }}>
      {cards.map((c) => <Kpi key={c.key} C={C} {...c} />)}
    </div>
  )
}

// --- plain-language headline -------------------------------------------------
// The one hero figure of the view: same sans as everything else, and
// proportional figures — tabular digits make a big number look loose.
export function Headline({ C, lang, totals, periodLabel, scopeLabel }) {
  const hi = lang === 'hi'
  // Nothing recorded, nothing to score. pct(0, 0) is 0 and rateTone(0) is red,
  // so an untouched day used to render as a failed one.
  const scored = totals.completed
  const tone = rateTone(totals.onTimeRate, C, scored)

  // Against the same length of time, one period back. Percentage points, not
  // percent — a rate that moves from 80 to 84 has gained 4 points, and calling
  // that "5% better" is the kind of arithmetic nobody can check at a glance.
  const prevScored = totals.prev?.completed || 0
  const shift = scored && prevScored ? totals.onTimeRate - totals.prev.onTimeRate : null

  return (
    <Card style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
      {/* the rate, and what it is a rate OF, in a sentence */}
      <div style={{ padding: 18, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: tone, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {scored ? `${totals.onTimeRate}%` : '—'}
        </div>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            {scored
              ? (hi ? 'दर्ज हुआ काम समय पर पूरा हुआ' : 'of recorded work finished on time')
              : (hi ? 'अभी कुछ दर्ज नहीं हुआ' : 'nothing recorded yet')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.tl, lineHeight: 1.5 }}>
              {periodLabel} · {scopeLabel}
            </span>
            {shift != null && shift !== 0 && (
              <span style={{
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                color: shift > 0 ? C.green : C.red,
                background: shift > 0 ? C.gBg : C.rBg,
                borderRadius: 999, padding: '2px 9px',
              }}>
                {shift > 0 ? '▲' : '▼'} {Math.abs(shift)}
                {hi ? ' अंक' : 'pp'}
                <span style={{ color: C.tl, fontWeight: 600 }}>
                  {hi ? ' पिछली बार से' : ' vs last'}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

    </Card>
  )
}


export function StatusChip({ C, lang, rate }) {
  const hi = lang === 'hi'
  const s = rate >= 85
    ? { tone: C.green, bg: C.gBg, icon: 'check', label: hi ? 'ठीक चल रहा' : 'On track' }
    : rate >= 60
      ? { tone: C.yellow, bg: C.yBg, icon: 'clock', label: hi ? 'ध्यान दें' : 'Watch' }
      : { tone: C.red, bg: C.rBg, icon: 'warning', label: hi ? 'पीछे है' : 'Behind' }
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
        borderRadius: 999, background: s.bg, color: s.tone, fontSize: 11.5, fontWeight: 700,
      }}
    >
      <Icon name={s.icon} size={12} color={s.tone} /> {s.label}
    </span>
  )
}

// --- what each number actually means ----------------------------------------
export function MetricGuide({ C, lang }) {
  const [open, setOpen] = useState(false)
  const hi = lang === 'hi'
  const items = hi
    ? [
      ['समय पर', 'ड्यू डेट तक मंज़ूर हुए टास्क का प्रतिशत।'],
      ['औसत समय', 'स्टाफ़ ने "Start Work" से "Submit" तक कितना समय लिया।'],
      ['मंज़ूरी में देरी', 'स्टाफ़ के भेजने के बाद एडमिन ने मंज़ूर करने में कितना समय लिया।'],
      ['ओवरड्यू / बाकी', 'अभी की स्थिति — चुनी हुई अवधि से बंधी नहीं।'],
      ['रेटिंग', 'पूरी हुई मरम्मत पर एडमिन की 1–5 स्टार रेटिंग का औसत।'],
    ]
    : [
      ['On time', 'Share of approved tasks approved on or before their due date.'],
      ['Avg time', 'How long staff took from "Start Work" to "Submit".'],
      ['Approval wait', 'How long the admin took to approve after staff submitted.'],
      ['Overdue / Open', 'Live right now — these two are not tied to the selected period.'],
      ['Rating', 'Average of the 1–5 stars admins gave on finished repairs.'],
    ]

  return (
    <div style={{ marginTop: 18 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'transparent', color: C.tl, fontSize: 12.5, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
        }}
      >
        <Icon name="info" size={14} color={C.tl} />
        {hi ? 'इन आँकड़ों का मतलब' : 'What these numbers mean'}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {items.map(([term, desc]) => (
            <div key={term} style={{ fontSize: 12.5, color: C.tl, lineHeight: 1.5 }}>
              <b style={{ color: C.text }}>{term}</b> — {desc}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
