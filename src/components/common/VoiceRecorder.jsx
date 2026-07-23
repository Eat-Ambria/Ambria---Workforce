import { useEffect, useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { uploadAudio, deleteStorageFile } from '../../lib/storage'
import { Spinner } from './UI'
import Icon from './Icon'
import AudioPlayer from './AudioPlayer'

// Pick a mime type the browser can actually record. Order matters:
// webm/opus is best on Chrome/Firefox/Android; mp4 is Safari/iOS.
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/mp4', ext: 'mp4' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c
  }
  return { mime: '', ext: 'webm' } // let the browser choose
}

// Keep voice notes small: speech-optimized bitrate, a hard length cap, and a
// final size guard. At 32 kbps a 2-min note is ~0.5 MB, so files stay tiny.
const AUDIO_BITRATE = 32000          // 32 kbps — clear for speech, small on disk
const MAX_SECONDS = 120              // auto-stop at 2 minutes
const MAX_BYTES = 5 * 1024 * 1024    // reject anything over 5 MB as a safety net

// Record a short voice note, preview it, then upload on stop.
// Controlled: `value` is the uploaded URL (or ''), `onChange(url)` fires
// after upload and with '' when the recording is removed.
export default function VoiceRecorder({ folder = 'audio', value = '', onChange }) {
  const C = useColors()
  const t = useT()
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [err, setErr] = useState('')

  const supported = typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia

  // Always release the mic + timer on unmount.
  useEffect(() => () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
  }, [])

  async function start() {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const { mime, ext } = pickMime()
      const opts = { audioBitsPerSecond: AUDIO_BITRATE, ...(mime ? { mimeType: mime } : {}) }
      const rec = new MediaRecorder(stream, opts)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        clearInterval(timerRef.current)
        stream.getTracks().forEach((tr) => tr.stop())
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        setRecording(false)
        if (!blob.size) return
        if (blob.size > MAX_BYTES) { setErr(t.voiceTooLong || 'Recording is too large — please record a shorter note'); return }
        setBusy(true)
        try {
          const url = await uploadAudio(blob, folder, ext)
          onChange?.(url)
        } catch (e) {
          setErr(e.message || 'Upload failed')
        } finally {
          setBusy(false)
        }
      }
      recRef.current = rec
      rec.start()
      setSeconds(0)
      setRecording(true)
      let elapsed = 0
      timerRef.current = setInterval(() => {
        elapsed += 1
        setSeconds(elapsed)
        if (elapsed >= MAX_SECONDS) stop() // hard length cap → auto-stop
      }, 1000)
    } catch (e) {
      setErr(e.name === 'NotAllowedError' ? (t.micDenied || 'Microphone permission denied') : (e.message || 'Could not start recording'))
    }
  }

  function stop() {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
  }

  function remove() {
    if (value) deleteStorageFile(value) // discard the just-recorded file
    onChange?.('')
    setSeconds(0)
    setErr('')
  }

  const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const mmss = fmtT(seconds)

  if (!supported) {
    return <div style={{ fontSize: 13, color: C.faint }}>{t.voiceUnsupported || 'Voice recording is not supported on this device.'}</div>
  }

  // Already recorded → show player + re-record option.
  if (value && !recording) {
    return (
      <div>
        <AudioPlayer src={value} />
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={remove} disabled={busy} style={btn(C, 'transparent', C.red, `${C.red}55`)}>
            <Icon name="trash" size={16} color={C.red} /> {t.deleteRecording || 'Delete'}
          </button>
        </div>
        {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
      </div>
    )
  }

  return (
    <div>
      {recording ? (
        <button onClick={stop} style={btn(C, C.red, '#fff')}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: '#fff', display: 'inline-block' }} />
          {t.stopRecording || 'Stop'} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{mmss} / {fmtT(MAX_SECONDS)}</span>
        </button>
      ) : (
        <button onClick={start} disabled={busy} style={btn(C, C.maroon, '#fff')}>
          {busy ? <Spinner size={16} color="#fff" /> : <Icon name="mic" size={18} color="#fff" />}
          {busy ? (t.uploading || 'Uploading…') : (t.recordVoice || 'Record voice note')}
        </button>
      )}
      {!recording && !busy && <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>{t.voiceMaxHint || 'Up to 2 min'}</div>}
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </div>
  )
}

function btn(C, bg, fg, border) {
  return {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: bg,
    color: fg,
    border: `1px solid ${border || bg}`,
    borderRadius: 10,
    padding: '11px 12px',
    fontSize: 14,
    fontWeight: 600,
  }
}
