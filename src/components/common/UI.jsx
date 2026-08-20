import { Children } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import Icon from './Icon'

export function Spinner({ size = 22, color }) {
  const C = useColors()
  return (
    <span
      className="spin"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${Math.max(2, size / 10)}px solid ${C.border}`,
        borderTopColor: color || C.maroon,
        borderRadius: '50%',
      }}
    />
  )
}

export function Loader({ label }) {
  const C = useColors()
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 48, gap: 12, color: C.tl }}>
      <Spinner size={32} />
      {label && <span style={{ fontSize: 14 }}>{label}</span>}
    </div>
  )
}

export function Card({ children, style, onClick, className }) {
  const C = useColors()
  return (
    <div
      onClick={onClick}
      // A clickable card lifts by default; anything else has to ask, and now can
      className={[onClick ? 'hoverable' : '', className || ''].filter(Boolean).join(' ') || undefined}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: C.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Button({ children, variant = 'primary', full, disabled, style, ...rest }) {
  const C = useColors()
  const variants = {
    // *Bg tokens, not the text tones: white sits on these, and in dark the
    // text tones are light enough that white on them is unreadable.
    primary: { bg: C.brandBg, fg: '#fff', border: C.brandBg },
    success: { bg: C.successBg, fg: '#fff', border: C.successBg },
    danger: { bg: C.dangerBg, fg: '#fff', border: C.dangerBg },
    ghost: { bg: 'transparent', fg: C.text, border: C.border },
    soft: { bg: C.maroonSoft, fg: C.maroon, border: C.maroonSoft },
  }
  const v = variants[variant] || variants.primary
  const solid = ['primary', 'success', 'danger'].includes(variant)
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.border}`,
        borderRadius: 11,
        padding: '11px 16px',
        fontSize: 14.5,
        fontWeight: 600,
        letterSpacing: '0.01em',
        width: full ? '100%' : undefined,
        opacity: disabled ? 0.5 : 1,
        boxShadow: solid ? C.shadow : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Badge({ children, color, bg }) {
  const C = useColors()
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'flex-start',   // don't stretch when used as a flex child
        flexShrink: 0,
        width: 'fit-content',
        maxWidth: '100%',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        fontSize: 12,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 999,
        color: color || C.text,
        background: bg || C.cardAlt,
        border: `1px solid ${C.border}`,
      }}
    >
      {children}
    </span>
  )
}

