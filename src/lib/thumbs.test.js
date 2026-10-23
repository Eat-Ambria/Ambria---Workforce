// The preview cache: a photo taken this visit shows its small thumbnail; any
// other photo falls back to its own URL, which is how it worked before.

import { describe, expect, it } from 'vitest'
import { thumbFor, rememberThumb, makeThumb } from './thumbs'

describe('thumbFor', () => {
  it('falls back to the url when no thumbnail was made', () => {
    expect(thumbFor('https://x/photo-a.jpg')).toBe('https://x/photo-a.jpg')
  })

  it('returns the thumbnail once one is remembered', () => {
    rememberThumb('https://x/photo-b.jpg', 'data:image/jpeg;base64,AAA')
    expect(thumbFor('https://x/photo-b.jpg')).toBe('data:image/jpeg;base64,AAA')
  })

  it('ignores an empty thumbnail, so a failed one never blanks a photo', () => {
    rememberThumb('https://x/photo-c.jpg', null)
    expect(thumbFor('https://x/photo-c.jpg')).toBe('https://x/photo-c.jpg')
  })
})

describe('makeThumb', () => {
  it('never throws — a preview that cannot be made is just null', async () => {
    await expect(makeThumb(new Blob(['not an image'], { type: 'image/jpeg' }))).resolves.toBe(null)
  })
})
