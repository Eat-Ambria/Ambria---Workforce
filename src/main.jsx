import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { LangProvider } from './context/LangContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ConfirmProvider } from './components/common/ConfirmDialog.jsx'
import './index.css'

// ---------------------------------------------------------------------------
// KEEPING THE INSTALLED APP UP TO DATE
//
// The service worker only looks for a new build when the page loads. An
// installed PWA can sit open for days, so staff were seeing an old version
// until they logged out and back in (which reloads the page).
//
// Two halves fix that:
//   1. ask the worker to check periodically, and whenever the app is brought
//      back to the foreground;
//   2. when a new worker takes over, reload — but never while someone is
//      mid-sentence. Typing in a field or having a dialog open defers the
//      reload until the app is next backgrounded, so a half-written repair
//      request with a voice note is not thrown away.
// ---------------------------------------------------------------------------
const UPDATE_CHECK_MS = 60 * 1000

let pendingReload = false
const busyOnScreen = () => {
  const el = document.activeElement
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  const dialogOpen = !!document.querySelector('.modal-scroll')
  return typing || dialogOpen
}
const reloadWhenSafe = () => {
  if (document.hidden || !busyOnScreen()) { window.location.reload(); return }
  pendingReload = true   // try again when they put the app down
}

if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    reloadWhenSafe()
  })
}
document.addEventListener('visibilitychange', () => {
  if (pendingReload && document.hidden) window.location.reload()
})

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => { registration.update().catch(() => {}) }, UPDATE_CHECK_MS)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update().catch(() => {})
    })
  },
})

// base path for GitHub Pages (must match vite.config base)
const BASENAME = '/Ambria---Workforce'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={BASENAME}>
        <ThemeProvider>
          <LangProvider>
            <AuthProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
