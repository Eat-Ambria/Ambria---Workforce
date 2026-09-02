import { useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { uploadPhotos } from '../../lib/storage'
import { Spinner } from './UI'
import Icon from './Icon'
import PhotoViewer from './PhotoViewer'

// Ten per field. There was no ceiling at all, so a single task could carry as
// many photos as somebody kept tapping — each one a full-size upload sitting in
// storage forever, and a review screen nobody can scroll through.
//
// The cap is enforced on the TOTAL, not per pick: eight already there and five
// chosen takes the first two and says so. Silently keeping all thirteen, or
// silently dropping the lot, are both worse than a short sentence.
export const MAX_PHOTOS = 10

// Camera-first photo capture with preview + upload.
// Props:
//   folder     - storage folder (e.g. 'tasks', 'attendance')
//   multiple   - allow more than one photo
//   value      - array of uploaded URLs (controlled)
//   onChange   - (urls[]) => void
//   max        - ceiling on how many this field holds (default MAX_PHOTOS)
export default function PhotoCapture({ folder = 'misc', multiple = true, value = [], onChange, max = MAX_PHOTOS }) {
  const C = useColors()
  const t = useT()
  const camRef = useRef(null)
  const galRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // which thumbnail is open full-size, or null. Everywhere else in the app a
  // photo opens when you tap it; here it was a 72px square and nothing else, so
  // there was no way to check what you had just uploaded before submitting it.
  const [viewAt, setViewAt] = useState(null)

  const room = multiple ? Math.max(0, max - value.length) : 1
  const full = room === 0

  async function handleFiles(files) {
    if (!files || !files.length) return
    const picked = Array.from(files)
    // Trimmed BEFORE the upload, not after: an eleventh photo that is discarded
    // on the way back has still been uploaded and still occupies storage.
    const taking = multiple ? picked.slice(0, room) : picked.slice(-1)
    if (!taking.length) {
      setErr(t.photoLimitReached.replace('{n}', max))
      if (camRef.current) camRef.current.value = ''
      if (galRef.current) galRef.current.value = ''
      return
    }
    setBusy(true)
    setErr(taking.length < picked.length
      ? t.photoLimitTrimmed.replace('{taken}', taking.length).replace('{n}', max)
      : '')
    try {
      const urls = await uploadPhotos(taking, folder)
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
          {value.map((url, i) => (
            <div key={url} style={{ position: 'relative' }}>
              <img
                src={url}
                alt=""
                onClick={() => setViewAt(i)}
                title={t.viewPhoto}
                style={{
                  width: 72, height: 72, objectFit: 'cover', borderRadius: 10,
                  border: `1px solid ${C.border}`, cursor: 'zoom-in', display: 'block',
                }}
              />
              <button
                type="button"
                onClick={() => remove(url)}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                  background: C.dangerBg, color: '#fff', fontSize: 13, lineHeight: '18px',
                }}
                aria-label={t.remove}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          disabled={busy || full}
          style={{ ...btn(C, C.brandBg, '#fff'), opacity: full ? 0.5 : 1 }}
        >
          {busy ? <Spinner size={16} color="#fff" /> : <Icon name="camera" size={18} color="#fff" />} {t.takePhoto}
        </button>
        <button
          type="button"
          onClick={() => galRef.current?.click()}
          disabled={busy || full}
          style={{ ...btn(C, 'transparent', C.text, C.border), opacity: full ? 0.5 : 1 }}
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

      {/* "3 photos added · add more" said nothing about a ceiling, so hitting it
          would arrive as a surprise. The count now reads against the limit, and
          the trailing hint drops once there is no more room. */}
      {multiple && value.length > 0 && (
        <div style={{ fontSize: 11.5, color: full ? C.tl : C.faint, marginTop: 7 }}>
          {value.length}/{max} {value.length === 1 ? t.photoAdded : t.photosAdded}
          {full ? '' : ` · ${t.addMorePhotos}`}
        </div>
      )}

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}

      {viewAt !== null && value[viewAt] && (
        <PhotoViewer
          photos={value}
          index={viewAt}
          onIndex={setViewAt}
          onClose={() => setViewAt(null)}
        />
      )}
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
