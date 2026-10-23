import { useEffect, useRef, useState } from 'react'
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

export const canUseInPageCamera = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export default function InPageCamera({ onCapture, onClose, onUnavailable }) {
  const { lang } = useLang()
  const hi = lang === 'hi'
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    // Detach as well as stop: a <video> still pointing at a stopped stream can
    // hold its last decoded frames until it is collected, and on these phones
    // "eventually" is after the upload has asked for its own memory.
    if (videoRef.current) videoRef.current.srcObject = null
  }

  useEffect(() => {
    let alive = true
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
      if (!alive) { stream.getTracks().forEach((tr) => tr.stop()); return }
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
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.play().catch(() => {})
      }
    }).catch((e) => {
      // 'denied' is the one worth naming: it stays denied on every visit until
      // somebody changes it in the browser's site settings, and the fallback
      // — the phone's camera app — is the path that loses the photo.
      if (alive) onUnavailable?.(e?.name === 'NotAllowedError' ? 'denied' : 'failed')
    })
    return () => { alive = false; stop() }
    // opened once per mount; the callbacks are read as they are at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function shoot() {
    const v = videoRef.current
    if (!v || !v.videoWidth || busy) return
    setBusy(true)
    const scale = Math.min(1, LONG_SIDE / Math.max(v.videoWidth, v.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.videoWidth * scale)
    canvas.height = Math.round(v.videoHeight * scale)
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    // The frame is on the canvas; the camera is not needed for the encode.
    // Stopped before it, not after, so the two never hold memory at once.
    stop()
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
    canvas.width = 0; canvas.height = 0   // release the pixels before the upload
    if (!blob) { setBusy(false); onUnavailable?.('failed'); return }
    onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }

  function close() { stop(); onClose?.() }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        onLoadedData={() => setReady(true)}
        style={{ flex: 1, width: '100%', minHeight: 0, objectFit: 'contain', background: '#000' }}
      />

      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: '#fff', fontSize: 14, pointerEvents: 'none',
        }}>
          {hi ? 'कैमरा खुल रहा है…' : 'Opening camera…'}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 28px calc(22px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(0,0,0,0.85)',
      }}>
        <button
          type="button"
          onClick={close}
          aria-label={hi ? 'बंद करें' : 'Close'}
          style={{
            width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'rgba(255,255,255,0.14)', border: 'none',
          }}
        >
          <Icon name="close" size={22} color="#fff" />
        </button>

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

        {/* keeps the shutter centred */}
        <span style={{ width: 48 }} />
      </div>
    </div>,
    document.body,
  )
}
