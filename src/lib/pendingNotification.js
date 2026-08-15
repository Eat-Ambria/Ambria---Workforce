// The notification a tapped push asked for, read out of the url before React
// mounts and held here until something opens it.
//
// Its own module on purpose. main.jsx imports App, App imports the layout, the
// layout imports NotificationBell — so the bell importing main.jsx back would
// close a circle. It happens to work, because the value is only read inside an
// effect by which time every module has finished loading, but a cycle that
// works by timing is one refactor away from not working.
//
// Written by main.jsx at module load; read and cleared by NotificationBell.
export const pendingNotification = { id: null }

// Take ?n= out of the address bar and remember it.
//
// The service worker opens the app at /tasks?n=123. React then mounts, and while
// auth restores App sends the user through <Navigate to="/login" replace /> and
// back — `replace` rewrites the url and the query string goes with it. Read it
// any later and it is already gone, which turns "open this task" into "open the
// app". Stripping it here also stops a refresh reopening the same item.
export function captureNotificationParam() {
  try {
    const q = new URLSearchParams(window.location.search)
    const n = q.get('n')
    if (!n) return
    pendingNotification.id = n
    q.delete('n')
    const rest = q.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
  } catch { /* nothing to read */ }
}
