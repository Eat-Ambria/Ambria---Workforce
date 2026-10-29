import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../../context/LangContext'
import Icon from './Icon'

// The camera, drawn inside the page instead of handed to the phone's camera app.
//
// Why this exists: `<input capture>` launches the system camera as a separate
// app. On the older, low-memory phones the staff use, Android frees memory for
// it by killing the browser behind it — and when the camera returns, there is
// no page left to give the photo to. The tab reloads, the photo is gone, and
// Android says "Unable to complete previous operation due to low memory". It is
// not a bug in this app and no amount of compression fixes it, because the
// photo never arrives. Keeping the camera on this page means the browser is
// never sent to the background, so there is nothing for Android to kill.
//
// The resolution asked for is modest on purpose: the photo is compressed to
// about 100 KB on upload anyway, and a 4K stream on a 2 GB phone is the very
// memory pressure this is here to avoid.
//
// Zoom and crop, kept light. Zoom uses the camera's own zoom where the phone
// offers one (getCapabilities().zoom): the camera does the work and the frame
// stays sharp. Where it does not, the preview is scaled with CSS (the GPU does
// that for free) and the shot keeps only the middle of the frame. Crop works on
// the one canvas the shot was drawn to: it is shown as it is, and cutting it is
// one more drawImage of a ~1024px picture. No second stream, no extra decode,
// no library.
//
// Calls `onCapture(file)` with a JPEG File, or `onUnavailable()` when the camera
// cannot be opened here at all — permission refused, no camera, an in-app
// browser without camera access — so the caller can fall back to the old way.

// The photo leaves here already at the size it is stored at — long side 1024,
// about 100 KB — so the upload's compressor sees a small JPEG and passes it
// straight through (compressImage returns early under its target). Before, a
// 1280px frame at quality 0.9 went into a loop that could re-encode it sixteen
// times: on a 2 GB phone, the slowest and most memory-hungry step in the whole
// flow, run right after the camera had been using the memory.
const LONG_SIDE = 1024
const TARGET_BYTES = 100 * 1024
const QUALITIES = [0.72, 0.62, 0.52, 0.44]

const encode = (canvas, q) => new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', q))

// Encode `canvas` to a JPEG under TARGET_BYTES. Shrinks the canvas it is given.
async function toSmallJpeg(canvas) {
  let blob = null
  for (const q of QUALITIES) {
    blob = await encode(canvas, q)
    if (blob && blob.size <= TARGET_BYTES) break
  }
  // A cluttered room can stay over target at every quality. Shrinking here,
  // on a canvas already this small, is cheap; leaving it over would send it
  // into the upload's compressor, which decodes the photo again from scratch
  // — the expensive step this screen is built to skip. Guaranteed under.
  let shrink = 3
  while (blob && blob.size > TARGET_BYTES && shrink-- > 0) {
    const w = Math.round(canvas.width * 0.85)
    const h = Math.round(canvas.height * 0.85)
    const small = document.createElement('canvas')
    small.width = w; small.height = h
    small.getContext('2d').drawImage(canvas, 0, 0, w, h)
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(small, 0, 0)
    small.width = 0; small.height = 0
    blob = await encode(canvas, QUALITIES[QUALITIES.length - 1])
  }
  return blob
}

