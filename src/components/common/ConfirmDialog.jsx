import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import Modal from './Modal'
import { Button } from './UI'
import Icon from './Icon'

// In-app replacement for window.confirm / window.alert.
//
// The browser's own dialog is jarring: it shows the raw origin ("localhost:5173
// says"), ignores the app's language and theme, and on a phone it can look like
// a security warning. This renders the same question inside the app instead.
//
// Usage:  const confirm = useConfirm()
//         if (!(await confirm({ message: t.deleteTaskConfirm }))) return
//
// Resolves true only if the user presses the confirm button; dismissing by the
// close button, the backdrop or Escape resolves false, so the guard above still
// reads as "not confirmed → stop".
const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null)
  // held between renders because the promise is created in one call and settled
  // by a click much later
  const resolveRef = useRef(null)

  const confirm = useCallback((opts) => new Promise((resolve) => {
    // settle any dialog still waiting (can only happen if two are raised at
    // once) so a caller is never left awaiting forever
    resolveRef.current?.(false)
    resolveRef.current = resolve
    setReq(typeof opts === 'string' ? { message: opts } : (opts || {}))
  }), [])

  const settle = useCallback((ok) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setReq(null)
    resolve?.(ok)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && <ConfirmDialog req={req} onSettle={settle} />}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ req, onSettle }) {
  const C = useColors()
  const t = useT()
  // most confirms in this app are deletions, so danger is the default
  const danger = req.danger !== false
  const tone = danger ? C.red : C.maroon

  return (
    <Modal
      open
      onClose={() => onSettle(false)}
      title={req.title || t.confirmTitle}
      maxWidth={430}
      footer={(
        <>
          {!req.hideCancel && (
            <Button variant="ghost" onClick={() => onSettle(false)} style={{ flex: 1 }}>
              {req.cancelLabel || t.cancel}
            </Button>
          )}
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => onSettle(true)}
            style={{ flex: 1 }}
          >
            {req.confirmLabel || (danger ? t.delete : t.ok)}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span
          style={{
            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
            background: danger ? C.rBg : C.maroonSoft,
            display: 'grid', placeItems: 'center',
          }}
        >
          <Icon name="warning" size={19} color={tone} />
        </span>
        <div style={{ minWidth: 0 }}>
          {/* pre-line so a caller can pass a two-line message */}
          <div style={{ fontSize: 14.5, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {req.message}
          </div>
          {req.detail && (
            <div style={{ fontSize: 13, color: C.tl, marginTop: 6, wordBreak: 'break-word' }}>
              {req.detail}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm() needs <ConfirmProvider> above it')
  return ctx
}
