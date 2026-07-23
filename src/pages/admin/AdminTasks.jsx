import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { nowISO, todayISO, fmtDate, fmtDateTime } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { TASK_STATUS, TASK_CATEGORIES, PRIORITIES, PROPERTIES, PROPERTY_MAP, DEPARTMENT_MAP, canSeeAllProperties, scopedProperty, scopedDepartment, isTaskOverdue } from '../../constants/org'
import { statusColors } from '../../constants/status'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Tabs, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import VoiceRecorder from '../../components/common/VoiceRecorder'
import { deleteStorageFile } from '../../lib/storage'
import { translateToHindi } from '../../lib/translate'

const TR_ORANGE = '#EA580C' // overdue accent (matches the dashboard)

export default function AdminTasks() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()

  const canSeeAllProps = canSeeAllProperties(user)
  const location = useLocation()
  const presetProp = location.state?.property // set when navigating from the dashboard
  const presetTab = location.state?.tab       // which tab to open (e.g. 'pending', 'completed')
  const presetMember = location.state?.member // staff filter carried from the dashboard

  const PAGE_SIZE = 20
  const TAB_KEYS = ['overdue', 'pending', 'inprogress', 'completed', 'review', 'all']

  const [members, setMembers] = useState([])
  const [list, setList] = useState([])       // current page of rows for the active tab
  const [counts, setCounts] = useState({})   // per-tab totals (server counts)
  const [loading, setLoading] = useState(true)       // first load
  const [listLoading, setListLoading] = useState(false) // subsequent refreshes
  const [page, setPage] = useState(0)
  const [tab, setTab] = useState(presetTab || 'pending')
  const [propFilter, setPropFilter] = useState(
    canSeeAllProps ? (presetProp || 'all') : user.property
  )
  const [catFilter, setCatFilter] = useState('all') // all | daily | weekly | monthly
  const [memberFilter, setMemberFilter] = useState(presetMember || 'all') // all | <staff id>
  const [review, setReview] = useState(null)
  const [creating, setCreating] = useState(false)
  const [xlate, setXlate] = useState('') // one-time Hindi-title backfill status

  const today = todayISO()

  // apply property / department / category / staff filters to any query
  const applyFilters = useCallback((q) => {
    const deptScope = scopedDepartment(user) // Sandeep → security only
    if (propFilter !== 'all') q = q.eq('property', propFilter)
    if (deptScope) q = q.eq('department', deptScope)
    if (catFilter !== 'all') q = q.eq('category', catFilter)
    if (memberFilter !== 'all') q = q.eq('assigned_to', memberFilter)
    return q
  }, [user, propFilter, catFilter, memberFilter])

  // narrow a query to a tab's status condition
  const withStatus = useCallback((q, key) => {
    if (key === 'pending') return q.eq('status', TASK_STATUS.PENDING)
    if (key === 'inprogress') return q.eq('status', TASK_STATUS.IN_PROGRESS)
    if (key === 'completed') return q.eq('status', TASK_STATUS.COMPLETED)
    if (key === 'review') return q.eq('status', TASK_STATUS.COMPLETION_REQUESTED)
    if (key === 'overdue') return q.lt('due_date', today).neq('status', TASK_STATUS.COMPLETED)
    return q // 'all'
  }, [today])

  // deep-link from a notification: open the exact task's review modal by id
  const focusedRef = useRef(null)
  useEffect(() => {
    const id = location.state?.focusTask
    if (!id || focusedRef.current === id) return
    focusedRef.current = id
    ;(async () => {
      const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
      if (data) setReview(data)
    })()
  }, [location.state])

  // staff list for the filter dropdown — scoped to the admin, loaded once
  useEffect(() => {
    if (!user) return
    const propScope = scopedProperty(user)
    const deptScope = scopedDepartment(user)
    let mq = supabase.from('users').select('id, name, department, property').eq('is_active', true).eq('role', 'e').order('name')
    if (propScope) mq = mq.eq('property', propScope)
    if (deptScope) mq = mq.eq('department', deptScope)
    mq.then(({ data }) => setMembers(data || []))
  }, [user])

  // load per-tab counts + the active tab's page whenever filters/tab/page change
  const load = useCallback(async () => {
    if (!user) return
    setListLoading(true)
    const countPairs = await Promise.all(TAB_KEYS.map((k) =>
      withStatus(applyFilters(supabase.from('tasks').select('*', { count: 'exact', head: true })), k)
        .then(({ count }) => [k, count || 0])
    ))
    const from = page * PAGE_SIZE
    const { data } = await withStatus(
      applyFilters(supabase.from('tasks').select('*').order('created_at', { ascending: false })),
      tab
    ).range(from, from + PAGE_SIZE - 1)

    setCounts(Object.fromEntries(countPairs))
    setList(data || [])
    setListLoading(false)
    setLoading(false)
  }, [user, applyFilters, withStatus, tab, page])

  useEffect(() => { load() }, [load])

  // one-time: fill Hindi titles for existing tasks that don't have one yet
  async function backfillHindiTitles() {
    setXlate('working')
    const { data } = await supabase.from('tasks').select('id, title').is('title_hi', null)
    let done = 0
    for (const row of (data || [])) {
      if (!row.title) continue
      try {
        const hiTitle = await translateToHindi(row.title)
        if (hiTitle) { await supabase.from('tasks').update({ title_hi: hiTitle }).eq('id', row.id); done++ }
      } catch { /* skip this one */ }
    }
    setXlate(`done:${done}`)
    load()
  }

  // filter/tab changes reset to the first page (single fetch, no double-load)
  const changeTab = (k) => { setTab(k); setPage(0) }
  const changeProp = (p) => { setPropFilter(p); setPage(0) }
  const changeCat = (c) => { setCatFilter(c); setPage(0) }
  const changeMember = (m) => { setMemberFilter(m); setPage(0) }

  // staff shown in the name filter — scoped to the selected property when set
  const memberOptions = useMemo(() => {
    const opts = propFilter === 'all' ? members : members.filter((m) => m.property === propFilter)
    return [...opts].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members, propFilter])

  // if the selected staff isn't in the current property scope, reset to All
  useEffect(() => {
    if (memberFilter !== 'all' && members.length && !memberOptions.some((m) => m.id === memberFilter)) {
      setMemberFilter('all'); setPage(0)
    }
  }, [memberOptions, memberFilter, members])

  const c = (k) => (counts[k] ? ` (${counts[k]})` : '')
  const tabs = [
    { key: 'overdue', label: `${t.overdue}${c('overdue')}` },
    { key: 'pending', label: `${t.pending}${c('pending')}` },
    { key: 'inprogress', label: `${t.inProgress}${c('inprogress')}` },
    { key: 'completed', label: `${t.completed}${c('completed')}` },
    { key: 'review', label: `${t.reviewQueue}${c('review')}` },
    { key: 'all', label: `${t.all} (${counts.all || 0})` },
  ]

  if (loading) return <Loader label={t.loading} />

  const total = counts[tab] || 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <SectionTitle
        right={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {xlate === 'working'
              ? <span style={{ fontSize: 12.5, color: C.tl }}>{t.translating || 'Translating…'}</span>
              : xlate.startsWith('done:') && <span style={{ fontSize: 12.5, color: C.green }}>+{xlate.slice(5)} हिंदी</span>}
            <Button variant="ghost" onClick={backfillHindiTitles} disabled={xlate === 'working'} title={t.hindiTitles || 'Fill Hindi titles'}>
              <Icon name="refresh" size={15} style={{ marginRight: 4 }} />{t.hindiTitles || 'Hindi titles'}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{t.tasks}</Button>
          </div>
        )}
      >
        {t.tasks}
      </SectionTitle>

      {/* venue filter (left) + staff-name filter (right) on one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {canSeeAllProps && (
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, minWidth: 0 }}>
            <PropChip C={C} active={propFilter === 'all'} onClick={() => changeProp('all')}>{t.all}</PropChip>
            {PROPERTIES.map((p) => (
              <PropChip key={p.code} C={C} active={propFilter === p.code} onClick={() => changeProp(p.code)}>{p.name}</PropChip>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', maxWidth: 340, flexShrink: 0 }}>
          <Icon name="user" size={16} color={C.tl} />
          <select
            style={inputStyle(C)}
            value={memberFilter}
            onChange={(e) => changeMember(e.target.value)}
            aria-label={t.members}
          >
            <option value="all">{t.members} — {t.all}</option>
            {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* category filter — daily / weekly / monthly */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
        <PropChip C={C} active={catFilter === 'all'} onClick={() => changeCat('all')}>{t.all}</PropChip>
        {TASK_CATEGORIES.map((cat) => (
          <PropChip key={cat} C={C} active={catFilter === cat} onClick={() => changeCat(cat)}>{t[cat]}</PropChip>
        ))}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={changeTab} />

      {listLoading && list.length === 0 ? (
        <Loader label={t.loading} />
      ) : list.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12, opacity: listLoading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {list.map((task) => {
            const sc = statusColors(task.status, C)
            const od = isTaskOverdue(task, today)
            return (
              <Card key={task.id} onClick={() => setReview(task)} style={{ cursor: 'pointer', borderLeft: `4px solid ${sc.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{task.title}</span>
                      {task.category && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.maroon, background: C.maroonSoft, padding: '2px 8px', borderRadius: 999 }}>
                          {t[task.category]}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>
                      {task.assignee_name || '—'}{task.area ? ` · ${task.area}` : ''}
                    </div>
                    {canSeeAllProps && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="pin" size={12} /> {PROPERTY_MAP[task.property]?.name || task.property}
                      </div>
                    )}
                    {task.due_date && (
                      <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: od ? TR_ORANGE : C.faint, fontWeight: od ? 700 : 500 }}>
                        <Icon name={od ? 'warning' : 'clock'} size={12} color={od ? TR_ORANGE : C.faint} />
                        {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(task.due_date)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
                    <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
                    {task.status === TASK_STATUS.COMPLETED && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setReview(task) }}
                        title={t.delete}
                        aria-label={t.delete}
                        style={{ background: 'transparent', color: C.tl, display: 'grid', placeItems: 'center', padding: 2, lineHeight: 0 }}
                      >
                        <Icon name="close" size={18} color={C.tl} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* pagination — only when the active tab has more than one page */}
      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 16 }}>
          <Button variant="ghost" disabled={page <= 0 || listLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <Icon name="chevronRight" size={16} style={{ transform: 'rotate(180deg)' }} /> {t.prev || 'Prev'}
          </Button>
          <span style={{ fontSize: 13, color: C.tl, fontWeight: 600 }}>{page + 1} / {pageCount}</span>
          <Button variant="ghost" disabled={page >= pageCount - 1 || listLoading} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            {t.next || 'Next'} <Icon name="chevronRight" size={16} />
          </Button>
        </div>
      )}

      {review && (
        <ReviewModal task={review} user={user} onClose={() => setReview(null)} onSaved={() => { setReview(null); load() }} />
      )}
      {creating && (
        <CreateModal user={user} members={members} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
      )}
    </div>
  )
}

function PropChip({ children, active, onClick, C }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
        background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
      }}
    >
      {children}
    </button>
  )
}

function PhotoCol({ C, label, photos }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tl, marginBottom: 6 }}>{label}</div>
      {photos && photos.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {photos.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt="" style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />
            </a>
          ))}
        </div>
      ) : <div style={{ fontSize: 13, color: C.faint }}>—</div>}
    </div>
  )
}

function ReviewModal({ task, user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectVoice, setRejectVoice] = useState('')
  const sc = statusColors(task.status, C)
  const beforePhotos = Array.isArray(task.before_photo) ? task.before_photo : []
  const photos = Array.isArray(task.completion_photo) ? task.completion_photo : []
  const isQueue = task.status === TASK_STATUS.COMPLETION_REQUESTED

  // time the staff spent: started_at -> submitted/completed
  const startMs = task.started_at ? new Date(task.started_at).getTime() : null
  const endMs = task.completion_requested_at ? new Date(task.completion_requested_at).getTime()
    : (task.completed_at ? new Date(task.completed_at).getTime() : null)
  const durMs = (startMs != null && endMs != null) ? endMs - startMs : null
  const fmtDur = (ms) => {
    if (ms == null || ms < 0) return null
    const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
    return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`
  }

  async function update(patch) {
    setBusy(true); setErr('')
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    setBusy(false)
    if (error) { setErr(error.message); return false }
    return true
  }

  async function approve() {
    const voiceUrl = task.rejection_voice_url // send-back voice note, no longer needed once completed
    if (await update({ status: TASK_STATUS.COMPLETED, completed_at: nowISO(), completed_by: user.id, approved_by: user.id, approved_at: nowISO(), rejection_voice_url: null })) {
      if (voiceUrl) deleteStorageFile(voiceUrl)
      onSaved()
    }
  }
  async function del() {
    if (!window.confirm(t.deleteTaskConfirm || 'Delete this task permanently?')) return
    setBusy(true); setErr('')
    const voiceUrl = task.rejection_voice_url
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (voiceUrl) deleteStorageFile(voiceUrl)
    onSaved()
  }
  async function sendBack() {
    if (!rejectNote.trim() && !rejectVoice) return
    const prevVoice = task.rejection_voice_url // an earlier send-back's note, if any — replace it
    if (await update({ status: TASK_STATUS.IN_PROGRESS, rejection_note: rejectNote || null, rejection_voice_url: rejectVoice || null })) {
      if (prevVoice && prevVoice !== rejectVoice) deleteStorageFile(prevVoice)
      onSaved()
    }
  }

  return (
    <Modal
      open onClose={onClose} title={task.title}
      footer={isQueue ? (
        rejectMode ? (
          <>
            <Button variant="ghost" onClick={() => setRejectMode(false)} style={{ flex: 1 }}>{t.cancel}</Button>
            <Button variant="danger" onClick={sendBack} disabled={busy || (!rejectNote.trim() && !rejectVoice)} style={{ flex: 2 }}>{t.reject}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setRejectMode(true)} style={{ flex: 1 }}>{t.reject}</Button>
            <Button variant="success" onClick={approve} disabled={busy} style={{ flex: 2 }}>{t.approve}</Button>
          </>
        )
      ) : task.status === TASK_STATUS.COMPLETED ? (
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          <Button variant="danger" onClick={del} disabled={busy} style={{ flex: 1 }}>
            <Icon name="trash" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.delete}
          </Button>
        </>
      ) : (
        <Button variant="ghost" onClick={onClose} full>{t.close}</Button>
      )}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
        {task.category && <Badge>{t[task.category]}</Badge>}
      </div>
      <div style={{ fontSize: 14, marginBottom: 6 }}>{t.members}: <b>{task.assignee_name || '—'}</b></div>
      {task.completion_requested_at && <div style={{ fontSize: 13, color: C.tl, marginBottom: 12 }}>{fmtDateTime(task.completion_requested_at)}</div>}

      {/* time taken */}
      {durMs != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
          <Icon name="clock" size={16} color={C.tl} />
          <span style={{ fontSize: 13.5 }}>Time taken: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDur(durMs)}</b></span>
        </div>
      )}

      {task.completion_note && <p style={{ fontSize: 14, color: C.tl, marginBottom: 12 }}>{task.completion_note}</p>}

      {/* before / after comparison */}
      {(beforePhotos.length > 0 || photos.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <PhotoCol C={C} label="Before" photos={beforePhotos} />
          <PhotoCol C={C} label="After" photos={photos} />
        </div>
      )}

      {rejectMode && (
        <>
          <Field label={t.rejectionNote}>
            <textarea rows={3} style={{ ...inputStyle(C), resize: 'vertical' }} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
          </Field>
          <Field label={t.voiceNote}>
            <VoiceRecorder folder="task-voice" value={rejectVoice} onChange={setRejectVoice} />
          </Field>
        </>
      )}

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}

function CreateModal({ user, members, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const canSeeAllProps = canSeeAllProperties(user)
  const [form, setForm] = useState({
    title: '', description: '', category: 'daily', priority: 'medium', area: '', time_block: '', assigned_to: '', due_date: '',
    property: canSeeAllProps ? 'pp' : (user.property && user.property !== 'all' ? user.property : 'pp'),
  })
  const [dept, setDept] = useState('all') // narrow the assign list by department
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // departments that actually have staff, for the assign filter
  const deptOptions = useMemo(() => {
    const codes = [...new Set(members.map((m) => m.department).filter(Boolean))]
    return codes
      .map((code) => ({ code, name: DEPARTMENT_MAP[code]?.name || code }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members])

  // staff shown in the assign dropdown — filtered by the chosen property + department
  const assignable = useMemo(() => {
    let list = members
    if (form.property) list = list.filter((m) => m.property === form.property)
    if (dept !== 'all') list = list.filter((m) => m.department === dept)
    return list
  }, [members, dept, form.property])

  // if the current pick no longer matches the property/department filters, clear it
  useEffect(() => {
    if (form.assigned_to && !assignable.some((m) => m.id === form.assigned_to)) {
      setForm((f) => ({ ...f, assigned_to: '' }))
    }
  }, [assignable, form.assigned_to])

  async function save() {
    if (!form.title.trim()) { setErr(t.required); return }
    if (form.due_date && form.due_date < todayISO()) { setErr(t.dueDatePast); return }
    setBusy(true); setErr('')
    const assignee = members.find((m) => m.id === form.assigned_to)
    const id = newId('t_')
    // auto-translate the title to Hindi so staff on the Hindi UI see it (best-effort)
    let title_hi = null
    try { title_hi = await translateToHindi(form.title.trim()) } catch { /* leave null — falls back to English */ }
    const { error } = await supabase.from('tasks').insert({
      id,
      property: form.property || assignee?.property || (user.property !== 'all' ? user.property : 'pp'),
      department: assignee?.department || user.department || 'k',
      category: form.category,
      title: form.title.trim(),
      title_hi,
      description: form.description || null,
      area: form.area || null,
      time_block: form.time_block || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to || null,
      assignee_name: assignee?.name || null,
      status: TASK_STATUS.PENDING,
      task_date: todayISO(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={t.tasks}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label="Title"><input style={inputStyle(C)} value={form.title} onChange={set('title')} /></Field>
      <Field label={`Description (${t.optional})`}>
        <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.description} onChange={set('description')} />
      </Field>
      <Field label={t.properties || 'Property'}>
        <select style={inputStyle(C)} value={form.property} onChange={set('property')} disabled={!canSeeAllProps}>
          {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Category">
            <select style={inputStyle(C)} value={form.category} onChange={set('category')}>
              {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{t[c]}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Priority">
            <select style={inputStyle(C)} value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Department">
            <select style={inputStyle(C)} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">{t.all}</option>
              {deptOptions.map((dpt) => <option key={dpt.code} value={dpt.code}>{dpt.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Assign to">
            <select style={inputStyle(C)} value={form.assigned_to} onChange={set('assigned_to')}>
              <option value="">—</option>
              {assignable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.department && dept === 'all' ? ` · ${DEPARTMENT_MAP[m.department]?.name || m.department}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <Field label={`${t.dueDate} (${t.optional})`}>
        <input type="date" min={todayISO()} style={inputStyle(C)} value={form.due_date} onChange={set('due_date')} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label={`Area (${t.optional})`}><input style={inputStyle(C)} value={form.area} onChange={set('area')} /></Field></div>
        <div style={{ flex: 1 }}><Field label={`Time (${t.optional})`}><input style={inputStyle(C)} value={form.time_block} onChange={set('time_block')} placeholder="e.g. 9-10 AM" /></Field></div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
