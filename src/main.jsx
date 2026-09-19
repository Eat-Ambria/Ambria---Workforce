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
import { captureNotificationParam } from './lib/pendingNotification'
import { startRipples } from './lib/ripple'
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
//   2. apply what it finds only once the app is out of sight, so the reload is
//      never something anybody watches happen.
//
// NOBODY SHOULD EVER SEE A REFRESH. Two separate things used to cause one:
//
//   * vite-plugin-pwa's own 'autoUpdate' listener reloaded on the worker
//     activating, and this file reloaded on the same event, so a new build
//     refreshed the page TWICE. The plugin is configured 'prompt' now, which
//     installs no reload of its own and hands the waiting worker over instead.
//
//   * The remaining reload then fired at launch — which is exactly when the
//     worker gets to check for a new build — so opening the app made it
//     restart under the person who had just opened it.
//
// Both are the same mistake: reloading at the one moment somebody is looking.
// ---------------------------------------------------------------------------
const UPDATE_CHECK_MS = 60 * 1000

// Set once a new build is waiting. Calling it applies the update and reloads.
// Its presence IS the "something is pending" flag — a separate one would only
// be a second thing to keep in step with it.
let applyUpdate = null

const busyOnScreen = () => {
  const el = document.activeElement
  const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  const dialogOpen = !!document.querySelector('.modal-scroll')
  return typing || dialogOpen
}

// Apply ONLY while the app is out of sight.
//
// A new build is usually found the moment the app is opened — that is when the
// worker gets to check — and applying it there reloads the page under somebody
// who has just launched it and is watching. It looks like the app restarting on
// its own, which is what was reported.
//
// Held until they put it down instead, so the refresh happens with nobody
// watching and the next launch is simply already on the new version. Nothing is
// lost if they close it outright: an unapplied worker activates by itself once
// no tab is left holding the old one.
const applyWhenSafe = () => {
  if (!applyUpdate) return
  if (!document.hidden || busyOnScreen()) return   // wait until they put it down
  const go = applyUpdate
  applyUpdate = null        // one update, one reload, whatever calls this twice
  go(true)                  // skip waiting, then reload
}

let registration = null

document.addEventListener('visibilitychange', () => {
  // Put down: the only moment an update is applied. A no-op when none is
  // waiting, so it costs nothing to try on every one.
  if (document.hidden) { applyWhenSafe(); return }
  // Picked back up: look for a new build, to be applied when they next stop.
  registration?.update().catch(() => {})
})

const updateSW = registerSW({
  immediate: true,
  // Prompt mode hands the waiting worker over instead of reloading behind our
  // back. Nothing is actually prompted — the app decides for itself, above.
  onNeedRefresh() {
    applyUpdate = updateSW
    applyWhenSafe()
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    registration = reg
    setInterval(() => { reg.update().catch(() => {}) }, UPDATE_CHECK_MS)
  },
})

// base path for GitHub Pages (must match vite.config base)
const BASENAME = '/Ambria---Workforce'

// One delegated listener for the whole app — every button, including ones not
// written yet. See the module.
startRipples()

// A tapped push opened us at ?n=<id>. Taken now, before createRoot, because a
// redirect during auth would rewrite the url and lose it — see the module.
captureNotificationParam()

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
