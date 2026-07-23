import { useEffect, useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import Icon from './Icon'

// Compact themed play/pause player for a single audio URL.
// Custom UI (not the native <audio controls>) so it matches the app's
// look in light + dark and the SVG-only icon rule.
export default function AudioPlayer({ src, label }) {
  const C = useColors()
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(0)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setCur(a.currentTime)
    const onMeta = () => setDur(isFinite(a.duration) ? a.duration : 0)
    const onEnd = () => { setPlaying(false); setCur(0) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('durationchange', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [src])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  function seek(e) {
    const a = audioRef.current
    if (!a || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    a.currentTime = ratio * dur
    setCur(a.currentTime)
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const pct = dur ? (cur / dur) * 100 : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px' }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        style={{ width: 34, height: 34, borderRadius: '50%', background: C.maroon, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} color="#fff" fill="#fff" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {label && <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 4 }}>{label}</div>}
        <div onClick={seek} style={{ height: 6, borderRadius: 3, background: C.border, cursor: 'pointer', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: C.maroon, borderRadius: 3 }} />
        </div>
      </div>
      <span style={{ fontSize: 12, color: C.tl, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {fmt(cur)}{dur ? ` / ${fmt(dur)}` : ''}
      </span>
    </div>
  )
}
