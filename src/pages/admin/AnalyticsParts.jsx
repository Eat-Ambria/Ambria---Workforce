import { useMemo, useState } from 'react'

import { Card } from '../../components/common/UI'
import Icon from '../../components/common/Icon'
import { personName } from '../../constants/org'
import { rateTone } from './analyticsUtils'

// --- plain-language headline -------------------------------------------------
// The one hero figure of the view: same sans as everything else, and
// proportional figures — tabular digits make a big number look loose.
export function Headline({ C, lang, totals, periodLabel, scopeLabel, onOverdue, onOpen }) {
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

  // Over the period, then true right now. Two different kinds of number, and
  // mixing them in one row was half of why the old grid read as noise.
  const period = [
    { key: 'done', value: totals.completed, label: hi ? 'पूरे हुए' : 'Completed' },
    {
      key: 'due',
      value: totals.due ? `${totals.kept}/${totals.due}` : '—',
      label: hi ? 'दर्ज / आना था' : 'Recorded / due',
      hint: hi ? 'बाकी "नहीं हुआ" में' : 'rest are in Not done',
    },
    { key: 'repairs', value: totals.repairs, label: hi ? 'मरम्मत' : 'Repairs' },
  ]
  const live = [
    { key: 'overdue', value: totals.overdueNow, label: hi ? 'ओवरड्यू' : 'Overdue',
      tone: totals.overdueNow ? C.red : null, onClick: onOverdue },
    { key: 'open', value: totals.openNow, label: hi ? 'बाकी' : 'Open', onClick: onOpen },
  ]

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

      {/* the numbers behind it. Period figures, then a divider, then the two
          that describe this moment rather than the period — an admin reading
          "Overdue 3" needs to know it is not a count of things that went wrong
          last month. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 0,
        borderTop: `1px solid ${C.border}`, background: C.cardAlt,
      }}>
        {period.map((m) => (
          <Figure key={m.key} C={C} {...m} />
        ))}
        <div style={{ flex: '1 1 100%', height: 1, background: C.border }} />
        <div style={{
          flex: '1 1 100%', padding: '7px 18px 0', fontSize: 10.5, fontWeight: 800,
          letterSpacing: '0.05em', textTransform: 'uppercase', color: C.faint,
        }}>
          {hi ? 'इस वक़्त' : 'Right now'}
        </div>
        {live.map((m) => (
          <Figure key={m.key} C={C} {...m} />
        ))}
      </div>
    </Card>
  )
}

// One supporting number. Grey at zero, so a row of them stops shouting on a
// quiet day; underlined only when it opens something.
function Figure({ C, value, label, hint, tone, onClick }) {
  const empty = !value || value === '—'
  const inner = (
    <>
      <div style={{
        fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color: empty ? C.faint : (tone || C.text),
        textDecoration: onClick ? 'underline' : 'none',
        textUnderlineOffset: 3,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: C.tl, fontWeight: 600, marginTop: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{hint}</div>}
    </>
  )
  const style = {
    flex: '1 1 130px', minWidth: 0, padding: '12px 18px 14px',
    textAlign: 'left', background: 'transparent', border: 'none',
    cursor: onClick ? 'pointer' : 'default',
  }
  return onClick
    ? <button type="button" onClick={onClick} style={style}>{inner}</button>
    : <div style={style}>{inner}</div>
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
