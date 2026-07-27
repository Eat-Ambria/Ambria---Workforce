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
    </div>
  )
}
