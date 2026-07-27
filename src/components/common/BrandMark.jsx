// The Ambria mark on a black tile. Used by the header and the login screen, so
// the logo only ever has to change in one place (plus public/icons/).
export default function BrandMark({ size = 32, radius, style }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.28),
        background: '#000',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}icons/logo-mark.png`}
        alt="Ambria"
        style={{ width: Math.round(size * 0.5), display: 'block' }}
      />
    </div>
  )
}
