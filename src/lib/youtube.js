// Extract the 11-char YouTube video ID from any URL format
// (watch?v=, youtu.be/, embed/, shorts/). Returns '' if none found.
export function extractYTId(url) {
  if (!url) return ''
  const m = String(url).match(/(?:[?&]v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : ''
}

export function ytThumb(id) {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''
}

export function ytEmbed(id) {
  return id ? `https://www.youtube.com/embed/${id}` : ''
}

/**
 * Is this something a browser can actually load in an <iframe>?
 *
 * It matters because a RELATIVE src resolves against the page it is on. A plain
 * string typed into the video URL box — a title, a note, anything that is not a
 * link — becomes a relative URL, and the iframe loads THIS APP inside the
 * player. Which is exactly what it looked like: the website, inside the video.
 *
 * So an embed is an absolute http(s) URL or it is not an embed. `new URL()`
 * throws on anything that is not one, and would happily accept `javascript:`
 * and `data:`, hence the protocol check rather than a bare try/catch.
 */
export function isEmbedUrl(url) {
  const s = String(url || '').trim()
  if (!s) return false
  try {
    const { protocol } = new URL(s)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
