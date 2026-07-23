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
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [load])

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
