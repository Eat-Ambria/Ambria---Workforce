import { useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { uploadPhotos } from '../../lib/storage'
import { Spinner } from './UI'
import Icon from './Icon'

// Camera-first photo capture with preview + upload.
// Props:
//   folder     - storage folder (e.g. 'tasks', 'attendance')
//   multiple   - allow more than one photo
//   value      - array of uploaded URLs (controlled)
//   onChange   - (urls[]) => void
export default function PhotoCapture({ folder = 'misc', multiple = true, value = [], onChange }) {
  const C = useColors()
  const t = useT()
  const camRef = useRef(null)
  const galRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handleFiles(files) {
    if (!files || !files.length) return
    setBusy(true)
    setErr('')
    try {
      const urls = await uploadPhotos(Array.from(files), folder)
      const next = multiple ? [...value, ...urls] : urls.slice(-1)
      onChange?.(next)
    } catch (e) {
      setErr(e.message || 'Upload failed')
    } finally {
      setBusy(false)
      if (camRef.current) camRef.current.value = ''
      if (galRef.current) galRef.current.value = ''
    }
  }

  function remove(url) {
    onChange?.(value.filter((u) => u !== url))
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {value.map((url) => (
            <div key={url} style={{ position: 'relative' }}>
              <img
                src={url}
                alt=""
                style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }}
              />
              <button
                onClick={() => remove(url)}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                  background: C.red, color: '#fff', fontSize: 13, lineHeight: '18px',
                }}
                aria-label="Remove"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => camRef.current?.click()}
          disabled={busy}
          style={btn(C, C.maroon, '#fff')}
        >
          {busy ? <Spinner size={16} color="#fff" /> : <Icon name="camera" size={18} color="#fff" />} {t.takePhoto}
        </button>
        <button
          onClick={() => galRef.current?.click()}
          disabled={busy}
          style={btn(C, 'transparent', C.text, C.border)}
        >
          <Icon name="image" size={18} /> {t.uploadPhoto}
        </button>
      </div>

      {/* capture opens the rear camera on phones. NOTE: no `multiple` here —
          many mobile browsers ignore `capture` when `multiple` is set and fall
          back to the file picker, so the camera would never open. */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

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
