import { createContext, useContext, useEffect, useState } from 'react'
import { T } from '../translations'

const LangContext = createContext(null)
const STORAGE_KEY = 'ambria_lang'

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(STORAGE_KEY) || 'en')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  const toggle = () => setLang((l) => (l === 'en' ? 'hi' : 'en'))

  const value = { lang, setLang, toggle, t: T[lang] || T.en }
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}

// convenience: just the translation dictionary for the current language
export function useT() {
  return useLang().t
}
