import { useEffect } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import Icon from './Icon'

// Full-screen look at a photo. Thumbnails in this app are 80–90px, which is
// enough to see THAT there is a photo and not much else — and the whole point of
// the before/after rule is that someone can check the work.
//
// `photos` is the set the thumbnail belongs to, so the arrows step through the
// batch instead of forcing a close-and-reopen for each one.
export default function PhotoViewer({ photos = [], index = 0, onIndex, onClose }) {
  const C = useColors()
  const t = useT()
  const many = photos.length > 1
  const step = (d) => onIndex?.((index + d + photos.length) % photos.length)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (many && e.key === 'ArrowRight') step(1)
      if (many && e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!photos.length) return null
  const btn = {
    width: 42, height: 42, borderRadius: '50%', background: 'rgba(0,0,0,0.55)',
    display: 'grid', placeItems: 'center', flexShrink: 0,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16,
      }}
    >
      <button type="button" onClick={onClose} aria-label={t.close} style={{ ...btn, position: 'absolute', top: 16, right: 16 }}>
        <Icon name="close" size={20} color="#fff" />
      </button>

      {many && (
        <button type="button" onClick={(e) => { e.stopPropagation(); step(-1) }} aria-label={t.prevMonth} style={btn}>
          <Icon name="chevronLeft" size={20} color="#fff" />
        </button>
      )}

      <img
        src={photos[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '86vh', objectFit: 'contain', borderRadius: 10 }}
      />

      {many && (
        <button type="button" onClick={(e) => { e.stopPropagation(); step(1) }} aria-label={t.nextMonth} style={btn}>
          <Icon name="chevronRight" size={20} color="#fff" />
        </button>
      )}

      {many && (
        <div style={{ position: 'absolute', bottom: 18, color: '#fff', fontSize: 13, fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 999 }}>
          {index + 1} / {photos.length}
        </div>
      )}
    </div>
  )
}
