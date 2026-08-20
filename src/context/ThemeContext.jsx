import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getColors } from '../constants/colors'

const KEY = 'ambria.theme'

// What the app should open in when nobody has chosen yet: whatever the phone or
// desktop is already set to. A staff member who runs their phone dark should not
// have to find a switch in here as well.
function preferred() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* private mode, or storage disabled */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const ThemeContext = createContext({ theme: 'light', colors: getColors('light'), setTheme: () => {}, toggle: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(preferred)

  useEffect(() => {
    try { localStorage.setItem(KEY, theme) } catch { /* nothing to do about it */ }
    // The stylesheet needs to know too: body, the scrollbars, the focus ring and
    // the native date/select controls are painted in CSS, not by useColors().
    document.documentElement.dataset.theme = theme
    // And this is what makes the OS draw <input type="date"> and <select> dark
    // rather than white — there are a lot of both in this app.
    document.documentElement.style.colorScheme = theme
  }, [theme])

  // Follow the system only while the user has not made a choice of their own.
  useEffect(() => {
    let chosen = false
    try { chosen = !!localStorage.getItem(KEY) } catch { /* treat as unchosen */ }
    if (chosen) return undefined
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return undefined
    const onChange = (e) => setTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => setTheme((x) => (x === 'dark' ? 'light' : 'dark')), [])
  const value = useMemo(
    () => ({ theme, colors: getColors(theme), setTheme, toggle }),
    [theme, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// The one every component already calls. Unchanged signature: it returns the
// palette, so nothing had to be touched to make the app themeable.
export function useColors() {
  return useContext(ThemeContext).colors
}

// For the switch itself, and anything else that needs to know which is on.
export function useTheme() {
  return useContext(ThemeContext)
}
