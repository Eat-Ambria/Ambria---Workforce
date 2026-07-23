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
