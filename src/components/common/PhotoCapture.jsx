import { useRef, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { uploadPhoto } from '../../lib/storage'
import { compressImage } from '../../lib/imageCompress'
import { makeThumb, rememberThumb, rememberFull, thumbFor } from '../../lib/thumbs'
import { Spinner } from './UI'
import Icon from './Icon'
import PhotoViewer from './PhotoViewer'
import InPageCamera, { canUseInPageCamera } from './InPageCamera'
import { useConfirm } from './ConfirmDialog'

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
  const confirm = useConfirm()
  const camRef = useRef(null)
  const galRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // which thumbnail is open full-size, or null. Everywhere else in the app a
  // photo opens when you tap it; here it was a 72px square and nothing else, so
  // there was no way to check what you had just uploaded before submitting it.
  const [viewAt, setViewAt] = useState(null)
  // The camera drawn on this page (see InPageCamera). Falls back to the phone's
  // camera app only when it cannot be opened here — and remembers that for the
  // rest of the visit, so a refused permission is not asked again on every tap.
  const [camOpen, setCamOpen] = useState(false)
  const [noInPage, setNoInPage] = useState(false)

  const openCamera = () => {
    if (!noInPage && canUseInPageCamera()) setCamOpen(true)
    else camRef.current?.click()
  }

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
      // One at a time, compressed first so the preview is drawn from the small
      // copy rather than from a 12-megapixel gallery original. uploadPhoto then
      // sees a JPEG already under target and sends it as it is.
      const urls = []
      for (const f of taking) {
        const small = await compressImage(f)
        const url = await uploadPhoto(small, folder)
        rememberThumb(url, await makeThumb(small))
        rememberFull(url, small)
        urls.push(url)
      }
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

  // Asked, not done on the tap. The photo is the proof the work was done, and
  // on a phone the remove button was the easiest thing on this field to hit by
  // accident — reported as "I tap the photo to look at it and it disappears".
  async function remove(url) {
    const ok = await confirm({ message: t.removePhotoConfirm || 'Remove this photo?', confirmLabel: t.remove })
    if (ok) onChange?.(value.filter((u) => u !== url))
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {/* The remove button sits UNDER the photo, not on its corner. On the
              corner it overlapped the photo by a finger's width, so a tap meant
              to open the photo took it away instead, and the one before it was
              what showed. Now the photo is the photo and the bin is the bin. */}
          {value.map((url, i) => (
            <div key={url} style={{ display: 'grid', gap: 5, width: 80 }}>
              <img
                src={thumbFor(url)}
                alt=""
                decoding="async"
                onClick={() => setViewAt(i)}
                title={t.viewPhoto}
                style={{
                  width: 80, height: 80, objectFit: 'cover', borderRadius: 10,
                  border: `1px solid ${C.border}`, cursor: 'zoom-in', display: 'block',
                }}
              />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label={t.remove}
                style={{
                  height: 26, borderRadius: 8, display: 'grid', placeItems: 'center',
                  background: 'transparent', border: `1px solid ${C.red}55`,
                }}
              >
                <Icon name="trash" size={14} color={C.red} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={openCamera}
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

      {camOpen && (
        <InPageCamera
          onCapture={(file) => { setCamOpen(false); handleFiles([file]) }}
          onClose={() => setCamOpen(false)}
          // Not straight to the file input: by now the tap that opened this is
          // long gone (a permission prompt sat in between), and a browser will
          // not open a file picker without a fresh one. Say so; the next tap
          // goes to the phone's camera.
          onUnavailable={(why) => {
            setCamOpen(false); setNoInPage(true)
            // Blocked is the case worth spelling out: it stays blocked on every
            // visit, and the fallback is the phone's camera app — the path that
            // loses the photo on these phones. Telling them how to allow it
            // fixes it for good; quietly falling back would hide it forever.
            setErr(why === 'denied'
              ? (t.cameraBlocked || 'Camera is blocked for this app. Tap the lock icon next to the address, choose Permissions, and allow Camera. Or tap Take photo again to use the phone camera.')
              : (t.cameraFallback || 'The camera could not open here — tap Take photo again.'))
          }}
        />
      )}

      {/* The fallback only: the phone's own camera app, for a browser that
          cannot show the camera on the page. On a low-memory phone this is the
          path that loses the photo — see InPageCamera.
          capture opens the rear camera on phones. NOTE: no `multiple` here —
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
