/* Web Push handlers, imported into the generated service worker via
   vite-plugin-pwa's workbox.importScripts. Runs in the SW global scope. */

const BASE = '/Ambria---Workforce/' // must match vite.config.js `base`
const ICON = BASE + 'icons/pwa-192x192.png'

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Ambria Ops', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Ambria Ops'
  const options = {
    body: data.body || '',
    icon: data.icon || ICON,
    badge: ICON,
    tag: data.tag || undefined,           // collapse duplicates when set
    data: { url: data.url || BASE },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || BASE
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('focus' in client) {
        if ('navigate' in client) { try { await client.navigate(url) } catch (e) { /* ignore */ } }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
