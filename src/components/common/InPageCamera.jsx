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
  }

  useEffect(() => {
    let alive = true
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
    }).then((stream) => {
      if (!alive) { stream.getTracks().forEach((tr) => tr.stop()); return }
      streamRef.current = stream
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.play().catch(() => {})
      }
    }).catch(() => {
      if (alive) onUnavailable?.()
    })
    return () => { alive = false; stop() }
    // opened once per mount; the callbacks are read as they are at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function shoot() {
    const v = videoRef.current
    if (!v || !v.videoWidth || busy) return
    setBusy(true)
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      // the stream goes the moment the frame is taken — holding the camera open
      // behind the upload is memory spent on nothing
      stop()
      // free the canvas's pixels before the upload allocates its own
      canvas.width = 0; canvas.height = 0
      if (!blob) { setBusy(false); onUnavailable?.(); return }
      onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
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