export function EmptyState({ icon, title, hint }) {
  const C = useColors()
  const name = typeof icon === 'string' ? icon : 'inbox'
  return (
    <div style={{ textAlign: 'center', padding: '56px 16px', color: C.tl }}>
      <div style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: 18, background: C.cardAlt, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', color: C.faint }}>
        <Icon name={name} size={28} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
      {hint && <div style={{ fontSize: 13, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function Field({ label, children, hint, required, error }) {
  const C = useColors()
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {/* field-level error takes precedence over the hint, shown right here */}
      {error
        ? <span style={{ display: 'block', fontSize: 12, color: C.red, fontWeight: 600, marginTop: 4 }}>{error}</span>
        : hint && <span style={{ display: 'block', fontSize: 12, color: C.tl, marginTop: 4 }}>{hint}</span>}
    </label>
  )
}

export function inputStyle(C) {
  return {
    width: '100%',
    background: C.white,
    color: C.text,
    border: `1px solid ${C.borderStrong}`,
    borderRadius: 10,
    padding: '11px 13px',
    fontSize: 15,
    outline: 'none',
  }
}

// A filter is not a form field. The standard input above is 15px text in 11px
// of padding, sized for something you type into; a row of filters wants to sit
// quietly above the thing it filters. Oval to say so — nothing here is typed,
// every one of them is a choice from a short list.
export function filterStyle(C) {
  return { ...inputStyle(C), padding: '7px 12px', fontSize: 14, borderRadius: 999 }
}

export function ProgressBar({ value = 0, tone, height = 10 }) {
  const C = useColors()
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div style={{ background: C.border, borderRadius: 999, height, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: tone || C.brandBg, borderRadius: 999, transition: 'width .3s ease' }} />
    </div>
  )
}

export function Tabs({ tabs, active, onChange, noMargin }) {
  const C = useColors()
  // Not "is this a phone" but "can five labels sit on one line", which they can
  // from about 560px up.
  const roomy = useMediaQuery('(min-width: 560px)')

  // Pills below that. An underline row cannot wrap — a second row would leave
  // the first row's underlines hanging away from the border — so it scrolled
  // instead, and a tab you have to scroll to find is a tab you do not know is
  // there. Pills wrap, so every tab stays on the screen.
  if (!roomy) {
    return (
      <div style={{
        display: 'grid', gap: 6, marginBottom: noMargin ? 0 : 14,
        gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, tabs.length))}, minmax(0, 1fr))`,
        gridAutoRows: '1fr',
      }}>
        {tabs.map((tab) => {
          const on = active === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              aria-pressed={on}
              style={{
                padding: '7px 10px', borderRadius: 999, lineHeight: 1.3,
                fontSize: 13.5, fontWeight: on ? 700 : 600,
                background: on ? C.brandBg : C.cardAlt,
                color: on ? '#fff' : C.tl,
                border: `1px solid ${on ? C.maroon : C.border}`,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="no-scrollbar" style={{ display: 'flex', gap: 6, marginBottom: noMargin ? 0 : 16, overflowX: 'auto', borderBottom: `1px solid ${C.border}` }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            whiteSpace: 'nowrap', padding: '10px 14px', fontSize: 14, fontWeight: 600, background: 'transparent',
            color: active === tab.key ? C.maroon : C.tl,
            borderBottom: `2px solid ${active === tab.key ? C.maroon : 'transparent'}`,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// A row of choice chips. Never scrolls sideways: these rows all hid their
// scrollbar, so a chip past the right edge had nothing at all to announce it —
// the choice was simply invisible.
//
// On a phone it is a three-column grid rather than free wrapping. Wrapping left
// ragged rows of differently-sized chips that lined up with nothing; fixed
// columns make the second row sit under the first and the block read as one
// control. Fewer than three chips get one column each, so a two-chip row does
// not sit beside a hole. Above 560px there is room to let chips be their own
// width again.
// Caption above, value inside. Folding the label into the first option
// ("Properties — All") is what you do when there is no room for a label — but
// it only holds while nothing is selected. Choose a venue and the option reads
// "Pushpanjali", and the screen no longer says what that dropdown controls.
// The caption costs one 10px line and is always there.
//
// A <label> element, so tapping the caption opens the select: the whole cell
// becomes the tap target, not just the 32px pill.
export function FilterField({ label, children }) {
  const C = useColors()
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: C.faint,
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

export function ChipRow({ children, gap = 8, style }) {
  const roomy = useMediaQuery('(min-width: 560px)')
  const cols = Math.min(3, Math.max(1, Children.count(children)))
  const layout = roomy
    ? { display: 'flex', flexWrap: 'wrap' }
    // 1fr rows: a label that wraps to two lines would otherwise make its own
    // row taller than the rest and the grid would step.
    : { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }
  return <div style={{ ...layout, gap, ...style }}>{children}</div>
}

export function SectionTitle({ children, subtitle, right }) {
  const C = useColors()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '2px 0 18px' }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{children}</h2>
        {subtitle && <p style={{ fontSize: 13.5, color: C.tl, marginTop: 2 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// A pill toggle for a filter row — used wherever a desktop screen has the room
// to show every choice instead of hiding them in a dropdown.
// `dot` paints a small colour disc before the label (venue colours on the valet
// calendar), so the filter and the marks it filters read as one system.
// `check` turns the chip into a checkbox: use it when several can be on at once.
// A single-choice row leaves it off, so the two kinds of row never look alike.
export function FilterChip({ children, active, onClick, dot, dotRing, check }) {
  const C = useColors()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap',
        border: `1.5px solid ${active ? C.maroon : C.border}`,
        background: active ? C.brandBg : C.card,
        color: active ? '#fff' : C.tl,
      }}
    >
      {check && (
        <span
          style={{
            width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center',
            border: `1.5px solid ${active ? 'rgba(255,255,255,0.9)' : C.borderStrong || C.border}`,
            background: active ? 'rgba(255,255,255,0.22)' : 'transparent',
          }}
        >
          {active && <Icon name="check" size={11} color="#fff" />}
        </span>
      )}
      {dot && (
        <span style={{
          width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0,
          boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.65)' : (dotRing ? `inset 0 0 0 1px ${dotRing}` : 'none'),
        }} />
      )}
      {children}
    </button>
  )
}
