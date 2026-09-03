// Two palettes, identical key sets. Components read them through useColors(), so
// nothing in a component needs to know which one is active.
//
// Three tokens exist only because one colour cannot do two jobs on a dark
// background. `maroon` is the brand as *text and icons*; `brandBg` is the brand as
// a *filled surface* with white text on it. In the light theme they are the same
// value. In the dark theme they cannot be: measured against a #141B24 card,
// #8A2438 as text is 1.97:1 — invisible — and the rose that fixes that, #E4718A,
// only reaches 2.99:1 under white text, so buttons built on it fail instead. No
// single tone passes both. successBg and dangerBg exist for the same reason.

export const light = {
  // brand
  maroon: '#8A2438',
  maroonDark: '#6B1728',
  maroonSoft: '#FBEDF0',
  accent: '#B45309',
  // filled brand/status surfaces — white text sits on these
  brandBg: '#8A2438',
  successBg: '#15803D',
  dangerBg: '#DC2626',

  // surfaces — airy, premium slate-tinted light theme
  white: '#FFFFFF',
  bg: '#F7F8FA',       // app background (soft, airy)
  card: '#FFFFFF',
  cardAlt: '#F8FAFC',
  headerBg: 'rgba(255,255,255,0.85)',   // sticky header, over blurred content

  // text — slate scale
  text: '#0F172A',     // slate-900
  tl: '#64748B',       // slate-500 secondary
  faint: '#94A3B8',    // slate-400

  // lines
  border: '#ECEEF2',
  borderStrong: '#DCE0E7',

  // status
  green: '#15803D',
  gBg: '#ECFDF3',
  blue: '#2563EB',
  bBg: '#EFF4FF',
  red: '#DC2626',
  rBg: '#FEF2F2',
  yellow: '#B45309',
  yBg: '#FEF6E7',
  purple: '#7C3AED',
  cyan: '#0891B2',
  indigo: '#4F46E5',
  pink: '#BE185D',   // was #DB2777, which measured 4.21 on its own tint
  pkBg: '#FDF2F8',   // pink 5.53 on it

  // effects
  overlay: 'rgba(15,23,42,0.42)',
  shadow: '0 1px 2px rgba(15,23,42,0.05), 0 1px 3px rgba(15,23,42,0.07)',
  shadowMd: '0 6px 16px rgba(15,23,42,0.07), 0 2px 6px rgba(15,23,42,0.04)',
  shadowLg: '0 18px 40px rgba(15,23,42,0.14)',
}

// Every text tone below was checked against the card surface: maroon 5.80,
// text 14.73, tl 7.09, green 9.94, red 6.26, blue 6.82, yellow 10.38,
// indigo 5.81 — all AA. `faint` sits at 3.96, which is AA-large only, and it is
// used for hints and placeholders rather than for anything you have to read.
export const dark = {
  // brand
  maroon: '#E4718A',        // brand as text and icons
  // Only ever the far end of the brand banner gradient — the Login hero and
  // the public page's header band, its two callers in the app. So it is a deep
  // tone here rather than a rose one: those banners carry white text.
  maroonDark: '#6E1E2E',
  maroonSoft: '#3A1A24',    // the tinted surface behind maroon text
  accent: '#D98324',
  brandBg: '#9E2C42',       // white on it: 7.26
  successBg: '#15803D',     // white on it: 5.02
  dangerBg: '#B91C1C',      // white on it: 6.47

  // surfaces. `white` is a badly named token but it is only ever an input or a
  // sheet surface — four call sites, none of them meaning the colour white.
  white: '#111823',
  bg: '#0B1017',
  card: '#141B24',
  cardAlt: '#1B2430',
  headerBg: 'rgba(11,16,23,0.85)',

  // text
  text: '#E8EDF4',
  tl: '#9AA7B8',
  faint: '#6B7A8D',

  // lines
  border: '#232E3C',
  borderStrong: '#33404F',

  // status — lightened for text, with dark tints behind them
  green: '#4ADE80',
  gBg: '#10251A',
  blue: '#60A5FA',
  bBg: '#0F1D33',
  red: '#F87171',
  rBg: '#2A1315',
  yellow: '#FBBF24',
  yBg: '#2A1F0D',
  purple: '#A78BFA',
  cyan: '#22D3EE',
  indigo: '#818CF8',
  pink: '#F472B6',
  pkBg: '#2E1626',   // pink 6.30 on it

  // effects — deeper, because a light shadow is invisible on a dark ground
  overlay: 'rgba(0,0,0,0.62)',
  shadow: '0 1px 2px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.30)',
  shadowMd: '0 6px 16px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.30)',
  shadowLg: '0 18px 40px rgba(0,0,0,0.55)',
}

// Kept: plenty of modules still import `colors` directly.
export const colors = light

export function getColors(theme) {
  return theme === 'dark' ? dark : light
}
