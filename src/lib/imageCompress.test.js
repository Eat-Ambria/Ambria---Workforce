// @vitest-environment jsdom
//
// This file is the one that was killing phones mid-upload, so what is tested is
// the memory behaviour, not the picture: that a photo already small enough is
// never decoded at all, that the size is read from the header so the decode can
// be downsampled instead of allocating the full bitmap, and that the bitmap is
// handed back the moment it has been drawn.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './imageCompress'

/**
 * A real JPEG header: SOI, an APP0/JFIF segment, then a baseline frame header
 * carrying the dimensions. Enough bytes for the parser to walk, which a stub
 * object would not be — the walking is the part worth testing.
 */
function jpegBytes(width, height, padTo = 0) {
  const head = [
    0xFF, 0xD8,                                     // SOI
    0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00,             // APP0, length 4 (2 bytes payload)
    0xFF, 0xC0, 0x00, 0x11, 0x08,                   // SOF0, length 17, precision 8
    (height >> 8) & 0xFF, height & 0xFF,
    (width >> 8) & 0xFF, width & 0xFF,
    0x03,                                           // components
    ...new Array(6).fill(0),
  ]
  const bytes = new Uint8Array(Math.max(head.length, padTo))
  bytes.set(head)
  return bytes
}

function fileOf(bytes, { size, type = 'image/jpeg' } = {}) {
  const blob = new Blob([bytes], { type })
  if (size != null) Object.defineProperty(blob, 'size', { value: size })
  return blob
}

let closed
let bitmapCalls
let canvases

beforeEach(() => {
  closed = 0
  bitmapCalls = []
  canvases = []

  // Reports back whatever resize was asked for, the way a browser would, so the
  // canvas dimensions in these tests are the real consequence of the options.
  globalThis.createImageBitmap = vi.fn(async (_file, opts = {}) => {
    bitmapCalls.push(opts)
    let w = 4000
    let h = 3000
    if (opts.resizeWidth) { h = Math.round(h * (opts.resizeWidth / w)); w = opts.resizeWidth }
    else if (opts.resizeHeight) { w = Math.round(w * (opts.resizeHeight / h)); h = opts.resizeHeight }
    return { width: w, height: h, close: () => { closed += 1 } }
  })

  // jsdom has no canvas backend, so the 2d context and toBlob are stubbed. The
  // stub reports a blob already under the target, keeping the quality loop to a
  // single pass — the loop is not what this file guards.
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') {
      return Object.getPrototypeOf(document).createElement.call(document, tag)
    }
    const c = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {}, clearRect: () => {} }),
      toBlob: (cb) => cb(fileOf(new Uint8Array(1), { size: 50 * 1024 })),
    }
    canvases.push(c)
    return c
  })
})

afterEach(() => { vi.restoreAllMocks() })

const bigPhoto = (w = 4000, h = 3000) =>
  fileOf(jpegBytes(w, h), { size: 4 * 1024 * 1024 })

describe('compressImage', () => {
  it('does not decode a photo that is already small enough', async () => {
    const small = fileOf(jpegBytes(800, 600), { size: 80 * 1024 })
    const out = await compressImage(small)

    // The decode is the step that runs a phone out of memory. A file already
    // under the target must not pay it.
    expect(bitmapCalls).toHaveLength(0)
    expect(out).toBe(small)
  })

  it('reads the size from the header and downsamples during the decode', async () => {
    await compressImage(bigPhoto(4000, 3000))

    // The whole point: the browser is told to resize as it reads, so the
    // full-size 48 MB bitmap is never allocated. Landscape by the header, so
    // the width is the side constrained.
    expect(bitmapCalls[0]).toMatchObject({ resizeWidth: 1280, resizeQuality: 'high' })
    expect(bitmapCalls[0].resizeHeight).toBeUndefined()
    expect(canvases[0].width).toBe(1280)
    expect(canvases[0].height).toBe(960)
  })

  it('constrains the height instead when the photo is taller than it is wide', async () => {
    await compressImage(bigPhoto(3000, 4000))
    expect(bitmapCalls[0]).toMatchObject({ resizeHeight: 1280 })
    expect(bitmapCalls[0].resizeWidth).toBeUndefined()
  })

  it('never constrains both sides, which would squash a rotated photo', async () => {
    await compressImage(bigPhoto(4000, 3000))
    const opts = bitmapCalls[0]
    // EXIF can turn the stored size a quarter turn. One constraint keeps the
    // aspect ratio whatever happens; two would force an exact, wrong shape.
    expect(!!opts.resizeWidth && !!opts.resizeHeight).toBe(false)
  })

  it('releases the bitmap as soon as it is drawn', async () => {
    await compressImage(bigPhoto())
    expect(closed).toBe(1)
  })

  it('reads EXIF orientation, or every portrait photo comes out rotated', async () => {
    await compressImage(bigPhoto())
    // createImageBitmap ignores EXIF by default, unlike <img>. Leaving the
    // option off is a silent rotation, not an error.
    expect(bitmapCalls[0].imageOrientation).toBe('from-image')
  })

  it('asks for no resize when the photo is already within the box', async () => {
    globalThis.createImageBitmap = vi.fn(async (_f, opts = {}) => {
      bitmapCalls.push(opts)
      return { width: 640, height: 480, close: () => { closed += 1 } }
    })
    await compressImage(fileOf(jpegBytes(640, 480), { size: 4 * 1024 * 1024 }))

    // Small already: resizing would be upscaling, a bigger file for no more
    // detail.
    expect(bitmapCalls[0].resizeWidth).toBeUndefined()
    expect(bitmapCalls[0].resizeHeight).toBeUndefined()
    expect(canvases[0].width).toBe(640)
  })

  it('still uploads a file whose header cannot be read', async () => {
    // A PNG, a truncated file, anything unexpected: decode it plainly rather
    // than refusing. An unparseable photo must still reach the board.
    const odd = fileOf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), { size: 4 * 1024 * 1024, type: 'image/png' })
    const out = await compressImage(odd)

    expect(bitmapCalls[0].resizeWidth).toBeUndefined()
    expect(bitmapCalls[0].imageOrientation).toBe('from-image')
    expect(out).toBeTruthy()
  })
})
