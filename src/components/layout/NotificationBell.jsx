import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
    case 'task_assigned': return { icon: 'myTasks', link: '/my-tasks', title: hi ? 'नया टास्क सौंपा गया' : 'New task assigned', body: item }
    case 'task_sent_back': return { icon: 'warning', link: '/my-tasks', title: hi ? 'टास्क वापस भेजा गया — दोबारा करें' : 'Task sent back — please redo', body: item }
    case 'task_approved': return { icon: 'check', link: '/my-tasks', title: hi ? 'आपका काम मंज़ूर हुआ' : 'Your work was approved', body: item }
    case 'task_submitted': return { icon: 'inbox', link: '/tasks', title: hi ? 'मंज़ूरी के लिए टास्क आया' : 'Task submitted for approval', body: item + who }
    case 'task_issue': return { icon: 'warning', link: '/tasks', title: hi ? 'स्टाफ ने समस्या बताई' : 'Staff reported an issue', body: item + who }
    case 'fix_assigned': return { icon: 'taskBoard', link: '/task-board', title: hi ? 'मरम्मत अनुरोध सौंपा गया' : 'Repair request assigned to you', body: item }
    case 'fix_new': return { icon: 'taskBoard', link: '/task-board', title: hi ? 'नया मरम्मत अनुरोध' : 'New repair request raised', body: item + who }
    case 'fix_approval': return { icon: 'inbox', link: '/task-board', title: hi ? 'मरम्मत मंज़ूरी के लिए' : 'Repair awaiting approval', body: item + who }
    case 'fix_approved': return { icon: 'check', link: '/task-board', title: hi ? 'आपका मरम्मत अनुरोध मंज़ूर हुआ' : 'Your repair was approved', body: item }
    case 'valet_booking': return { icon: 'valet', link: '/valet', title: hi ? 'नई वैले बुकिंग' : 'New valet booking', body: item }
    case 'quiz_completed': return { icon: 'training', link: '/training', title: hi ? 'क्विज़ पूरा हुआ' : 'Quiz completed', body: item + who }
    case 'training_assigned': return { icon: 'training', link: '/training', title: hi ? 'नई ट्रेनिंग सौंपी गई' : 'New training assigned', body: item }
    case 'task_due': return { icon: 'clock', link: '/my-tasks', title: hi ? 'टास्क की समय-सीमा' : 'Task due / overdue', body: item }
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
    const { link } = meta(n, hi)
    if (!link) return
    // deep-link: carry the item id so the target page opens that exact
    // task / fix request, not just the page.
    const id = n.entity_id
    let state
    if (id) {
      if (n.type.startsWith('task_')) state = { focusTask: id }
      else if (n.type.startsWith('fix_')) state = { focusFix: id }
    }
    navigate(link, state ? { state } : undefined)
  }

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
