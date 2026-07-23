import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nowISO, todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { TASK_STATUS, TASK_CATEGORIES, isTaskOverdue } from '../../constants/org'
import { statusColors } from '../../constants/status'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import PhotoCapture from '../../components/common/PhotoCapture'
import AudioPlayer from '../../components/common/AudioPlayer'
import Icon from '../../components/common/Icon'

const AUTO_REFRESH_MS = 30000
const TR_ORANGE = '#EA580C' // overdue accent (matches the dashboard)

const metaLine = (C) => ({ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: C.tl, marginTop: 2 })

// format a millisecond duration as "1h 4m 12s" (trims leading zero units)
function fmtDur(ms) {
  if (ms == null || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}h ${m}m ${sec}s`
  if (m) return `${m}m ${sec}s`
  return `${sec}s`
}

function tintBg(hex, alpha = 0.12) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Structured status banner: colored icon chip + title + subtitle, soft accent border.
function Notice({ C, tone, bg, icon, title, sub }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: bg,
        border: `1px solid ${tintBg(tone, 0.25)}`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 12,
        padding: '13px 14px',
        marginTop: 12,
      }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 8, background: tintBg(tone, 0.16), color: tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} color={tone} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tone }}>{title}</div>
        {sub && <div style={{ fontSize: 13.5, color: C.text, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function MyTasks() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  // status filter — may be preset from the dashboard KPI tiles
  const location = useLocation()
  const [status, setStatus] = useState(location.state?.status || 'all')
  const [active, setActive] = useState(null) // task open in work modal

  const load = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user.id)
      .order('task_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setTasks(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
    // Auto-refresh, but be a good citizen under load:
    //  - skip polling while the tab is hidden (no point querying a backgrounded app)
    //  - add random jitter so 100s of clients don't all hit the DB on the same second
    //  - refresh immediately when the user returns to the tab
    const interval = AUTO_REFRESH_MS + Math.floor(Math.random() * 10000)
    const tick = () => { if (!document.hidden) load() }
    const id = setInterval(tick, interval)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // apply a status preset passed from the dashboard tiles
  useEffect(() => { if (location.state?.status) setStatus(location.state.status) }, [location.state])

  // deep-link from a notification: open the exact task by id
  const focusedRef = useRef(null)
  useEffect(() => {
    const id = location.state?.focusTask
    if (!id || focusedRef.current === id) return
    focusedRef.current = id
    ;(async () => {
      const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
      if (data) setActive(data)
    })()
  }, [location.state])

  const today = todayISO()
  const filtered = useMemo(() => {
    let rows = cat === 'all' ? tasks : tasks.filter((x) => x.category === cat)
    if (status === 'overdue') rows = rows.filter((x) => isTaskOverdue(x, today))
    else if (status !== 'all') rows = rows.filter((x) => x.status === status)
    return rows
  }, [tasks, cat, status, today])

  const statusChips = [
    { key: 'all', label: t.all },
    { key: 'overdue', label: t.overdue },
    { key: TASK_STATUS.PENDING, label: t.pending },
    { key: TASK_STATUS.IN_PROGRESS, label: t.inProgress },
    { key: TASK_STATUS.COMPLETION_REQUESTED, label: t.completionRequested },
    { key: TASK_STATUS.COMPLETED, label: t.completed },
  ]

  // group by status for a clean read: active first
  const order = [
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.PENDING,
    TASK_STATUS.COMPLETION_REQUESTED,
    TASK_STATUS.ISSUE,
    TASK_STATUS.COMPLETED,
  ]
  const sorted = [...filtered].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))

  return (
    <div>
      <SectionTitle>{t.myTasks}</SectionTitle>

      {/* status filter — dropdown (driven by dashboard tiles, also selectable here) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="inbox" size={16} color={C.tl} />
        <select style={inputStyle(C)} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.status || 'Status'}>
          {statusChips.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
        </select>
      </div>

      {/* category filter — full-width segmented row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Chip C={C} full active={cat === 'all'} onClick={() => setCat('all')}>{t.all}</Chip>
        {TASK_CATEGORIES.map((c) => (
          <Chip key={c} C={C} full active={cat === c} onClick={() => setCat(c)}>{t[c]}</Chip>
        ))}
      </div>

      {loading ? (
        <Loader label={t.loading} />
      ) : sorted.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sorted.map((task) => (
            <TaskRow key={task.id} task={task} C={C} t={t} today={today} hi={lang === 'hi'} onOpen={() => setActive(task)} />
          ))}
        </div>
      )}

      {active && (
        <WorkModal
          task={active}
          onClose={() => setActive(null)}
          onSaved={() => { setActive(null); load() }}
          user={user}
        />
      )}
    </div>
  )
}

function Chip({ children, active, onClick, C, full }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600,
        background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
        flex: full ? 1 : undefined, // full: share the row evenly (segmented control)
      }}
    >
      {children}
    </button>
  )
}

// show the Hindi task title when the app is in Hindi and one exists
const taskTitle = (task, hi) => (hi && task.title_hi ? task.title_hi : task.title)

function TaskRow({ task, C, t, today, onOpen, hi }) {
  const sc = statusColors(task.status, C)
  const od = isTaskOverdue(task, today)
  return (
    <Card onClick={onOpen} style={{ cursor: 'pointer', borderLeft: `4px solid ${od ? TR_ORANGE : sc.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{taskTitle(task, hi)}</div>
          {task.area && <div style={metaLine(C)}><Icon name="pin" size={14} /> {task.area}</div>}
          {task.time_block && <div style={metaLine(C)}><Icon name="clock" size={14} /> {task.time_block}</div>}
          {task.due_date && (
            <div style={{ ...metaLine(C), color: od ? TR_ORANGE : C.tl, fontWeight: od ? 700 : 500 }}>
              <Icon name={od ? 'warning' : 'clock'} size={14} color={od ? TR_ORANGE : C.tl} />
              {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(task.due_date)}
            </div>
          )}
          {task.rejection_note && task.status === TASK_STATUS.IN_PROGRESS && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.red, fontWeight: 600, marginTop: 4 }}>
              <Icon name="warning" size={13} /> {t.sentBack}
            </div>
          )}
        </div>
        <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
      </div>
    </Card>
  )
}

