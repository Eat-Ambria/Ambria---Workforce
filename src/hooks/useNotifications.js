import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Loads the signed-in user's notifications (newest first), exposes the unread
// count, and mark-read helpers. Refreshes on mount, every 60s, and on focus.
export function useNotifications() {
  const { user } = useAuth()
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('for_user', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    setItems(data || [])
  }, [user])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    // `focus` alone is unreliable on mobile — phones fire `visibilitychange`
    // when the app returns to the foreground, so refresh on both.
    const refresh = () => { if (!document.hidden) load() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  // Realtime: push new/updated notifications straight into the bell so the
  // count updates instantly on every device, not just on the next 60s poll.
  useEffect(() => {
    if (!user) return undefined
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `for_user=eq.${user.id}` },
        () => load(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, load])

  const unread = items.reduce((n, x) => n + (x.is_read ? 0 : 1), 0)

  async function markRead(id) {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }

  async function markAll() {
    if (!user || unread === 0) return
    setItems((list) => list.map((n) => ({ ...n, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).eq('for_user', user.id).eq('is_read', false)
  }

  return { items, unread, markRead, markAll, reload: load }
}
