// English -> Hindi auto-translation for training topics.
//   1. Exact-match dictionary — instant & correct for the seeded default topics.
//   2. MyMemory free API fallback for custom topics (no API key, CORS-enabled,
//      ~5k words/day anonymous). Admin can always edit the result by hand.

const DICT = {
  'Housekeeping Full Training': 'हाउसकीपिंग फुल ट्रेनिंग',
  'Washroom Cleaning SOP': 'शौचालय सफ़ाई SOP',
  'Floor Mopping Technique': 'फ़र्श पोछा तकनीक',
  'Bed Making Standards': 'बिस्तर बनाने की विधि',
  'Chemical Safety & Handling': 'केमिकल सुरक्षा',
  'Guest Room Inspection': 'गेस्ट रूम निरीक्षण',
  'Lawn Care & Maintenance': 'लॉन केयर',
  'Hedge Trimming Guide': 'हेज कटाई गाइड',
  'Fertilizer Application': 'खाद का उपयोग',
  'Pest Control Methods': 'कीट नियंत्रण',
  'Tree Pruning Technique': 'पेड़ काटने की तकनीक',
  'Sprinkler System Operation': 'स्प्रिंकलर ऑपरेशन',
  'Facility Management Basics': 'फैसिलिटी मैनेजमेंट',
  'DG Set Operation': 'डीजी सेट',
  'CCTV System Monitoring': 'सीसीटीवी मॉनिटरिंग',
  'Vendor Management': 'वेंडर प्रबंधन',
  'Event Coordination': 'इवेंट समन्वय',
  'Fire Safety Training': 'अग्नि सुरक्षा ट्रेनिंग',
  'Fire Extinguisher Usage': 'अग्निशामक उपयोग',
  'First Aid & CPR': 'प्राथमिक उपचार',
  'Security Guard Protocol': 'सुरक्षा प्रोटोकॉल',
  'Emergency Evacuation Drill': 'आपातकालीन निकासी',
  'CCTV Monitoring': 'सीसीटीवी मॉनिटरिंग',
}

export function dictHindi(text) {
  return DICT[(text || '').trim()] || ''
}

// Common short answer words that single-word APIs often mistranslate.
const COMMON = {
  ok: 'ठीक है', okay: 'ठीक है', yes: 'हाँ', no: 'नहीं',
  true: 'सही', false: 'ग़लत', correct: 'सही', wrong: 'ग़लत', incorrect: 'ग़लत',
  cancel: 'रद्द करें', submit: 'जमा करें', save: 'सहेजें', delete: 'हटाएँ',
  next: 'अगला', back: 'पीछे', start: 'शुरू', stop: 'रोकें', none: 'कोई नहीं', all: 'सभी',
}

const hasLatin = (s) => /[A-Za-z]/.test(s || '')
// The only question that matters about a result: is any of it actually in Hindi?
const hasHindi = (s) => /[ऀ-ॿ]/.test(s || '')

async function googleTranslate(q, signal) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`gt http ${res.status}`)
  const json = await res.json()
  const segs = json?.[0]
  if (!Array.isArray(segs)) throw new Error('gt bad shape')
  return segs.map((s) => s?.[0] || '').join('').trim()
}

async function myMemoryTranslate(q, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|hi`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`mm http ${res.status}`)
  const json = await res.json()
  return (json?.responseData?.translatedText || '').trim()
}

// Translate English -> Hindi (by meaning). Strategy:
//   1. exact dictionaries (topics + common answer words) — instant & correct
//   2. Google Translate — high quality for most words
//   3. if Google returns Latin-tainted text (a failed translation like
//      "limit" -> "आप LIMIT"), fall back to MyMemory
// Throws only when everything fails (so the caller can prompt for manual entry).
export async function translateToHindi(text, signal) {
  const q = (text || '').trim()
  if (!q) return ''
  const dict = DICT[q] || COMMON[q.toLowerCase()]
  if (dict) return dict

  let gt = ''
  try { gt = await googleTranslate(q, signal) } catch (e) { if (e.name === 'AbortError') throw e }
  if (gt && !hasLatin(gt)) return gt

  // Google failed or produced partial (Latin) output — try MyMemory
  let mm = ''
  try { mm = await myMemoryTranslate(q, signal) } catch (e) { if (e.name === 'AbortError') throw e }
  if (mm && !hasLatin(mm)) return mm

  // Some Devanagari in it is a real translation that kept a term it had no word
  // for — "अग्नि सुरक्षा SOP" — and is the best thing on offer.
  const best = gt || mm
  if (best && hasHindi(best)) return best

  // Nothing came back in Hindi script at all. Two things do that, and the same
  // answer serves both: the service handed the input straight back (it does
  // that under load), or the source was never English. "mitti Gili Hai Jaise hi
  // Sukh jayegi" is Hindi typed in Latin letters — the script is wrong, not the
  // language, and a translator has nothing to say about it.
  let tl = ''
  try { tl = await transliterateToHindi(q, signal) } catch (e) { if (e.name === 'AbortError') throw e }
  if (tl && hasHindi(tl)) return tl

  // Returning the Latin text here is how a repair description came to sit in
  // the Hindi column word for word — shown to staff under a Hindi heading, as
  // though it had been translated for them. Failing is the honest answer: the
  // caller stores null and the reader falls back to the source.
  throw new Error('translation failed')
}

// A title and its optional description, translated together for the `_hi`
// columns. Never throws and never blocks a save: whatever fails comes back
// null, and the reader falls back to the English text.
//
// Text already written in Devanagari is left alone — passing Hindi through an
// en->hi translator is how "साफ़ करें" comes back mangled.
export async function hindiFor(title, description) {
  const one = async (s) => {
    const q = (s || '').trim()
    if (!q) return null
    if (!hasLatin(q)) return null   // already Hindi; the English column holds it
    try { return (await translateToHindi(q)) || null } catch { return null }
  }
  const [hi, hiDesc] = await Promise.all([one(title), one(description)])
  return { hi, hiDesc }
}

// Transliterate Roman/Hinglish -> Devanagari using Google Input Tools.
// Use this when the source is Hindi typed in English letters (e.g. "theek hai"
// -> "ठीक है") — translation would mangle it. Already-Devanagari text passes
// through unchanged. Throws on network/abort/empty.
export async function transliterateToHindi(text, signal) {
  const q = (text || '').trim()
  if (!q) return ''
  const url = `https://inputtools.google.com/request?text=${encodeURIComponent(q)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`translit http ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json) || json[0] !== 'SUCCESS') throw new Error('translit failed')
  const out = json?.[1]?.[0]?.[1]?.[0]
  if (!out || /^\s*$/.test(out)) throw new Error('empty translit')
  return out
}