// Digital zoom stops here: the stream is ~1024px wide, so at 3x the shot is
// already only ~340px across. Past that it is blur, not detail.
const DIGITAL_MAX = 3
const HW_MAX = 8
const MIN_CROP = 0.12           // the crop box never gets smaller than this
const FULL = { x: 0, y: 0, w: 1, h: 1 }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const canUseInPageCamera = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export default function InPageCamera({ onCapture, onClose, onUnavailable }) {
  const { lang } = useLang()
  const hi = lang === 'hi'
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const shotRef = useRef(null)    // the one canvas the photo lives on until it is used
  const stageRef = useRef(null)
  const alive = useRef(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('live')       // 'live' | 'review'
  const [hw, setHw] = useState(null)             // the camera's own zoom range, if it has one
  const [zoom, setZoom] = useState(1)
  const [crop, setCrop] = useState(FULL)
  const [stage, setStage] = useState({ w: 0, h: 0 })

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    // Detach as well as stop: a <video> still pointing at a stopped stream can
    // hold its last decoded frames until it is collected, and on these phones
    // "eventually" is after the upload has asked for its own memory.
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const releaseShot = () => {
    const c = shotRef.current
    if (c) { c.width = 0; c.height = 0 }
  }

  function start() {
    setReady(false)
    navigator.mediaDevices.getUserMedia({
      audio: false,
      // Small and slow on purpose: a proof photo needs neither 4K nor 30 fps,
      // and every frame the phone decodes for the preview is memory it is not
      // using to stay alive.
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1024 }, height: { ideal: 768 },
        frameRate: { ideal: 15, max: 24 },
      },
    }).then((stream) => {
      if (!alive.current) { stream.getTracks().forEach((tr) => tr.stop()); return }
      streamRef.current = stream
      // `ideal` is a request, not a rule — some phones answer it with their
      // camera's full 4K stream anyway, which is the memory this whole screen
      // exists to save. Checked once it is running and capped if so; a phone
      // that refuses the cap keeps what it gave, which still works.
      const track = stream.getVideoTracks()[0]
      const got = track?.getSettings?.() || {}
      if (Math.max(got.width || 0, got.height || 0) > 1600) {
        track.applyConstraints({ width: { max: 1280 }, height: { max: 1280 } }).catch(() => {})
      }
      const z = track?.getCapabilities?.()?.zoom
      if (z && z.max > z.min) {
        setHw({ min: z.min, max: Math.min(z.max, HW_MAX) })
        setZoom(got.zoom || z.min)
      } else {
        setHw(null)
        setZoom(1)
      }
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.play().catch(() => {})
      }
    }).catch((e) => {
      // 'denied' is the one worth naming: it stays denied on every visit until
      // somebody changes it in the browser's site settings, and the fallback
      // — the phone's camera app — is the path that loses the photo.
      if (alive.current) onUnavailable?.(e?.name === 'NotAllowedError' ? 'denied' : 'failed')
    })
  }

  useEffect(() => {
    alive.current = true
    start()
    return () => { alive.current = false; stop(); releaseShot() }
    // opened once per mount; the callbacks are read as they are at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The stage size, for fitting the photo and its crop box on screen.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [mode])

  // ---- zoom ---------------------------------------------------------------

  // The camera's zoom is sent one change at a time: a pinch fires dozens of
  // moves a second, and queuing a constraint change for each makes a slow
  // phone's preview stutter. Only the latest value waiting is ever sent.
  const zoomBusy = useRef(false)
  const zoomNext = useRef(null)
  function sendHwZoom(z) {
    zoomNext.current = z
    if (zoomBusy.current) return
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    zoomBusy.current = true
    const value = zoomNext.current
    zoomNext.current = null
    track.applyConstraints({ advanced: [{ zoom: value }] }).catch(() => {}).finally(() => {
      zoomBusy.current = false
      if (zoomNext.current != null) sendHwZoom(zoomNext.current)
    })
  }

  const zMin = hw ? hw.min : 1
  const zMax = hw ? hw.max : DIGITAL_MAX
  function zoomTo(z) {
    const next = Math.round(clamp(z, zMin, zMax) * 10) / 10
    setZoom(next)
    if (hw) sendHwZoom(next)
  }
  const presets = [1, 2, 3, 5].filter((p) => p >= zMin && p <= zMax)
  if (!presets.length) presets.push(zMin)

  const pinch = useRef(null)
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const onTouchStart = (e) => {
    if (e.touches.length === 2) pinch.current = { d: dist(e.touches) || 1, z: zoom }
  }
  const onTouchMove = (e) => {
    if (e.touches.length !== 2 || !pinch.current) return
    zoomTo(pinch.current.z * (dist(e.touches) / pinch.current.d))
  }
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinch.current = null }

  // ---- shoot / review -----------------------------------------------------

  function shoot() {
    const v = videoRef.current
    const c = shotRef.current
    if (!v || !v.videoWidth || !c || busy) return
    // With the camera's own zoom the frame is already zoomed. Without it, keep
    // the middle 1/zoom of the frame — what the scaled preview was showing.
    const z = hw ? 1 : zoom
    const sw = v.videoWidth / z
    const sh = v.videoHeight / z
    const sx = (v.videoWidth - sw) / 2
    const sy = (v.videoHeight - sh) / 2
    const scale = Math.min(1, LONG_SIDE / Math.max(sw, sh))
    c.width = Math.round(sw * scale)
    c.height = Math.round(sh * scale)
    c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height)
    // The frame is on the canvas; the camera is not needed while they crop.
    stop()
    setCrop(FULL)
    setMode('review')
  }

  function retake() {
    releaseShot()
    setMode('live')
    start()
  }

  async function usePhoto() {
    const c = shotRef.current
    if (!c || !c.width || busy) return
    setBusy(true)
    const cropped = crop.w < 0.99 || crop.h < 0.99
    let out = c
    if (cropped) {
      const sx = Math.round(crop.x * c.width)
      const sy = Math.round(crop.y * c.height)
      const sw = Math.max(1, Math.round(crop.w * c.width))
      const sh = Math.max(1, Math.round(crop.h * c.height))
      out = document.createElement('canvas')
      out.width = sw; out.height = sh
      out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
    }
    const blob = await toSmallJpeg(out)
    out.width = 0; out.height = 0
    releaseShot()   // release the pixels before the upload
    if (!blob) { setBusy(false); onUnavailable?.('failed'); return }
    onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }

  // The photo, fitted into the stage.
  const shot = shotRef.current
  let fit = { w: 0, h: 0 }
  if (mode === 'review' && shot?.width && stage.w && stage.h) {
    const s = Math.min((stage.w - 32) / shot.width, (stage.h - 32) / shot.height)
    fit = { w: Math.round(shot.width * s), h: Math.round(shot.height * s) }
  }

  const drag = useRef(null)
  const grab = (kind) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { kind, x: e.clientX, y: e.clientY, box: crop }
  }
  const onDrag = (e) => {
    const d = drag.current
    if (!d || !fit.w) return
    const dx = (e.clientX - d.x) / fit.w
    const dy = (e.clientY - d.y) / fit.h
    let { x, y, w, h } = d.box
    if (d.kind === 'move') {
      x = clamp(x + dx, 0, 1 - w)
      y = clamp(y + dy, 0, 1 - h)
    } else {
      if (d.kind.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN_CROP); w += x - nx; x = nx }
      if (d.kind.includes('e')) w = clamp(w + dx, MIN_CROP, 1 - x)
      if (d.kind.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN_CROP); h += y - ny; y = ny }
      if (d.kind.includes('s')) h = clamp(h + dy, MIN_CROP, 1 - y)
    }
    setCrop({ x, y, w, h })
  }
  const endDrag = () => { drag.current = null }

  function close() { stop(); releaseShot(); onClose?.() }

  const roundBtn = {
    width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: 'rgba(255,255,255,0.14)', border: 'none',
  }
  // a 36px target around a 16px handle: big enough for a thumb
  const corner = (kind, pos) => (
    <span
      key={kind}
      onPointerDown={grab(kind)}
      style={{
        position: 'absolute', width: 36, height: 36, ...pos,
        display: 'grid', placeItems: 'center', touchAction: 'none',
      }}
    >
      <span style={{ width: 16, height: 16, background: '#fff', borderRadius: 3, boxShadow: '0 0 3px rgba(0,0,0,0.6)' }} />
    </span>
  )

  // The active preset: the largest one at or under the current zoom, labelled
  // with the exact value when a pinch has left it between two.
  const activePreset = [...presets].reverse().find((p) => zoom >= p - 0.05) ?? presets[0]

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      <div
        ref={stageRef}
        onTouchStart={mode === 'live' ? onTouchStart : undefined}
        onTouchMove={mode === 'live' ? onTouchMove : undefined}
        onTouchEnd={mode === 'live' ? onTouchEnd : undefined}
        style={{
          flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
          display: 'grid', placeItems: 'center', touchAction: 'none',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedData={() => setReady(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain', background: '#000',
            display: mode === 'live' ? 'block' : 'none',
            // digital zoom: a GPU scale of the preview, nothing re-drawn
            transform: !hw && zoom > 1 ? `scale(${zoom})` : undefined,
          }}
        />

        {/* Always in the page so the shot has somewhere to be drawn; shown
            only while it is being reviewed. */}
        <div
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'relative', width: fit.w, height: fit.h, overflow: 'hidden',
            display: mode === 'review' ? 'block' : 'none', touchAction: 'none',
          }}
        >
          <canvas ref={shotRef} style={{ width: fit.w, height: fit.h, display: 'block' }} />
          {mode === 'review' && fit.w > 0 && (
            <div
              onPointerDown={grab('move')}
              style={{
                position: 'absolute',
                left: crop.x * fit.w, top: crop.y * fit.h,
                width: crop.w * fit.w, height: crop.h * fit.h,
                border: '2px solid #fff', boxSizing: 'border-box',
                // the dark outside the box is the box's own shadow: one
                // element, no masks to keep in step
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                touchAction: 'none', cursor: 'move',
              }}
            >
              {corner('nw', { left: -18, top: -18 })}
              {corner('ne', { right: -18, top: -18 })}
              {corner('sw', { left: -18, bottom: -18 })}
              {corner('se', { right: -18, bottom: -18 })}
            </div>
          )}
        </div>

        {mode === 'live' && !ready && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            color: '#fff', fontSize: 14, pointerEvents: 'none',
          }}>
            {hi ? 'कैमरा खुल रहा है…' : 'Opening camera…'}
          </div>
        )}

        {mode === 'live' && ready && presets.length > 1 && (
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 6, padding: 4, borderRadius: 999, background: 'rgba(0,0,0,0.45)',
          }}>
            {presets.map((p) => {
              const on = p === activePreset
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => zoomTo(p)}
                  aria-label={`${p}x zoom`}
                  style={{
                    minWidth: 40, height: 36, padding: '0 8px', borderRadius: 999, border: 'none',
                    background: on ? 'rgba(255,255,255,0.25)' : 'transparent',
                    color: on ? '#FFD54F' : '#fff', fontSize: 13, fontWeight: 600,
                  }}
                >
                  {on && Math.abs(zoom - p) > 0.05 ? zoom.toFixed(1) : p}×
                </button>
              )
            })}
          </div>
        )}

        {mode === 'review' && (
          <div style={{
            position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center',
            color: '#fff', fontSize: 13, pointerEvents: 'none', textShadow: '0 1px 3px #000',
          }}>
            {hi ? 'काटने के लिए कोने खींचें' : 'Drag the corners to crop'}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px calc(22px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(0,0,0,0.85)',
      }}>
        <button type="button" onClick={close} aria-label={hi ? 'बंद करें' : 'Close'} style={roundBtn}>
          <Icon name="close" size={22} color="#fff" />
        </button>

        {mode === 'live' ? (
          <button
            type="button"
            onClick={shoot}
            disabled={!ready || busy}
            aria-label={hi ? 'फ़ोटो लें' : 'Take photo'}
            style={{
              width: 76, height: 76, borderRadius: '50%',
              background: '#fff', border: '5px solid rgba(255,255,255,0.35)',
              backgroundClip: 'padding-box', opacity: ready && !busy ? 1 : 0.5,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={usePhoto}
            disabled={busy}
            aria-label={hi ? 'यह फ़ोटो लें' : 'Use photo'}
            style={{
              width: 76, height: 76, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: '#2E7D32', border: '5px solid rgba(255,255,255,0.35)',
              backgroundClip: 'padding-box', opacity: busy ? 0.5 : 1,
            }}
          >
            <Icon name="check" size={32} color="#fff" />
          </button>
        )}

        {mode === 'review' ? (
          <button type="button" onClick={retake} disabled={busy} aria-label={hi ? 'दोबारा लें' : 'Retake'} style={roundBtn}>
            <Icon name="refresh" size={22} color="#fff" />
          </button>
        ) : (
          // keeps the shutter centred
          <span style={{ width: 48 }} />
        )}
      </div>
    </div>,
    document.body,
  )
}
