// A video row whose URL was not a URL put the app inside its own player: a
// relative iframe src resolves against the page. `isEmbedUrl` is the one line
// standing between a typo in the admin form and that happening again, so the
// cases worth pinning are the ones that LOOK close enough to a link to slip
// through.

import { describe, expect, it } from 'vitest'
import { extractYTId, isEmbedUrl, ytEmbed, ytThumb } from './youtube'

describe('isEmbedUrl', () => {
  it('accepts http and https links', () => {
    expect(isEmbedUrl('https://www.youtube.com/embed/ZyITjvXqWns')).toBe(true)
    expect(isEmbedUrl('http://example.com/player')).toBe(true)
  })

  it('trims before judging, so a pasted link with stray spaces still counts', () => {
    expect(isEmbedUrl('  https://youtu.be/ZyITjvXqWns  ')).toBe(true)
  })

  it('rejects plain text — the actual bug', () => {
    // exactly what was in the database: the title, typed into the URL box
    expect(isEmbedUrl('Harpic, Lizol Colin Used')).toBe(false)
  })

  it('rejects empty and missing values', () => {
    expect(isEmbedUrl('')).toBe(false)
    expect(isEmbedUrl('   ')).toBe(false)
    expect(isEmbedUrl(null)).toBe(false)
    expect(isEmbedUrl(undefined)).toBe(false)
  })

  it('rejects a relative path, which is what made the app load inside itself', () => {
    expect(isEmbedUrl('/training')).toBe(false)
    expect(isEmbedUrl('videos/clip.mp4')).toBe(false)
    expect(isEmbedUrl('//example.com/embed')).toBe(false)
  })

  it('rejects a bare host with no scheme', () => {
    // parses as nothing a browser would fetch cross-origin
    expect(isEmbedUrl('www.youtube.com/embed/ZyITjvXqWns')).toBe(false)
  })

  it('rejects schemes that are not the web', () => {
    // `new URL()` accepts these happily; the protocol check is why they fail
    expect(isEmbedUrl('javascript:alert(1)')).toBe(false)
    expect(isEmbedUrl('data:text/html,<h1>hi</h1>')).toBe(false)
    expect(isEmbedUrl('file:///C:/video.mp4')).toBe(false)
  })
})

describe('extractYTId', () => {
  it('reads the id out of every link shape the admins paste', () => {
    expect(extractYTId('https://www.youtube.com/watch?v=ZyITjvXqWns')).toBe('ZyITjvXqWns')
    expect(extractYTId('https://youtu.be/ZyITjvXqWns')).toBe('ZyITjvXqWns')
    expect(extractYTId('https://www.youtube.com/embed/ZyITjvXqWns')).toBe('ZyITjvXqWns')
    expect(extractYTId('https://www.youtube.com/shorts/ZyITjvXqWns')).toBe('ZyITjvXqWns')
    expect(extractYTId('https://www.youtube.com/watch?list=PL1&v=ZyITjvXqWns')).toBe('ZyITjvXqWns')
  })

  it('returns empty for anything without one', () => {
    expect(extractYTId('Harpic, Lizol Colin Used')).toBe('')
    expect(extractYTId('https://vimeo.com/123456')).toBe('')
    expect(extractYTId('')).toBe('')
  })
})

describe('ytThumb / ytEmbed', () => {
  it('build a URL from an id', () => {
    expect(ytThumb('ZyITjvXqWns')).toBe('https://img.youtube.com/vi/ZyITjvXqWns/hqdefault.jpg')
    expect(ytEmbed('ZyITjvXqWns')).toBe('https://www.youtube.com/embed/ZyITjvXqWns')
  })

  it('return empty rather than a half-built URL when there is no id', () => {
    expect(ytThumb('')).toBe('')
    expect(ytEmbed('')).toBe('')
  })
})
