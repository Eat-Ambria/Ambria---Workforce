import { supabase } from './supabase'

// VAPID public key (safe to expose). Set VITE_VAPID_PUBLIC_KEY in .env.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
    typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window
}

// Push can only be offered when a public key is configured AND the browser supports it.
export const pushConfigured = () => !!VAPID_PUBLIC

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// 'unsupported' | 'unconfigured' | 'denied' | 'on' | 'off'
export async function getPushState() {
  if (!pushSupported()) return 'unsupported'
  if (!pushConfigured()) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

// Ask permission, subscribe this device, and store it for the user.
export async function enablePush(userId) {
  if (!pushSupported()) throw new Error('unsupported')
  if (!pushConfigured()) throw new Error('unconfigured')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('denied')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }
  const { keys } = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

// Re-associate THIS device's existing push subscription with the current user.
// Silent (never prompts): does nothing unless push is already enabled here.
// Called on login/session-restore so a shared device only ever receives the
// currently signed-in user's notifications — not the previous user's.
export async function syncSubscription(userId) {
  if (!userId || !pushSupported() || !pushConfigured()) return
  if (Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const { keys } = sub.toJSON()
    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' }
    )
  } catch { /* ignore — best effort */ }
}

// On logout, stop this device from receiving the logged-out user's pushes.
// Keeps the browser subscription intact so the next user re-claims it silently.
export async function releaseSubscription() {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  } catch { /* ignore — best effort */ }
}

// Remove this device's subscription.
export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
