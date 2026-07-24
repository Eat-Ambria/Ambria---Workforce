import { useColors } from '../../context/ThemeContext'
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

export function Card({ children, style, onClick }) {
  const C = useColors()
  return (
    <div
      onClick={onClick}
      className={onClick ? 'hoverable' : undefined}
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
    primary: { bg: C.maroon, fg: '#fff', border: C.maroon },
    success: { bg: C.green, fg: '#fff', border: C.green },
    danger: { bg: C.red, fg: '#fff', border: C.red },
    ghost: { bg: 'transparent', fg: C.text, border: C.border },
    soft: { bg: C.maroonSoft, fg: C.maroon, border: C.maroonSoft },
  }
  const v = variants[variant] || variants.primary
  const solid = ['primary', 'success', 'danger'].includes(variant)
  return (
    <button
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

export function ProgressBar({ value = 0, tone, height = 10 }) {
  const C = useColors()
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div style={{ background: C.border, borderRadius: 999, height, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: tone || C.maroon, borderRadius: 999, transition: 'width .3s ease' }} />
    </div>
  )
}

export function Tabs({ tabs, active, onChange, noMargin }) {
  const C = useColors()
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
