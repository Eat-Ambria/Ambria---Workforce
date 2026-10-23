import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import Icon from './Icon'
import { Spinner } from './UI'
import { thumbFor, fullFor } from '../../lib/thumbs'

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

  // Which full-size photos have arrived. Until one has, its small preview is
  // shown in its place, scaled up — reported from a phone: tap a photo, get a
  // black screen while the full one downloads, tap again to see what is going
  // on, and that tap lands on the backdrop and closes it. Then the next tap on
  // the thumbnail "opens by itself", because by now the photo is cached.
  const [loaded, setLoaded] = useState(() => new Set())
  const url = photos[index]
  // the copy already on this phone, when it was taken this visit — opens at once
  const src = fullFor(url)
  const ready = loaded.has(src)
  const preview = thumbFor(url)
  const hasPreview = preview !== url

  // A backdrop tap in the first moment after opening is the opening tap still
  // arriving, or a nervous second one — not a request to close. Buttons still
  // close at once; only the bare backdrop waits.
  // And not at all while the photo is still on its way: a tap then is somebody
  // wondering where it is, not asking to leave. The ✕ always closes.
  const openedAt = useRef(Date.now())
  const closeFromBackdrop = () => {
    if (!ready) return
    if (Date.now() - openedAt.current > 450) onClose?.()
  }

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

  // Straight onto the body. `position: fixed` is only fixed to the viewport
  // while no ancestor has a transform — the modal's own open animation has one,
  // and a z-index is only ever compared inside its own stacking context, which
  // a modal is. Opened from inside one, this viewer was sized and stacked by the
  // dialog it was trying to cover. At body level neither can reach it.
  return createPortal(
    <div
      onClick={closeFromBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.88)',
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

      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', display: 'grid', placeItems: 'center', minWidth: 0 }}>
        {/* the full photo, hidden until it has actually arrived */}
        <img
          key={src}
          src={src}
          alt=""
          decoding="async"
          onLoad={() => setLoaded((s) => new Set(s).add(src))}
          style={{
            maxWidth: '100%', maxHeight: '86vh', objectFit: 'contain', borderRadius: 10,
            display: ready ? 'block' : 'none',
          }}
        />
        {!ready && (hasPreview ? (
          // this visit's thumbnail, stretched: soft, but it is the right photo,
          // on screen at once, and something to look at rather than to tap
          <img
            src={preview}
            alt=""
            style={{ width: 'min(86vw, 520px)', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, filter: 'blur(1px)' }}
          />
        ) : (
          <div style={{ width: 'min(86vw, 420px)', height: 260, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 10, color: '#fff', fontSize: 13.5 }}>
            <Spinner size={28} color="#fff" />
            <span>{t.loadingPhoto || 'Loading photo…'}</span>
          </div>
        ))}
        {!ready && hasPreview && (
          <span style={{ position: 'absolute', bottom: 12, right: 12 }}><Spinner size={20} color="#fff" /></span>
        )}
      </div>

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
    </div>,
    document.body
  )
}
