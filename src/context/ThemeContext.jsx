import { createContext, useContext } from 'react'
import { colors } from '../constants/colors'

// Dark theme removed — single professional light palette.
// Kept as a context so existing useColors() imports keep working.
const ThemeContext = createContext(colors)

export function ThemeProvider({ children }) {
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>
}

export function useColors() {
  return useContext(ThemeContext)
}
