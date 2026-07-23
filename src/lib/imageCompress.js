// Compress an image File/Blob to <= 100KB JPEG before upload.
// The function reduces image dimensions and JPEG quality until
// the file size becomes less than or equal to the target size.

const TARGET_BYTES = 100 * 1024 // 100KB
const MAX_DIM = 1280 // Maximum width or height allowed

export async function compressImage(file, targetBytes = TARGET_BYTES) {
  // Convert file to base64 and load it into an Image object
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)

  let { width, height } = img

  // Downscale image if dimensions are too large
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  // Create canvas for image compression
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0, width, height)

  // Start with good quality
  let quality = 0.9

  // Generate initial compressed blob
  let blob = await toBlob(canvas, quality)

  // Reduce JPEG quality gradually until file size <= target size
  while (blob && blob.size > targetBytes && quality > 0.1) {
    quality -= 0.05
    blob = await toBlob(canvas, quality)
  }

  // If image is still larger than target size,
  // keep reducing dimensions until it fits
  while (blob && blob.size > targetBytes) {
    width = Math.round(width * 0.9)
    height = Math.round(height * 0.9)

    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    blob = await toBlob(canvas, quality)
  }

  // Return compressed image blob
  return blob
}

// Convert File object to Data URL
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(reader.result)
    reader.onerror = reject

    reader.readAsDataURL(file)
  })
}

// Load image from Data URL
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
    canvas.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      quality
    )
  })
}