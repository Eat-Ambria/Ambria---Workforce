import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

// Notification types whose entity_id is a task. The repair ones point at a
// fix_requests row, whose text is what somebody typed rather than a title with
// a translation beside it.
const TASK_TYPES = new Set([
  'task_assigned', 'task_sent_back', 'task_approved', 'task_closed_by_admin',
  'task_done', 'task_submitted', 'task_issue',
])

// The row stores the English name and title, written by the trigger when the
// notification was created. Look up the Hindi for the rows on screen — two
// queries for the whole list, and only when the app is in Hindi.
async function withHindi(rows) {
  if (!rows.length) return rows

  const userIds = [...new Set(rows.map((r) => r.by_user).filter(Boolean))]
  const taskIds = [...new Set(rows.filter((r) => TASK_TYPES.has(r.type)).map((r) => r.entity_id).filter(Boolean))]

  const [people, tasks] = await Promise.all([
    userIds.length
      ? supabase.from('users').select('id, name_hi').in('id', userIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? supabase.from('tasks').select('id, title_hi').in('id', taskIds)
      : Promise.resolve({ data: [] }),
  ])

  const nameHi = new Map((people.data || []).map((u) => [String(u.id), (u.name_hi || '').trim()]))
  const titleHi = new Map((tasks.data || []).map((x) => [String(x.id), (x.title_hi || '').trim()]))

  // Only where there is something to use. A missing Hindi name leaves the
  // English one in place, which is better than a blank line where a name was.
  return rows.map((r) => ({
    ...r,
    by_name: nameHi.get(String(r.by_user)) || r.by_name,
    task_text: titleHi.get(String(r.entity_id)) || r.task_text,
  }))
}

// Loads the signed-in user's notifications (newest first), exposes the unread
// count, and mark-read helpers. Refreshes on mount, every 60s, and on focus.
export function useNotifications() {
  const { user } = useAuth()
  const { lang } = useLang()
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('for_user', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    const rows = data || []
    setItems(lang === 'hi' ? await withHindi(rows) : rows)
  }, [user, lang])

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
