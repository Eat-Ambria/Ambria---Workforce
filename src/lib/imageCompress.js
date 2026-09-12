// Compress an image File/Blob to <= 100KB JPEG before upload.
//
// WRITTEN FOR THE WEAKEST PHONE ON SITE, because that is the one it kept
// killing. The first version read the file with readAsDataURL and handed the
// base64 string to an Image. For a 12-megapixel photo off a phone camera that
// meant, all alive at the same moment:
//
//   the File itself                        ~4 MB
//   the base64 string of it                ~5.5 MB  (and a JS string at that)
//   the browser's own copy while parsing   ~5.5 MB
//   the DECODED bitmap, at full size       4000 x 3000 x 4 = ~48 MB
//
// — roughly 60-70 MB for one photo, on a device whose whole tab may not get
// much more than that. The tab was killed mid-upload, which from the floor looks
// like the app throwing you out.
//
// Two things fix it. createImageBitmap takes the File directly, so the base64
// round-trip and its two copies are gone. And the bitmap is close()d the instant
// it has been drawn, so the 48 MB is handed back before the quality loop starts
// rather than being held until the garbage collector feels like it — the old
// code kept the full-size Image referenced through every iteration.

const TARGET_BYTES = 100 * 1024 // 100KB
const MAX_DIM = 1280 // Maximum width or height allowed

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
 * side, releasing the decoded image as soon as it has been drawn.
 */
async function drawScaled(file) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (typeof createImageBitmap === 'function') {
    // imageOrientation: EXIF says which way up a phone photo was taken.
    // createImageBitmap ignores it by DEFAULT — unlike <img>, which honours it —
    // so leaving this off silently rotates every portrait photo on the way
    // through.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { w, h } = fit(bmp.width, bmp.height)
    canvas.width = w
    canvas.height = h
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close() // the 48 MB, back before anything else runs
    return { canvas, ctx }
  }

  // Fallback for anything without createImageBitmap. Same shape as the old
  // code, including its memory cost — but objectURL rather than base64, so at
  // least the two string copies are not made.
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
