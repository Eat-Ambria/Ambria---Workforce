// Small previews for photos taken in this visit.
//
// A 72px thumbnail drawn from a photo's URL is still a full photo to the phone:
// the browser fetches it and decodes every pixel — about 3 MB of memory for a
// 1024x768 picture — and only then scales it down to draw. Ten of them in the
// form, plus the before-photos above it, is 30-60 MB held just for little
// squares. On a 2 GB phone that is the memory that runs out a few photos in,
// and the browser is killed with the work half done.
//
// So each photo gets a real thumbnail the moment it is taken: drawn once from
// the already-compressed image, a few KB as a data URL, and shown in place of
// the URL wherever this visit displays it. A photo uploaded on another day has
// none and falls back to its URL — those are only ever looked at, not stacked
// up one after another while somebody works.

const THUMB = 160
const cache = new Map()   // public url -> data url
const fulls = new Map()   // public url -> object url of the uploaded copy

// The full photo too, for the viewer.
//
// Before the thumbnails, each square loaded the full photo, so by the time
// somebody tapped one it was already downloaded and the viewer opened at once.
// The thumbnails took that away: the tap started the download, the screen sat
// black, and a second tap closed it. The compressed copy that was uploaded is
// still here in memory as a ~100 KB blob, so the viewer opens that — no
// download, no wait — and it is only decoded when somebody actually looks.

/** The preview to draw for `url`: its thumbnail if this visit made one. */
export const thumbFor = (url) => cache.get(url) || url

/** The image to open full-size for `url`: the local copy if this visit has one. */
export const fullFor = (url) => fulls.get(url) || url

/** Keep `blob` — the uploaded copy — as what the viewer shows for `url`. */
export const rememberFull = (url, blob) => {
  if (!url || !blob || typeof URL === 'undefined' || !URL.createObjectURL) return
  fulls.set(url, URL.createObjectURL(blob))
}

/** Remember `dataUrl` as the preview for `url`. */
export const rememberThumb = (url, dataUrl) => { if (url && dataUrl) cache.set(url, dataUrl) }

/**
 * A ~160px JPEG data URL of `blob`, or null if it cannot be made.
 *
 * Meant for a blob that is already small (the compressed upload), so the decode
 * here is cheap. Never throws: a missing preview only means the full image is
 * shown, which is how it worked before.
 */
export async function makeThumb(blob) {
  try {
    let source
    let cleanup = () => {}
    if (typeof createImageBitmap === 'function') {
      // decoded straight to the small size where the browser can
      source = await createImageBitmap(blob, { resizeWidth: THUMB, resizeQuality: 'medium' })
      cleanup = () => source.close?.()
    } else {
      const url = URL.createObjectURL(blob)
      source = await new Promise((ok, no) => {
        const img = new Image()
        img.onload = () => ok(img)
        img.onerror = no
        img.src = url
      })
      cleanup = () => URL.revokeObjectURL(url)
    }
    const w = THUMB
    const h = Math.max(1, Math.round((source.height / source.width) * THUMB))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(source, 0, 0, w, h)
    cleanup()
    const data = canvas.toDataURL('image/jpeg', 0.7)
    canvas.width = 0; canvas.height = 0
    return data
  } catch {
    return null
  }
}
