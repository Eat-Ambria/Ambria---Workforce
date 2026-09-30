// The coloured circle with somebody's initial in it.
//
// The colour is derived from the name, not stored and not random: the same
// person is the same colour on every screen and in every session, which is what
// makes it worth having at all. A random tint per render would be decoration; a
// stable one is a second way to recognise a row you have seen before.

/**
 * One or two letters for the circle.
 *
 * Two words give two letters, one word gives one — not two letters of the same
 * word, which reads as an abbreviation of something rather than as initials.
 * Falls back to 'A' so a nameless row is still a circle rather than a hole.
 */
export function initials(name = '') {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'A'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// Pairs that exist in BOTH themes, so a tint never has to be computed at
// runtime and never lands on an unreadable combination. Red is deliberately
// absent: it means "wrong" everywhere else in this app, and a person is not a
// warning.
const TINTS = [
  ['maroon', 'maroonSoft'],
  ['blue', 'bBg'],
  ['green', 'gBg'],
  ['pink', 'pkBg'],
  ['yellow', 'yBg'],
]

/**
 * Pick a tint for a seed — a user id where there is one, a name otherwise.
 *
 * An id is the better seed: two people called Ravi get different circles, and
 * one person keeps theirs through a rename. The name is only the fallback for
 * rows that carry no id, such as a completion snapshot of somebody deleted.
 *
 * The hash is small and deliberately dull. It does not need to be well
 * distributed, it needs to be the SAME every time — so it is written out rather
 * than pulled from a library that might change its mind in a later version.
 */
export function avatarTint(seed, C) {
  const s = String(seed || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000
  const [fg, bg] = TINTS[h % TINTS.length]
  return { color: C[fg], background: C[bg] }
}
