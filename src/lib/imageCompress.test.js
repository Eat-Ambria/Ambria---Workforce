// @vitest-environment jsdom
//
// This file is the one that was killing phones mid-upload, so what is tested is
// the memory behaviour, not the picture: that a photo already small enough is
// never decoded at all, and that the decoded bitmap is handed back the moment it
// has been drawn rather than held through the quality loop.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './imageCompress'

const jpeg = (bytes, type = 'image/jpeg') => {
  const f = new Blob([new Uint8Array(1)], { type })
  // Blob size is not writable, and a real multi-megabyte buffer in a test is
  // wasteful — the code only ever reads .size and .type.
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}

let closed
let bitmapsMade

beforeEach(() => {
  closed = 0
  bitmapsMade = 0

  globalThis.createImageBitmap = vi.fn(async () => {
    bitmapsMade += 1
    return {
      width: 4000,
      height: 3000,
      close: () => { closed += 1 },
    }
  })

  // jsdom has no canvas backend, so the 2d context and toBlob are stubbed. The
  // stub reports a blob already under the target, which keeps the quality loop
  // to a single pass — the loop itself is not what this file is guarding.
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') {
      return Object.getPrototypeOf(document).createElement.call(document, tag)
    }
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {}, clearRect: () => {} }),
      toBlob: (cb) => cb(jpeg(50 * 1024)),
    }
  })
})

afterEach(() => { vi.restoreAllMocks() })

describe('compressImage', () => {
  it('does not decode a photo that is already small enough', async () => {
    const small = jpeg(80 * 1024)
    const out = await compressImage(small)

    // The decode is the step that runs a phone out of memory. A file already
    // under the target must not pay it.
    expect(bitmapsMade).toBe(0)
    expect(out).toBe(small)
  })

  it('decodes a large photo and releases the bitmap once it is drawn', async () => {
    await compressImage(jpeg(4 * 1024 * 1024))

    expect(bitmapsMade).toBe(1)
    // The whole fix: 48 MB of decoded bitmap goes back before the re-encode
    // loop runs, instead of staying referenced until the collector gets to it.
    expect(closed).toBe(1)
  })

  it('reads EXIF orientation, or every portrait photo comes out rotated', async () => {
    await compressImage(jpeg(4 * 1024 * 1024))

    // createImageBitmap ignores EXIF by default, unlike <img>. Leaving the
    // option off is a silent rotation, not an error.
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageOrientation: 'from-image' }),
    )
  })

  it('scales the long side down to 1280 and never scales up', async () => {
    const canvases = []
    document.createElement.mockImplementation((tag) => {
      if (tag !== 'canvas') {
        return Object.getPrototypeOf(document).createElement.call(document, tag)
      }
      const c = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {}, clearRect: () => {} }),
        toBlob: (cb) => cb(jpeg(50 * 1024)),
      }
      canvases.push(c)
      return c
    })

    await compressImage(jpeg(4 * 1024 * 1024))
    // 4000x3000 fits into 1280 on its long side: 1280x960.
    expect(canvases[0].width).toBe(1280)
    expect(canvases[0].height).toBe(960)

    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 640, height: 480, close: () => {},
    }))
    canvases.length = 0
    await compressImage(jpeg(4 * 1024 * 1024))
    // Already smaller than the box — blowing it up is a bigger file and no more
    // detail.
    expect(canvases[0].width).toBe(640)
    expect(canvases[0].height).toBe(480)
  })
})
