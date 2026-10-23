import { useColors } from '../../context/ThemeContext'

// Shared "Powered by Ambria" footer line. `light` inverts it for use on the
// maroon gradient panels (login, public pages).
export default function PoweredBy({ light = false, style }) {
  const C = useColors()
  return (
    <div
      style={{
        textAlign: 'center',
        fontSize: 11.5,
        letterSpacing: '0.02em',
        color: light ? 'rgba(255,255,255,0.72)' : C.faint,
        padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        ...style,
      }}
    >
      Powered by{' '}
      <span style={{ fontWeight: 700, color: light ? '#fff' : C.tl }}>Ambria</span>
      {/* Which build this phone is running. Small, but it is the only way to
          tell from a screenshot whether a fix has reached somebody yet. */}
      {import.meta.env.VITE_BUILD && (
        <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.75 }}>
          v {import.meta.env.VITE_BUILD}
        </span>
      )}
    </div>
  )
}
