import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useNotifications } from '../../hooks/useNotifications'
import Icon from '../common/Icon'

// short relative time, e.g. "now", "5m", "3h", "2d"
function ago(iso, hi) {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return hi ? 'अभी' : 'now'
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

// map a notification row → { icon, link, title, body } (localized)
function meta(n, hi) {
  const item = n.task_text || ''
  const who = n.by_name ? ` · ${n.by_name}` : ''
  switch (n.type) {
    case 'task_assigned': return { icon: 'myTasks', link: '/my-tasks', status: 'pending', title: hi ? 'नया टास्क सौंपा गया' : 'New task assigned', body: item }
    case 'task_sent_back': return { icon: 'warning', link: '/my-tasks', status: 'in_progress', title: hi ? 'टास्क वापस भेजा गया — दोबारा करें' : 'Task sent back — please redo', body: item }
    case 'task_approved': return { icon: 'check', link: '/my-tasks', status: 'completed', title: hi ? 'आपका काम मंज़ूर हुआ' : 'Your work was approved', body: item }
    case 'task_closed_by_admin': return { icon: 'check', link: '/my-tasks', status: 'completed', title: hi ? 'एडमिन ने आपका टास्क पूरा मार्क किया' : 'Admin marked your task complete', body: item }
    // staff finished a task themselves — nothing to approve, but the admin is
    // told so they can look and, if it will not do, send it back for a redo
    case 'task_done': return { icon: 'check', link: '/tasks', tab: 'completed', title: hi ? 'स्टाफ ने टास्क पूरा किया' : 'Staff completed a task', body: item + who }
    case 'task_submitted': return { icon: 'inbox', link: '/tasks', tab: 'review', title: hi ? 'मंज़ूरी के लिए टास्क आया' : 'Task submitted for approval', body: item + who }
    case 'task_issue': return { icon: 'warning', link: '/tasks', tab: 'issues', title: hi ? 'स्टाफ ने समस्या बताई' : 'Staff reported an issue', body: item + who }
    case 'issue_working': return { icon: 'clock', link: '/my-tasks', issueStatus: 'issue_working', title: hi ? 'एडमिन आपकी समस्या पर काम कर रहा है' : 'Admin is working on your issue', body: item }
    case 'issue_resolved': return { icon: 'check', link: '/my-tasks', issueStatus: 'issue_resolved', title: hi ? 'आपकी समस्या हल हो गई' : 'Your issue was resolved', body: item }
    case 'fix_assigned': return { icon: 'taskBoard', link: '/task-board', title: hi ? 'मरम्मत अनुरोध सौंपा गया' : 'Repair request assigned to you', body: item }
    case 'fix_new': return { icon: 'taskBoard', link: '/task-board', title: hi ? 'नया मरम्मत अनुरोध' : 'New repair request raised', body: item + who }
    case 'fix_approval': return { icon: 'inbox', link: '/task-board', title: hi ? 'मरम्मत मंज़ूरी के लिए' : 'Repair awaiting approval', body: item + who }
    // Work somebody did and then logged. The admins hear about it; the person
    // who did it obviously already knows.
    case 'fix_logged': return { icon: 'check', link: '/task-board', title: hi ? 'काम हो गया — दर्ज किया' : 'Work done and logged', body: item + who }
    // An admin nudging whoever is holding an overdue repair. Orange, not red:
    // it is late, not broken.
    case 'fix_reminder': return { icon: 'bell', link: '/task-board', title: hi ? 'याद दिलाया गया — यह अब भी बाकी है' : 'Reminder — this is still pending', body: item + who }
    case 'fix_approved': return { icon: 'check', link: '/task-board', title: hi ? 'आपका मरम्मत अनुरोध मंज़ूर हुआ' : 'Your repair was approved', body: item }
    // An update on a request you are on — from the person who raised it, or the
    // person doing it. Named, because "someone said something" is not a reason
    // to open an app.
    case 'fix_update': return { icon: 'mic', link: '/task-board', title: hi ? 'मरम्मत पर नया अपडेट' : 'New update on a repair', body: item + who }
    case 'fix_closed_by_admin': return { icon: 'check', link: '/task-board', title: hi ? 'एडमिन ने आपकी रिक्वेस्ट पूरी मार्क की' : 'Admin marked your repair complete', body: item }
    case 'valet_booking': return { icon: 'valet', link: '/valet', title: hi ? 'नई वैले बुकिंग' : 'New valet booking', body: item }
    case 'quiz_completed': return { icon: 'training', link: '/training', title: hi ? 'क्विज़ पूरा हुआ' : 'Quiz completed', body: item + who }
    case 'training_assigned': return { icon: 'training', link: '/training', title: hi ? 'नई ट्रेनिंग सौंपी गई' : 'New training assigned', body: item }
    // one reminder per person per day: a single task carries its title + id,
    // several arrive as a digest whose task_text is just the count
    case 'task_due': return {
      icon: 'clock', link: '/my-tasks', status: 'overdue',
      title: hi ? 'टास्क की समय-सीमा' : 'Task due / overdue',
      body: n.entity_id ? item : (hi ? `${item} टास्क आज ड्यू हैं` : `${item} tasks due today`),
    }
    default: return { icon: 'bell', link: '/dashboard', title: n.type, body: item }
  }
}

export default function NotificationBell() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const navigate = useNavigate()
  const { items, unread, markRead, markAll } = useNotifications()
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(0)
  const ref = useRef(null)
  const btnRef = useRef(null)

  // open below the bell but pinned to the viewport's right edge (see panel style)
  const toggle = () => {
    if (!open && btnRef.current) setTop(btnRef.current.getBoundingClientRect().bottom + 8)
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function openItem(n) {
    if (!n.is_read) markRead(n.id)
    setOpen(false)
    const { link, tab, status, issueStatus } = meta(n, hi)
    if (!link) return
    // deep-link: carry the item id so the target page opens that exact task /
    // fix request, plus the tab (admin) / task-status / issue-status filter
    // (employee) so it also lands on the right list — not just the page.
    const id = n.entity_id
    const state = {}
    if (id) {
      if (n.type.startsWith('fix_')) state.focusFix = id
      else if (n.type.startsWith('task_') || n.type.startsWith('issue_')) state.focusTask = id
    }
    if (tab) state.tab = tab
    if (status) state.status = status
    if (issueStatus) state.issueStatus = issueStatus
    navigate(link, Object.keys(state).length ? { state } : undefined)
  }

  // Open whatever a tapped push named. Two ways in, one handler:
  //
  //   ?n=<id>   the app was closed and the worker opened it at that url
  //   postMessage  the app was already open, so the worker handed it the url
  //     instead — see push-sw.js, where navigate() is refused on any window the
  //     worker does not control
  //
  // openById reuses openItem, so a push and a tap on the bell land in exactly
  // the same place. `busy` stops a re-render from opening it twice.
  const openingRef = useRef(null)
  const openById = useCallback(async (id) => {
    if (!id || openingRef.current === id) return
    openingRef.current = id
    const { data } = await supabase.from('notifications').select('*').eq('id', id).maybeSingle()
    if (data) openItem(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // arrived with ?n= — open it, then take the parameter out of the address bar
  // so a refresh does not reopen it
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const id = q.get('n')
    if (!id) return
    q.delete('n')
    const rest = q.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
    openById(id)
  }, [openById])

  // already open when the push was tapped
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const onMsg = (e) => {
      if (e.data?.type !== 'ambria:open' || !e.data.url) return
      const id = new URL(e.data.url, window.location.origin).searchParams.get('n')
      // a fresh tap on the same notification should open it again
      openingRef.current = null
      if (id) openById(id)
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [openById])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={t.notifications || 'Notifications'}
        title={t.notifications || 'Notifications'}
        style={{ position: 'relative', width: 38, height: 38, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, color: C.tl, display: 'grid', placeItems: 'center' }}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: C.maroon, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: `1.5px solid ${C.card}` }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'fixed', top, right: 12, zIndex: 600, width: 'min(360px, calc(100vw - 24px))', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: C.shadowLg || C.shadow, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontWeight: 800, fontSize: 14.5, color: C.text }}>{t.notifications || 'Notifications'}</span>
            {unread > 0 && (
              <button onClick={markAll} style={{ background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 700 }}>
                {t.markAllRead || 'Mark all read'}
              </button>
            )}
          </div>

          <div style={{ maxHeight: 'min(420px, 70vh)', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: C.faint }}>
                <Icon name="bell" size={26} color={C.faint} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13.5 }}>{t.noNotifications || 'No notifications yet'}</div>
              </div>
            ) : (
              items.map((n) => {
                const m = meta(n, hi)
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    style={{ display: 'flex', gap: 11, width: '100%', textAlign: 'left', padding: '11px 14px', borderBottom: `1px solid ${C.border}`, background: n.is_read ? 'transparent' : C.maroonSoft, cursor: 'pointer' }}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: C.cardAlt, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Icon name={m.icon} size={16} color={C.maroon} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, flex: 1 }}>{m.title}</span>
                        <span style={{ fontSize: 11, color: C.faint, flexShrink: 0 }}>{ago(n.created_at, hi)}</span>
                      </div>
                      {m.body && <div style={{ fontSize: 12.5, color: C.tl, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div>}
                    </div>
                    {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.maroon, flexShrink: 0, marginTop: 6 }} />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
