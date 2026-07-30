import { useEffect, useRef } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useIsMobile } from '../../hooks/useMediaQuery'

// Modals can stack — a confirm dialog opens on top of the form that raised it.
// A shared stack keeps the two from fighting: only the topmost closes on Escape,
// and the body scroll lock is released by the last one to unmount, not the first.
const stack = []

export default function Modal({ open, onClose, title, children, footer, maxWidth = 480 }) {
  const C = useColors()
  const t = useT()
  const isMobile = useIsMobile()

  const idRef = useRef({})
  useEffect(() => {
    if (!open) return
    const me = idRef.current
    stack.push(me)
    // ignore Escape unless this is the frontmost modal
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (stack[stack.length - 1] !== me) return
      onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(me)
      if (i > -1) stack.splice(i, 1)
      if (stack.length === 0) document.body.style.overflow = ''
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
        zIndex: 1000 + stack.length,
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
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', color: C.tl, fontSize: 22, lineHeight: 1 }}
            aria-label={t.close}
          >
            ×
          </button>
        </div>

        {/* scrollbar left visible on purpose: tall forms (repair request, new
            user) overflow, and a hidden bar makes them look truncated */}
        <div className="modal-scroll" style={{ padding: 18, overflowY: 'auto', flex: 1, overscrollBehavior: 'contain' }}>
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
