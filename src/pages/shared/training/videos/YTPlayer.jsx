import { useEffect, useRef, useState } from 'react'
import { loadYT } from '../../../../lib/youtubeApi'
import { useColors } from '../../../../context/ThemeContext'
import Icon from '../../../../components/common/Icon'

const SPEEDS = [0.5, 1, 1.25, 1.5] // members can never exceed 1.5x
const MAX_RATE = 1.5

const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0))
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

// YouTube player with a fully custom control bar:
//  - native YouTube controls hidden (controls: 0, keyboard off)
//  - speed menu limited to <= 1.5x
//  - seek allowed only within the portion already watched (no skipping ahead)
//  - resumes from the last position
const fsSupported = typeof document !== 'undefined' && (document.fullscreenEnabled || document.webkitFullscreenEnabled)

export default function YTPlayer({ videoId, resumeKey, onProgress }) {
  const C = useColors()
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const rootRef = useRef(null)
  const maxRef = useRef(0) // furthest second reached (seek ceiling)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress // always call the latest without re-running the effect

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [maxW, setMaxW] = useState(0)
  const [rate, setRate] = useState(1)
  const [isFs, setIsFs] = useState(false)
  const [started, setStarted] = useState(false) // has the video played at least once

  const readSaved = () => { try { return JSON.parse(localStorage.getItem(resumeKey) || '{}') } catch { return {} } }
  const save = () => {
    const p = playerRef.current
    if (!p || !p.getDuration) return
    const d = p.getDuration() || 0
    const c = p.getCurrentTime() || 0
    if (d && c >= d - 5) { try { localStorage.removeItem(resumeKey) } catch { /* ignore */ } return }
    try { localStorage.setItem(resumeKey, JSON.stringify({ pos: Math.floor(c), max: Math.floor(maxRef.current) })) } catch { /* ignore */ }
  }

  useEffect(() => {
    let player
    let poll
    let cancelled = false

    loadYT().then((YT) => {
      if (cancelled || !containerRef.current) return
      player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: (e) => {
            const saved = readSaved()
            maxRef.current = saved.max || 0
            setMaxW(maxRef.current)
            setDur(e.target.getDuration() || 0)
            if (saved.pos && saved.pos > 3) e.target.seekTo(saved.pos, true)
            if (e.target.getPlaybackRate() > MAX_RATE) e.target.setPlaybackRate(MAX_RATE)
            setRate(e.target.getPlaybackRate())
            setReady(true)
          },
          onStateChange: (e) => {
            const isPlaying = e.data === YT.PlayerState.PLAYING
            setPlaying(isPlaying)
            if (isPlaying) setStarted(true)
            if (e.data === YT.PlayerState.ENDED) {
              onProgressRef.current?.(1) // watched to the end
              try { localStorage.removeItem(resumeKey) } catch { /* ignore */ }
            }
          },
          onPlaybackRateChange: (e) => {
            let r = e.target.getPlaybackRate()
            if (r > MAX_RATE) { e.target.setPlaybackRate(MAX_RATE); r = MAX_RATE }
            setRate(r)
          },
        },
      })
      playerRef.current = player

      poll = setInterval(() => {
        const p = playerRef.current
        if (!p || !p.getCurrentTime) return
        const c = p.getCurrentTime() || 0
        const d = p.getDuration() || 0
        if (d) setDur(d)
        if (c > maxRef.current) { maxRef.current = c; setMaxW(c) } // watching extends the ceiling
        if (d) onProgressRef.current?.(Math.min(1, maxRef.current / d)) // report furthest-watched fraction
        setCur(c)
        if (p.getPlaybackRate && p.getPlaybackRate() > MAX_RATE) p.setPlaybackRate(MAX_RATE)
      }, 250)
    })

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      save()
      if (player && player.destroy) { try { player.destroy() } catch { /* ignore */ } }
      playerRef.current = null
    }
  }, [videoId, resumeKey])

  const toggle = () => {
    const p = playerRef.current
    if (!p) return
    if (playing) p.pauseVideo(); else p.playVideo()
  }

  const seekFromEvent = (clientX, el) => {
    const p = playerRef.current
    if (!p || !dur) return
    const rect = el.getBoundingClientRect()
    let frac = (clientX - rect.left) / rect.width
    frac = Math.max(0, Math.min(1, frac))
    let target = frac * dur
    if (target > maxRef.current) target = maxRef.current // can't scrub past what's been watched
    p.seekTo(target, true)
    setCur(target)
  }

  const setSpeed = (r) => {
    const p = playerRef.current
    if (!p) return
    p.setPlaybackRate(r)
    setRate(r)
  }

  // fullscreen the whole player (video + our controls), not just the iframe
  useEffect(() => {
    const onFs = () => setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs)
    }
  }, [])

  const toggleFs = () => {
    const el = rootRef.current
    if (!el) return
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen
      if (req) req.call(el)
    }
  }

  const curFrac = dur ? (cur / dur) * 100 : 0
  const maxFrac = dur ? Math.min(100, (maxW / dur) * 100) : 0

  return (
    <div ref={rootRef} style={isFs ? { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#000' } : undefined}>
      <div style={isFs
        ? { position: 'relative', flex: 1, minHeight: 0, background: '#000' }
        : { position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {/* transparent blocker: stops clicks reaching YouTube (no click-to-play) */}
        <div style={{ position: 'absolute', inset: 0 }} />
        {/* poster before first play — covers YouTube's own poster + red play icon */}
        {!started && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: '#000', backgroundImage: `url(https://img.youtube.com/vi/${videoId}/hqdefault.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
          </div>
        )}
        {/* center play/pause toggle — faded while playing so it doesn't block the view */}
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <button
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = 1 }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = playing ? 0.35 : 1 }}
            style={{ pointerEvents: 'auto', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.4)', opacity: playing ? 0.35 : 1, transition: 'opacity .2s' }}
          >
            <Icon name={playing ? 'pause' : 'play'} size={28} color={C.maroon} fill={C.maroon} />
          </button>
        </div>
      </div>

      {/* custom control bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: isFs ? 0 : 10, padding: isFs ? '10px 14px' : 0, background: isFs ? C.card : 'transparent' }}>
        <button onClick={toggle} style={{ width: 34, height: 34, borderRadius: 9, background: C.maroonSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={playing ? 'pause' : 'play'} size={16} color={C.maroon} fill={C.maroon} />
        </button>
        <span style={{ fontSize: 12, color: C.tl, fontVariantNumeric: 'tabular-nums', minWidth: 82, flexShrink: 0 }}>{fmt(cur)} / {fmt(dur)}</span>

        <div
          onClick={(e) => seekFromEvent(e.clientX, e.currentTarget)}
          onPointerMove={(e) => { if (e.buttons === 1) seekFromEvent(e.clientX, e.currentTarget) }}
          style={{ position: 'relative', flex: 1, height: 8, borderRadius: 999, background: C.border, cursor: 'pointer', touchAction: 'none' }}
          title="You can rewind within the watched part; skipping ahead is disabled"
        >
          {/* watched / seekable region */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${maxFrac}%`, background: C.maroonSoft, borderRadius: 999 }} />
          {/* played fill */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${curFrac}%`, background: C.maroon, borderRadius: 999 }} />
          {/* handle */}
          <span style={{ position: 'absolute', left: `calc(${curFrac}% - 6px)`, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', background: C.maroon, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
        </div>

        <select
          value={rate}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ fontSize: 12, fontWeight: 700, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 6px', flexShrink: 0 }}
        >
          {SPEEDS.map((r) => <option key={r} value={r}>{r}x</option>)}
        </select>

        {fsSupported && (
          <button onClick={toggleFs} title={isFs ? 'Exit full screen' : 'Full screen'} aria-label="Full screen" style={{ width: 34, height: 34, borderRadius: 9, background: C.card, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name={isFs ? 'minimize' : 'maximize'} size={16} color={C.tl} />
          </button>
        )}
      </div>
    </div>
  )
}
