import { useEffect, useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import Icon from '../common/Icon'

// Pull down from the top to refresh.
//
// The browser's own pull-to-refresh is switched off for this app
// (overscroll-behavior-y: none in index.css) and an installed app never had it
// anyway — so on a phone there was no way to say "show me the latest" short of
// closing the app. This puts one back, drawn by the app.
//
// It reloads the page. Every screen reads fresh on load, so a reload is the one
// refresh that is right everywhere without each page having to opt in; the
// service worker serves the app itself from the phone, so it is quick.
//
// It never starts with a dialog open — a half-filled form would be lost — or
// anywhere but the very top of the page, where a downward pull cannot be a
// scroll.

const TRIGGER = 70   // how far, after damping, a pull has to go to refresh
const MAX = 110      // and the furthest the circle follows the finger

export default function PullToRefresh() {
  const C = useColors()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0
    const dialogOpen = () => !!document.querySelector('.modal-scroll')

    const onStart = (e) => {
      if (refreshing || e.touches.length !== 1 || !atTop() || dialogOpen()) { startY.current = null; return }
      startY.current = e.touches[0].clientY
    }
    const onMove = (e) => {
      if (startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      // upward, or the page has scrolled under the finger: not a pull
      if (dy <= 0 || !atTop()) { startY.current = null; pullRef.current = 0; setPull(0); return }
      // damped, so the circle lags the finger the way a native one does
      const p = Math.min(MAX, dy * 0.5)
      pullRef.current = p
      setPull(p)
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      if (pullRef.current >= TRIGGER && !dialogOpen()) {
        setRefreshing(true)
        setPull(TRIGGER)
        // a beat so the spin is seen; otherwise the reload looks like a flash
        setTimeout(() => window.location.reload(), 250)
      } else {
        pullRef.current = 0
        setPull(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing])

  if (!pull && !refreshing) return null
  const armed = pull >= TRIGGER
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', left: '50%', top: 0, zIndex: 900,
        transform: `translate(-50%, ${Math.round(pull)}px)`,
        transition: startY.current == null ? 'transform .18s ease' : 'none',
        pointerEvents: 'none',
      }}
    >
      <span
        className={refreshing ? 'ptr-spin' : undefined}
        style={{
          width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: C.card, border: `1px solid ${C.border}`, boxShadow: C.shadowMd,
          opacity: Math.min(1, pull / TRIGGER + 0.2),
        }}
      >
        <Icon
          name="refresh"
          size={20}
          color={armed || refreshing ? C.maroon : C.tl}
          // turns with the pull, a full turn by the time it will fire
          style={refreshing ? undefined : { transform: `rotate(${(pull / TRIGGER) * 360}deg)` }}
        />
      </span>
    </div>
  )
}
