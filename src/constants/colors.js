// Single professional light palette. (Dark theme removed.)
// Keys are stable — components read them via useColors().

export const colors = {
  // brand
  maroon: '#8A2438',
  maroonDark: '#6B1728',
  maroonSoft: '#FBEDF0',
  accent: '#B45309',

  // surfaces — airy, premium slate-tinted light theme
  white: '#FFFFFF',
  bg: '#F7F8FA',       // app background (soft, airy)
  card: '#FFFFFF',
  cardAlt: '#F8FAFC',

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
  pink: '#DB2777',

  // effects
  overlay: 'rgba(15,23,42,0.42)',
  shadow: '0 1px 2px rgba(15,23,42,0.05), 0 1px 3px rgba(15,23,42,0.07)',
  shadowMd: '0 6px 16px rgba(15,23,42,0.07), 0 2px 6px rgba(15,23,42,0.04)',
  shadowLg: '0 18px 40px rgba(15,23,42,0.14)',
}

export function getColors() {
  return colors
}
