// Compress an image File/Blob to <= 100KB JPEG before upload.
//
// WRITTEN FOR THE WEAKEST PHONE ON SITE, because that is the one it kept
// killing. Staff on old handsets were thrown out of the app mid-upload, which is
// a browser killing the tab for memory.
//
// The original read the File with readAsDataURL and handed the base64 string to
// an Image. For a 12-megapixel camera photo that meant, all alive at once: the
// file (~4 MB), its base64 string (~5.5 MB, and a JS string at that), the
// browser's copy while parsing it, and the decoded bitmap at FULL resolution —
// 4000 x 3000 x 4 is ~48 MB. Around 68 MB for one photo, and the full-size Image
// stayed referenced through both re-encode loops, so none of it came back until
// the upload finished. An iPhone has the headroom to absorb that. A 1 GB Android
// does not.
//
// The 48 MB is the part that matters, and the trick to never allocating it is to
// know the photo's size BEFORE decoding. A JPEG says so in its header, in the
// first few KB, and reading it costs nothing. Handed that, createImageBitmap
// downsamples as it reads and the full-size bitmap is never materialised:
//
//   file 4 MB + resized bitmap ~5 MB + canvas ~5 MB  =  ~14 MB
//
// Everything else here follows from that: the bitmap is close()d the moment it
// is drawn, and the shrink loop scales the canvas into itself rather than
// re-reading an original that is deliberately no longer held.

const TARGET_BYTES = 100 * 1024 // 100KB
const MAX_DIM = 1280 // Maximum width or height allowed
// Enough to cover the header and any EXIF thumbnail ahead of the frame marker,
// without pulling the whole file into memory to read five bytes out of it.
const HEADER_BYTES = 256 * 1024

export async function compressImage(file, targetBytes = TARGET_BYTES) {
  // Already small enough to send as it is. Worth checking first: a phone set to
  // shoot small, or a photo that has been through here before, otherwise pays
  // the whole decode for nothing — and that decode is the part that crashes.
  if (file && file.size <= targetBytes && /^image\/jpe?g$/i.test(file.type || '')) {
    return file
  }

  const { canvas, ctx } = await drawScaled(file)

  // Quality first: it costs nothing but a re-encode of the small canvas, and it
  // keeps the picture's size on screen.
  let quality = 0.9
  let blob = await toBlob(canvas, quality)
  while (blob && blob.size > targetBytes && quality > 0.1) {
    quality -= 0.05
    blob = await toBlob(canvas, quality)
  }

  // Still too big — a busy photo of a cluttered room can be. Shrink the canvas
  // into itself rather than re-drawing from the original: the original is long
  // gone by now, which is the entire point, and at these sizes the difference
  // is not visible.
  let guard = 12 // a photo that will not come down must not spin here forever
  while (blob && blob.size > targetBytes && guard-- > 0) {
    const w = Math.max(1, Math.round(canvas.width * 0.9))
    const h = Math.max(1, Math.round(canvas.height * 0.9))
    const small = document.createElement('canvas')
    small.width = w
    small.height = h
    small.getContext('2d').drawImage(canvas, 0, 0, w, h)
    canvas.width = w
    canvas.height = h
    ctx.drawImage(small, 0, 0)
    small.width = 0
    small.height = 0
    blob = await toBlob(canvas, quality)
  }

  // Never hand back something bigger than what came in.
  return blob && blob.size < file.size ? blob : (blob || file)
}

/**
 * Decode `file` and draw it onto a canvas no larger than MAX_DIM on its long
 * side, allocating as little as the browser will allow and releasing it at once.
 */
async function drawScaled(file) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file, await decodeOptions(file))
    const { w, h } = fit(bmp.width, bmp.height)
    canvas.width = w
    canvas.height = h
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close() // back before anything else runs
    return { canvas, ctx }
  }

  // Fallback for anything without createImageBitmap. Same shape as the old
  // code, including its memory cost — but an object URL rather than base64, so
  // at least the two string copies are not made.
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const { w, h } = fit(img.naturalWidth || img.width, img.naturalHeight || img.height)
    canvas.width = w
    canvas.height = h
    ctx.drawImage(img, 0, 0, w, h)
    img.src = ''
    return { canvas, ctx }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * What to ask createImageBitmap for.
 *
 * imageOrientation is always set: createImageBitmap ignores EXIF by DEFAULT,
 * unlike <img> which honours it, so leaving it off silently rotates every
 * portrait photo on the way through — a worse bug than the one being fixed.
 *
 * ONE dimension is constrained, never both. Both would be an exact size and
 * would squash the picture whenever the guess was wrong, and it can be wrong:
 * the header gives the stored size, while EXIF may rotate the image a quarter
 * turn, swapping them. With one constraint the aspect ratio is always kept —
 * a rotated photo simply comes back a little larger than asked for (1280x1707
 * rather than 1280x960, about 9 MB rather than 5), and `fit` puts it in the box
 * when it is drawn. Slightly too big is nothing; distorted is a ruined photo.
 */
async function decodeOptions(file) {
  const opts = { imageOrientation: 'from-image' }
  const dims = await jpegSize(file)
  if (!dims) return opts // not a JPEG, or an unreadable header: decode as-is
  if (Math.max(dims.width, dims.height) <= MAX_DIM) return opts // no gain
  if (dims.width >= dims.height) opts.resizeWidth = MAX_DIM
  else opts.resizeHeight = MAX_DIM
  opts.resizeQuality = 'high'
  return opts
}

/**
 * A JPEG's pixel size, read out of its header without decoding it.
 *
 * The file is a run of segments: 0xFF, a marker, then a two-byte length. The
 * frame header (SOF) carries the dimensions, and it always appears before the
 * scan data (SOS), so the walk stops there and never touches the pixels.
 *
 * Returns null for anything it does not understand, and the caller falls back
 * to a plain decode — a photo that will not parse must still upload.
 */
async function jpegSize(file) {
  try {
    const head = file.slice(0, Math.min(HEADER_BYTES, file.size))
    const view = new DataView(await head.arrayBuffer())
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null // not a JPEG

    let off = 2
    while (off + 4 <= view.byteLength) {
      // Segments are padded with 0xFF; skip the fill to find the marker.
      if (view.getUint8(off) !== 0xFF) { off += 1; continue }
      const marker = view.getUint8(off + 1)
      off += 2
      // Standalone markers: no length, no payload.
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) continue
      if (marker === 0xDA) return null // start of scan: past the headers
      const size = view.getUint16(off)
      if (size < 2) return null // malformed
      // SOF0..SOFF are frame headers, except DHT (C4), JPG (C8) and DAC (CC).
      const isFrame = marker >= 0xC0 && marker <= 0xCF
        && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC
      if (isFrame) {
        if (off + 7 > view.byteLength) return null
        // payload: precision(1), height(2), width(2)
        return { height: view.getUint16(off + 3), width: view.getUint16(off + 5) }
      }
      off += size
    }
    return null
  } catch {
    return null // unreadable slice — let the plain decode try
  }
}

// Scale to fit inside MAX_DIM, never up: a small photo blown up is a bigger
// file for no more detail.
function fit(width, height) {
  const scale = Math.min(1, MAX_DIM / Math.max(width || 1, height || 1))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Convert canvas to JPEG blob with specified quality
function toBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}