// ---- Start Work (before photo) -> work (timer) -> Mark for Completion (after photo) ----
function WorkModal({ task, onClose, onSaved, user }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const [beforePhotos, setBeforePhotos] = useState(Array.isArray(task.before_photo) ? task.before_photo : [])
  const [photos, setPhotos] = useState(Array.isArray(task.completion_photo) ? task.completion_photo : [])
  const [note, setNote] = useState(task.completion_note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [issueMode, setIssueMode] = useState(false)
  const [issueText, setIssueText] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const sc = statusColors(task.status, C)
  const isPending = task.status === TASK_STATUS.PENDING
  const isInProgress = task.status === TASK_STATUS.IN_PROGRESS
  const isWaiting = task.status === TASK_STATUS.COMPLETION_REQUESTED
  const isDone = task.status === TASK_STATUS.COMPLETED

  const canStart = beforePhotos.length > 0   // must add a "before" photo to start
  const canComplete = photos.length > 0      // must add an "after" photo to submit

  // live timer while working
  useEffect(() => {
    if (!isInProgress) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isInProgress])

  const startMs = task.started_at ? new Date(task.started_at).getTime() : null
  const endMs = task.completion_requested_at ? new Date(task.completion_requested_at).getTime()
    : (task.completed_at ? new Date(task.completed_at).getTime() : null)
  const elapsedMs = startMs == null ? null : (isInProgress ? now - startMs : (endMs != null ? endMs - startMs : null))

  async function update(patch) {
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    setBusy(false)
    if (error) { setErr(error.message); return false }
    return true
  }

  async function startWork() {
    if (!canStart) { setErr(hi ? 'शुरू करने से पहले "पहले" वाली फ़ोटो डालें' : 'Add a "before" photo to start') ; return }
    if (await update({ status: TASK_STATUS.IN_PROGRESS, before_photo: beforePhotos, started_at: nowISO(), started_by: user.id })) onSaved()
  }

  async function saveBefore(next) {
    setBeforePhotos(next)
  }

  async function savePhotos(next) {
    setPhotos(next)
    await update({ completion_photo: next })
  }

  async function markForCompletion() {
    if (!canComplete) { setErr(t.photoRequired); return }
    const ok = await update({
      status: TASK_STATUS.COMPLETION_REQUESTED,
      completion_photo: photos,
      completion_note: note,
      completion_requested_at: nowISO(),
      rejection_note: null, // clear the previous send-back reason on resubmit
      // NOTE: rejection_voice_url is intentionally kept until the task is
      // completed/approved (admin deletes it then), so the recording isn't
      // orphaned in storage. It's hidden from staff once resubmitted anyway.
    })
    if (ok) onSaved()
  }

  async function reportIssue() {
    if (!issueText.trim()) return
    if (await update({ status: TASK_STATUS.ISSUE, notes: issueText })) onSaved()
  }

  const beforeLabel = hi ? 'काम से पहले' : 'Before work'
  const afterLabel = hi ? 'काम के बाद' : 'After work'
  const thumbs = (arr) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {(arr || []).length ? arr.map((u) => (
        <img key={u} src={u} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />
      )) : <span style={{ fontSize: 13, color: C.faint }}>—</span>}
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={taskTitle(task, hi)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          {isPending && !issueMode && <Button variant="primary" onClick={startWork} disabled={busy || !canStart} style={{ flex: 2 }}>{t.startWork}</Button>}
          {isInProgress && !issueMode && (
            <Button variant="success" onClick={markForCompletion} disabled={busy || !canComplete} style={{ flex: 2 }}>
              {t.markForCompletion}
            </Button>
          )}
          {issueMode && <Button variant="danger" onClick={reportIssue} disabled={busy} style={{ flex: 2 }}>{t.submit}</Button>}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
        {task.category && <Badge>{t[task.category]}</Badge>}
      </div>

      {(task.rejection_note || task.rejection_voice_url) && (isInProgress || isPending) && !issueMode && (
        <div style={{ background: C.rBg, borderRadius: 10, padding: 12, marginBottom: 14, border: `1px solid ${C.red}22` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.red, fontWeight: 700, fontSize: 13.5 }}>
            <Icon name="warning" size={16} /> {t.sentBack}
          </div>
          {task.rejection_note && <div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{task.rejection_note}</div>}
          {task.rejection_voice_url && (
            <div style={{ marginTop: 10 }}>
              <AudioPlayer src={task.rejection_voice_url} label={t.voiceNote} />
            </div>
          )}
        </div>
      )}

      {task.description && <p style={{ fontSize: 14, color: C.tl, marginBottom: 14, lineHeight: 1.5 }}>{task.description}</p>}
      {task.area && <p style={{ ...metaLine(C), fontSize: 14, marginBottom: 6 }}><Icon name="pin" size={15} /> {task.area}</p>}
      {task.time_block && <p style={{ ...metaLine(C), fontSize: 14, marginBottom: 14 }}><Icon name="clock" size={15} /> {task.time_block}</p>}

      {/* work timer */}
      {elapsedMs != null && !issueMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: isInProgress ? C.bBg : C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          <Icon name="clock" size={18} color={isInProgress ? C.blue : C.tl} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: isInProgress ? C.blue : C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtDur(elapsedMs)}</div>
            <div style={{ fontSize: 12, color: C.tl }}>{isInProgress ? (hi ? 'काम जारी है…' : 'Working…') : (hi ? 'कुल समय लगा' : 'Total time taken')}</div>
          </div>
        </div>
      )}

      {/* BEFORE photo — required to start */}
      {!issueMode && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {beforeLabel} {isPending && <span style={{ color: C.red }}>*</span>}
          </div>
          {isPending ? <PhotoCapture folder="tasks" value={beforePhotos} onChange={saveBefore} /> : thumbs(beforePhotos)}
        </div>
      )}

      {/* AFTER photo — required to submit for approval */}
      {(isInProgress || isWaiting || isDone) && !issueMode && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {afterLabel} {isInProgress && <span style={{ color: C.red }}>*</span>}
          </div>
          {isInProgress ? <PhotoCapture folder="tasks" value={photos} onChange={savePhotos} /> : thumbs(photos)}

          {isInProgress && (
            <div style={{ marginTop: 12 }}>
              <Field label={`${t.completionNote} (${t.optional})`}>
                <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      )}

      {isWaiting && <Notice C={C} tone={C.yellow} bg={C.yBg} icon="clock" title={t.completionRequested} sub={t.awaitingApprovalMsg} />}
      {isDone && <Notice C={C} tone={C.green} bg={C.gBg} icon="check" title={t.completed} sub={t.completedMsg} />}
      {task.status === TASK_STATUS.ISSUE && <Notice C={C} tone={C.red} bg={C.rBg} icon="warning" title={t.issue} sub={task.notes} />}

      {!isDone && !isWaiting && (
        <div style={{ marginTop: 16 }}>
          {!issueMode ? (
            <button onClick={() => setIssueMode(true)} style={{ background: 'transparent', color: C.red, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="warning" size={16} /> {t.reportIssue}
            </button>
          ) : (
            <Field label={t.reportIssue}>
              <textarea rows={3} style={{ ...inputStyle(C), resize: 'vertical' }} value={issueText} onChange={(e) => setIssueText(e.target.value)} autoFocus />
              <button onClick={() => setIssueMode(false)} style={{ background: 'transparent', color: C.tl, fontSize: 13, marginTop: 6 }}>{t.cancel}</button>
            </Field>
          )}
        </div>
      )}

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{err}</div>}
    </Modal>
  )
}
