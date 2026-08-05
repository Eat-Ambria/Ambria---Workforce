import { useEffect } from 'react'
import { useColors } from '../../context/ThemeContext'
import Icon from './Icon'

// A message that confirms something happened and then gets out of the way.
//
// A save that changes nothing visible leaves you wondering whether it worked.
// A dialog would make you dismiss it, which is a second job for a thing that is
// only telling you good news — so this floats above the page and leaves on its
// own. It sits above the sticky footer, because that is where the button you
// just pressed lives and that is where your eye already is.
export default function Toast({ message, tone = 'success', onDone, ms = 2600 }) {
  const C = useColors()

  useEffect(() => {
    if (!onDone) return undefined
    const id = setTimeout(onDone, ms)
    return () => clearTimeout(id)
  }, [onDone, ms, message])

  const ink = tone === 'error' ? C.red : C.green
  const bg = tone === 'error' ? C.rBg : C.gBg

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
        zIndex: 900, display: 'flex', alignItems: 'center', gap: 9,
        background: bg, color: ink,
        border: `1px solid ${ink}33`, borderRadius: 999,
        padding: '10px 18px 10px 14px', boxShadow: C.shadowLg || C.shadow,
        fontSize: 13.5, fontWeight: 700, maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <Icon name={tone === 'error' ? 'warning' : 'check'} size={16} color={ink} />
      {message}
    </div>
  )
}
