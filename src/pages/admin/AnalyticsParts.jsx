import { useMemo, useState } from 'react'

import { Card } from '../../components/common/UI'
import Icon from '../../components/common/Icon'
import { personName } from '../../constants/org'
import { rateTone } from './analyticsUtils'

// --- plain-language headline -------------------------------------------------
// The one hero figure of the view: same sans as everything else, and
// proportional figures — tabular digits make a big number look loose.
export function Headline({ C, lang, totals, periodLabel, scopeLabel, onOverdueClick }) {
  const hi = lang === 'hi'
  const tone = rateTone(totals.onTimeRate, C)
  const onTimeCount = Math.round((totals.onTimeRate / 100) * totals.completed)

  return (
    <Card style={{ padding: 18, marginBottom: 14, borderLeft: `4px solid ${tone}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: tone, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {totals.onTimeRate}%
        </div>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            {hi ? 'काम समय पर पूरा हुआ' : 'of work finished on time'}
          </div>
          <div style={{ fontSize: 13, color: C.tl, marginTop: 3, lineHeight: 1.55 }}>
            {hi
              ? `${scopeLabel} पर ${periodLabel} — ${totals.completed} में से ${onTimeCount} टास्क समय पर मंज़ूर हुए।`
              : `${onTimeCount} of ${totals.completed} approved tasks were on time, ${periodLabel.toLowerCase()} at ${scopeLabel}.`}
            {totals.overdueNow > 0 && (
              // clickable so the sentence leads straight to the tasks it names
              <button
                type="button"
                onClick={onOverdueClick}
                style={{
                  background: 'transparent', padding: 0, font: 'inherit',
                  color: C.red, fontWeight: 700,
                  textDecoration: onOverdueClick ? 'underline' : 'none',
                  textUnderlineOffset: 2, cursor: onOverdueClick ? 'pointer' : 'default',
                }}
              >
                {hi
                  ? ` अभी ${totals.overdueNow} टास्क ओवरड्यू हैं।`
                  : ` ${totals.overdueNow} ${totals.overdueNow === 1 ? 'task is' : 'tasks are'} overdue right now.`}
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// --- how each head compares --------------------------------------------------
// Magnitude comparison, so: horizontal bars in ONE hue. Never a value ramp —
// bar length already encodes the number, and shading it too would burn the only
// free channel. Selecting a head switches the rest to the de-emphasis gray
// rather than repainting identities.
export function HeadChart({ C, lang, heads, selectedId, onPick, periodLabel }) {
  const rows = useMemo(
    () => [...heads].sort((a, b) => b.completed - a.completed).slice(0, 12),
    [heads]
  )
  const max = Math.max(1, ...rows.map((r) => r.completed))
  const hi = lang === 'hi'
  if (!rows.length || max <= 0) return null

  return (
    <Card style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
        {hi ? 'हेड के हिसाब से पूरे हुए टास्क' : 'Tasks completed, by head'}
      </div>
      <div style={{ fontSize: 12, color: C.tl, marginTop: 2, marginBottom: 14 }}>
        {periodLabel} · {hi ? 'फ़ोकस करने के लिए बार पर क्लिक करें' : 'click a bar to focus on that head'}
      </div>

      <div style={{ display: 'grid', gap: 9 }}>
        {rows.map((r) => {
          const width = Math.max(1.5, (r.completed / max) * 100)
          const dimmed = selectedId && selectedId !== r.id
          const inside = width >= 82 // outside label would run off the track
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r.id)}
              title={`${personName(r, lang)} — ${r.completed} ${hi ? 'पूरे' : 'completed'}, ${r.onTimeRate}% ${hi ? 'समय पर' : 'on time'}`}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(72px, 132px) 1fr',
                alignItems: 'center', gap: 10, background: 'transparent',
                padding: '3px 0', textAlign: 'left', width: '100%', minHeight: 24,
              }}
            >
              <span
                style={{
                  fontSize: 12.5, color: dimmed ? C.faint : C.text, fontWeight: dimmed ? 500 : 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {personName(r, lang)}
              </span>
              <span style={{ position: 'relative', display: 'block', height: 16 }}>
                <span
                  style={{
                    display: 'block', height: 16, width: `${width}%`,
                    background: dimmed ? C.borderStrong : C.maroon,
                    borderRadius: '0 4px 4px 0', // rounded data-end, square at the baseline
                  }}
                />
                <span
                  style={{
                    position: 'absolute', top: 0, lineHeight: '16px',
                    fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    ...(inside
                      ? { right: 8, color: '#fff' }
                      : { left: `calc(${width}% + 7px)`, color: C.tl }),
                  }}
                >
                  {r.completed}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// --- status chip: the colour never carries the meaning on its own ------------
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
