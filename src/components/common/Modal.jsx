import { useEffect } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useIsMobile } from '../../hooks/useMediaQuery'

export default function Modal({ open, onClose, title, children, footer, maxWidth = 480 }) {
  const C = useColors()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="overlay-in"
      style={{
        position: 'fixed',
        inset: 0,
        background: C.overlay,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? 0 : 20,
      }}
    >
      <div
        className="fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card,
          width: '100%',
          maxWidth,
          maxHeight: isMobile ? '92vh' : '88vh',
          borderRadius: isMobile ? '20px 20px 0 0' : 18,
          boxShadow: C.shadowLg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', color: C.tl, fontSize: 22, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="no-scrollbar" style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Desktop-friendly centered variant is achieved by media styling; the sheet
// style above works well on both mobile and desktop for this app.
