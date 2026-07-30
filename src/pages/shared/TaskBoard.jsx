import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nowISO, fmtDateTime, todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENTS, isAdminRole, isSuperAdmin, scopedProperty, scopedDepartment, DEPARTMENT_MAP, PROPERTY_MAP, propName, PROPERTIES, deptName, memberInProperty, assigneeLabel, isOwnAssignedWork, personName } from '../../constants/org'
import { assigneesQuery } from '../../lib/assignees'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Tabs, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import PhotoCapture from '../../components/common/PhotoCapture'
import AudioPlayer from '../../components/common/AudioPlayer'
import VoiceRecorder from '../../components/common/VoiceRecorder'
import Icon from '../../components/common/Icon'
import { useMediaQuery } from '../../hooks/useMediaQuery'

// The Completed tab only shows recent work by default — finished repairs pile
// up fast and bury the ones people still care about. The rest are one tap away.
const COMPLETED_DAYS = 7

const PRIOS = { low: 'tl', normal: 'blue', high: 'yellow', urgent: 'red' }
// 'low' is kept above so older rows still render, but it is not offered on new ones
const PRIO_CHOICES = ['normal', 'high', 'urgent']

// status -> label + colors. Flow: open -> assigned -> in_progress -> approval_requested -> completed
const STATUS_META = {
  open: { label: 'Open', tone: 'blue', bg: 'bBg' },
  assigned: { label: 'Assigned', tone: 'indigo', bg: 'cardAlt' },
  in_progress: { label: 'In Progress', tone: 'yellow', bg: 'yBg' },
  approval_requested: { label: 'Awaiting Approval', tone: 'yellow', bg: 'yBg' },
  completed: { label: 'Completed', tone: 'green', bg: 'gBg' },
  approved: { label: 'Completed', tone: 'green', bg: 'gBg' },
}

// localized labels for status + priority (STATUS_META/PRIOS are module-level, no `t`)
const statusLabel = (s, t) => ({
  open: t.open, assigned: t.assigned, in_progress: t.inProgress,
  approval_requested: t.completionRequested, completed: t.completed, approved: t.completed,
}[s] || t.open)
const prioLabel = (p, t) => ({ low: t.prioLow, normal: t.prioNormal, high: t.prioHigh, urgent: t.prioUrgent }[p] || p)

export default function TaskBoard() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()
  const { lang } = useLang()
  const location = useLocation()
  const admin = isAdminRole(user?.role)

  const [rows, setRows] = useState([])
  const [members, setMembers] = useState([]) // staff + admins available for assignment (admin)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(location.state?.tab || 'open')
  const [memberFilter, setMemberFilter] = useState('all') // filter list by assigned staff (admin)
  const [scope, setScope] = useState('assigned') // staff view: 'assigned' to me | 'posted' by me
  const [showAllDone, setShowAllDone] = useState(false) // Completed tab: recent vs everything
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(null)

  // react to a tab preset from navigation (e.g. dashboard "Overdue Repairs" tile)
  useEffect(() => { if (location.state?.tab) setTab(location.state.tab) }, [location.state])

  const load = useCallback(async () => {
    try {
      const propScope = scopedProperty(user)   // null = every property (SA, Vicky, Sandeep)
      const deptScope = scopedDepartment(user) // null = every department (Sandeep → security)
      let q = supabase.from('work_board').select('*').order('created_at', { ascending: false }).limit(300)
      if (propScope) q = q.eq('property', propScope)
      if (deptScope) q = q.eq('department', deptScope)
      const { data } = await q
      let all = data || []

      // always include requests assigned to me OR posted by me, even if they
      // fall outside my property/department scope
      const [{ data: mine }, { data: posted }] = await Promise.all([
        supabase.from('work_board').select('*').eq('assigned_to', user.id),
        supabase.from('work_board').select('*').eq('posted_by', user.id),
      ])
      ;[...(mine || []), ...(posted || [])].forEach((m) => { if (!all.some((x) => x.id === m.id)) all.push(m) })
      all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      setRows(all)

      if (admin) {
        // staff *and* fellow admins can take a repair request
        const { data: mem } = await assigneesQuery({ propScope, deptScope })
        setMembers(mem || [])
      }
    } catch {
      /* ignore — don't hang the loader */
    } finally {
      setLoading(false)
    }
  }, [user, admin])

  // keep the board fresh without a manual refresh: reload on mount, every 20s,
  // and whenever the tab/window regains focus (mirrors the notifications hook).
  // load() doesn't flip the loader, so these background refreshes never flicker.
  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  // deep-link from a notification: open the exact fix request by id
  const focusedRef = useRef(null)
  useEffect(() => {
    const id = location.state?.focusFix
    if (!id || focusedRef.current === id) return
    focusedRef.current = id
    ;(async () => {
      const { data } = await supabase.from('work_board').select('*').eq('id', id).maybeSingle()
      if (data) setActive(data)
    })()
  }, [location.state])

  // admin quick-delete a completed request straight from the list
  const removeRow = useCallback(async (id) => {
    if (!window.confirm(t.deleteRequestConfirm || 'Delete this request permanently?')) return
    await supabase.from('work_board').delete().eq('id', id)
    load()
  }, [t, load])

  // what the board shows:
  //  - admin: everything in scope, optionally narrowed to one staff member
  //  - staff: either work assigned to them, or requests they raised
  const visibleRows = useMemo(() => {
    if (admin) return memberFilter === 'all' ? rows : rows.filter((r) => r.assigned_to === memberFilter)
    return scope === 'posted'
      ? rows.filter((r) => r.posted_by === user.id)
      : rows.filter((r) => r.assigned_to === user.id)
  }, [rows, memberFilter, admin, scope, user.id])

  // repair rows keep the assignee name from assignment time; swap in the Hindi
  // name when the UI is Hindi and we know the person
  const nameOf = useCallback((id, stored) => {
    const m = members.find((x) => x.id === id)
    return (m && personName(m, lang)) || stored || ''
  }, [members, lang])

  const today = todayISO()
  const doneAll = useMemo(
    () => visibleRows.filter((r) => ['approved', 'completed'].includes(r.status)),
    [visibleRows]
  )
  const doneRecent = useMemo(() => {
    const cutoff = new Date(Date.now() - COMPLETED_DAYS * 86400000).toISOString()
    return doneAll.filter((r) => (r.resolved_at || r.created_at || '') >= cutoff)
  }, [doneAll])

  const groups = useMemo(() => ({
    // overdue = past its due date and not yet finished (cross-cuts open/in-progress)
    overdue: visibleRows.filter((r) => r.due_date && r.due_date < today && !['approved', 'completed'].includes(r.status)),
    open: visibleRows.filter((r) => ['open', 'assigned'].includes(r.status)),
    in_progress: visibleRows.filter((r) => r.status === 'in_progress'),
    review: visibleRows.filter((r) => r.status === 'approval_requested'),
    completed: showAllDone ? doneAll : doneRecent,
  }), [visibleRows, today, doneAll, doneRecent, showAllDone])

  const hiddenDone = doneAll.length - doneRecent.length

  // staff who actually have requests assigned — populate the name filter
  const memberOptions = useMemo(() => {
    const byId = new Map()
    rows.forEach((r) => { if (r.assigned_to && r.assigned_to_name) byId.set(r.assigned_to, r.assigned_to_name) })
    members.forEach((m) => { if (byId.has(m.id)) byId.set(m.id, m.name) })
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [rows, members])

  // collapse the status tabs into a dropdown on narrow screens (≤813px)
  const statusCompact = useMediaQuery('(max-width: 813px)')
  const tabs = [
    { key: 'overdue', label: `${t.overdue} (${groups.overdue.length})` },
    { key: 'open', label: `${t.open} (${groups.open.length})` },
    { key: 'in_progress', label: `${t.inProgress} (${groups.in_progress.length})` },
    { key: 'review', label: `${t.reviewQueue} (${groups.review.length})` },
    { key: 'completed', label: `${t.completed} (${groups.completed.length})` },
  ]

  if (loading) return <Loader label={t.loading} />
  const list = groups[tab]

  return (
    <div>
      <SectionTitle right={<Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{t.taskBoard}</Button>}>
        {t.taskBoard}
      </SectionTitle>

      {/* admins can grab the public (no-login) repair-request link to share */}
      {admin && <PublicLinkBar C={C} t={t} />}

      {/* staff view toggle — work assigned to me vs requests I raised */}
      {!admin && (
        <div className="no-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
          <ScopeChip C={C} active={scope === 'assigned'} onClick={() => setScope('assigned')}>{t.assignedToMe}</ScopeChip>
          <ScopeChip C={C} active={scope === 'posted'} onClick={() => setScope('posted')}>{t.myRequests}</ScopeChip>
        </div>
      )}

      {/* name-wise filter — show only the requests assigned to one staff member */}
      {admin && memberOptions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, maxWidth: 340, marginLeft: 'auto' }}>
          <Icon name="user" size={16} color={C.tl} />
          <select
            style={inputStyle(C)}
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            aria-label={t.members}
          >
            <option value="all">{t.members} — {t.all}</option>
            {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {/* status tabs on wide screens; one labeled dropdown when tight (≤813px) */}
      {statusCompact ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: 6 }}>{t.repairStatus}</div>
          <select
            style={inputStyle(C)}
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            aria-label={t.repairStatus}
          >
            {tabs.map((tb) => <option key={tb.key} value={tb.key}>{tb.label}</option>)}
          </select>
        </div>
      ) : (
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      )}

      {list.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((r) => {
            const st = STATUS_META[r.status] || STATUS_META.open
            const pTone = C[PRIOS[r.priority] || 'blue']
            const od = r.due_date && r.due_date < today && !['approved', 'completed'].includes(r.status)
            return (
              <Card key={r.id} onClick={() => setActive(r)} style={{ cursor: 'pointer', borderLeft: `4px solid ${od ? '#EA580C' : pTone}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>{r.posted_by_name} · {fmtDateTime(r.created_at)}</div>
                    {r.assigned_to_name && (
                      <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="user" size={12} /> {nameOf(r.assigned_to, r.assigned_to_name)}
                      </div>
                    )}
                    {r.assigned_to_name && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="pin" size={12} />
                        {propName(r.property, lang)}
                        {r.department ? ` · ${deptName(r.department, lang)}` : ''}
                      </div>
                    )}
                    {r.due_date && (
                      <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: od ? '#EA580C' : C.tl, fontWeight: od ? 700 : 400 }}>
                        <Icon name={od ? 'warning' : 'clock'} size={12} color={od ? '#EA580C' : C.tl} /> {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(r.due_date)}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: pTone }} />
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: pTone, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{prioLabel(r.priority, t)}</span>
                    </div>
                    {r.rating > 0 && (
                      <div style={{ marginTop: 6 }}><Stars value={r.rating} C={C} size={15} /></div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
                    <Badge color={C[st.tone]} bg={C[st.bg]}>{statusLabel(r.status, t)}</Badge>
                    {/* quick-delete a finished request — never your own work */}
                    {admin && ['completed', 'approved'].includes(r.status) && !isOwnAssignedWork(user, r.assigned_to) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeRow(r.id) }}
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

      {/* older finished repairs are hidden rather than deleted — they still
          count in Analytics and in each staff member's rating history */}
      {tab === 'completed' && hiddenDone > 0 && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowAllDone((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 999,
              background: C.card, border: `1px solid ${C.border}`,
              color: C.tl, fontSize: 13, fontWeight: 600,
            }}
          >
            <Icon name={showAllDone ? 'chevronLeft' : 'refresh'} size={14} color={C.tl} />
            {showAllDone ? t.showRecentOnly : `${t.showOlder} (${hiddenDone})`}
          </button>
          {!showAllDone && (
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7 }}>
              {t.completedWindowNote}
            </div>
          )}
        </div>
      )}

      {creating && <PostModal user={user} members={members} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {active && <DetailModal row={active} user={user} admin={admin} members={members} onClose={() => { setActive(null); load() }} onSaved={() => { setActive(null); load() }} />}
    </div>
  )
}

// Admin-only bar showing the PUBLIC (no-login) repair-request link + a copy
// button, so the shareable link can always be found without memorizing it.
function PublicLinkBar({ C, t }) {
  const [copied, setCopied] = useState(false)
  // origin + Vite base ('/Ambria---Workforce/') + route → full public URL
  const link = `${window.location.origin}${import.meta.env.BASE_URL}fix-request`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // clipboard blocked (e.g. non-secure context) — select the field instead
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="taskBoard" size={15} color={C.maroon} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.publicRepairLink}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          style={{ ...inputStyle(C), flex: 1, minWidth: 220, fontSize: 13 }}
        />
        <Button variant="soft" onClick={copy} style={{ padding: '9px 14px', flexShrink: 0 }}>
          <Icon name={copied ? 'check' : 'copy'} size={15} color={C.maroon} style={{ marginRight: 4 }} />
          {copied ? t.copied : t.copy}
        </Button>
      </div>
      <div style={{ fontSize: 12, color: C.tl, marginTop: 8 }}>{t.publicLinkHint}</div>
    </div>
  )
}

function PostModal({ user, members = [], onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const admin = isAdminRole(user?.role)          // admin + super admin can assign at creation
  const superAdmin = isSuperAdmin(user?.role)    // only super admin picks the property
  const [form, setForm] = useState({
    title: '', description: '', priority: 'normal', due_date: '',
    property: user.property && user.property !== 'all' ? user.property : 'pp',
    dept: '',
  })
  const [photos, setPhotos] = useState([])
  const [voice, setVoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fieldErr, setFieldErr] = useState({}) // per-field validation shown inline
  const titleRef = useRef(null)
  const dueRef = useRef(null)
  const deptRef = useRef(null)
  // update a field and clear its inline error as the user fixes it
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFieldErr((fe) => (fe[k] ? { ...fe, [k]: undefined } : fe))
  }

  // everyone at the chosen venue — the picker narrows it by kind + department
  const atProperty = useMemo(
    () => members.filter((m) => memberInProperty(m, form.property)),
    [members, form.property]
  )

  async function save() {
    // validate per-field so the message appears next to the field, not at the bottom
    const fe = {}
    if (!form.title.trim()) fe.title = t.required
    if (!form.dept) fe.dept = t.required
    if (form.due_date && form.due_date < todayISO()) fe.due_date = t.dueDatePast
    setFieldErr(fe)
    if (Object.keys(fe).length) {
      // jump the user to the first field that needs fixing
      const target = fe.title ? titleRef.current : fe.dept ? deptRef.current : fe.due_date ? dueRef.current : null
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus?.({ preventScroll: true })
      return
    }
    setBusy(true); setErr('')
    const property = superAdmin ? form.property : (user.property && user.property !== 'all' ? user.property : 'pp')
    const { error } = await supabase.from('work_board').insert({
      title: form.title.trim(),
      description: form.description || null,
      category: 'other',
      property,
      posted_by: user.id,
      posted_by_name: user.name,
      // the chosen department routes the request to that department's head
      department: form.dept,
      priority: form.priority,
      due_date: form.due_date || null,
      // left unassigned on purpose: the department head picks the person
      assigned_to: null,
      assigned_to_name: null,
      photos,
      voice_url: voice || null,
      status: 'open',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={t.taskBoard}
      footer={<><Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button><Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.submit}</Button></>}>
      <Field label={t.title} required error={fieldErr.title}><input ref={titleRef} style={inputStyle(C)} value={form.title} onChange={set('title')} /></Field>
      <Field label={`${t.description} (${t.optional})`}><textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.description} onChange={set('description')} /></Field>
      <Field label={`${t.voiceNote} (${t.optional})`} hint={t.voiceInsteadHint}>
        <VoiceRecorder folder="work-voice" value={voice} onChange={setVoice} />
      </Field>
      {superAdmin && (
        <Field label={t.properties || 'Property'}>
          <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
            {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
          </select>
        </Field>
      )}
      <Field label={t.priority}>
        <select style={inputStyle(C)} value={form.priority} onChange={set('priority')}>
          {PRIO_CHOICES.map((p) => <option key={p} value={p}>{prioLabel(p, t)}</option>)}
        </select>
      </Field>
      {/* Which team should handle this. Required — the request is routed to that
          department's head, who then assigns it to one of their staff. */}
      <Field label={t.department} required error={fieldErr.dept} hint={t.deptRoutingHint}>
        <select ref={deptRef} style={inputStyle(C)} value={form.dept} onChange={set('dept')}>
          <option value="">{t.selectDepartment}</option>
          {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>)}
        </select>
      </Field>
      <Field label={`${t.dueDate} (${t.optional})`} error={fieldErr.due_date}>
        <input ref={dueRef} type="date" min={todayISO()} style={inputStyle(C)} value={form.due_date} onChange={set('due_date')} />
      </Field>
      <Field label={`${t.uploadPhoto} (${t.optional})`}><PhotoCapture folder="work_board" value={photos} onChange={setPhotos} /></Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}

function DetailModal({ row, user, admin, members, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const superAdmin = isSuperAdmin(user?.role) // super admin also picks the property when assigning
  const [assignTo, setAssignTo] = useState(row.assigned_to || '')
  const [propFilter, setPropFilter] = useState(row.property || 'pp') // property to assign within (super admin)
  const [deptFilter, setDeptFilter] = useState(row.department || '') // '' = not routed yet
  const [dueDate, setDueDate] = useState(row.due_date || '') // deadline set at assign time
  const [note, setNote] = useState(row.resolution_note || '')
  const [resPhotos, setResPhotos] = useState(Array.isArray(row.resolution_photos) ? row.resolution_photos : [])
  const [reassigning, setReassigning] = useState(false) // admin editing the assignment
  const [rating, setRating] = useState(row.rating || 0)  // 1..5 stars given by admin

  // super admin assigns within a chosen property; other admins are already scoped
  const scopedMembers = useMemo(
    () => (superAdmin ? members.filter((m) => memberInProperty(m, propFilter)) : members),
    [members, superAdmin, propFilter]
  )

  // people in the chosen department, at the chosen property
  const deptMembers = useMemo(
    () => (deptFilter ? scopedMembers.filter((m) => m.department === deptFilter) : []),
    [scopedMembers, deptFilter]
  )

  // changing the property clears the person; the department stays as routed
  useEffect(() => { setAssignTo('') }, [propFilter])

  const postedPhotos = Array.isArray(row.photos) ? row.photos : []
  const isAssignee = !!row.assigned_to && row.assigned_to === user.id
  const isPoster = !!row.posted_by && row.posted_by === user.id
  const s = row.status
  // work assigned to me: here I'm the worker, not an admin — no approving,
  // rating, reassigning or deleting my own request at any status
  const hasDept = !!row.department   // already routed to a team?
  const ownWork = isOwnAssignedWork(user, row.assigned_to)
  // who can delete this request:
  //  - admins / super-admins: ANY request, any status (incl. public ones with
  //    no logged-in owner)
  //  - the poster: their own request, unless it's already completed/approved
  const canDelete = !ownWork && (admin || (isPoster && !['completed', 'approved'].includes(s)))

  async function setStatus(status, patch = {}) {
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').update({ status, ...patch }).eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  // admins can permanently delete a completed request to clear it out
  async function del() {
    if (!window.confirm(t.deleteRequestConfirm || 'Delete this request permanently?')) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').delete().eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  // STEP 1: hand the request to a department. Stays 'open' and unassigned — the
  // trigger notifies that department's head, who then picks the person.
  function routeToDepartment() {
    if (!deptFilter) { setErr(t.required); return }
    if (dueDate && dueDate < todayISO()) { setErr(t.dueDatePast); return }
    setStatus('open', {
      department: deptFilter,
      property: superAdmin ? propFilter : (row.property || null),
      due_date: dueDate || null,
    })
  }

  // used for the first assignment AND for admin reassignment later
  function saveAssignment() {
    if (!deptFilter) { setErr(t.required); return }
    if (!assignTo) { setErr(t.required); return }
    if (dueDate && dueDate < todayISO()) { setErr(t.dueDatePast); return }
    const m = members.find((x) => x.id === assignTo)
    const changedAssignee = assignTo !== row.assigned_to
    // reassigning to a new person resets to 'assigned' (fresh start);
    // editing only the due date keeps the current status
    const status = (s === 'open' || changedAssignee) ? 'assigned' : s
    // stamp the assignee's department so the request follows the right team
    setStatus(status, {
      assigned_to: assignTo,
      assigned_to_name: m?.name || null,
      property: superAdmin ? propFilter : (row.property || null),
      department: deptFilter || m?.department || row.department || null,
      due_date: dueDate || null,
    })
  }

  // admin gives / updates a 1–5 star rating on a finished fix (kept for staff history)
  async function rate(n) {
    if (!admin) return
    setRating(n)
    setErr('')
    const { error } = await supabase
      .from('work_board')
      .update({ rating: n, rated_by: user.id, rated_at: nowISO() })
      .eq('id', row.id)
    if (error) setErr(error.message)
  }
  function submitForApproval() {
    if (resPhotos.length === 0) { setErr(t.photoRequired || 'Add a photo of the completed work'); return }
    setStatus('approval_requested', { resolution_note: note || null, resolution_photos: resPhotos })
  }

  // footer actions depend on status + who's looking
  let actions = null
  if (s === 'open' && admin) {
    actions = hasDept
      ? <Button variant="primary" disabled={busy || !assignTo} onClick={saveAssignment} style={{ flex: 2 }}>{t.assign}</Button>
      : <Button variant="primary" disabled={busy || !deptFilter} onClick={routeToDepartment} style={{ flex: 2 }}>{t.routeToDept}</Button>
  } else if (s === 'assigned' && isAssignee) {
    actions = <Button variant="primary" disabled={busy} onClick={() => setStatus('in_progress')} style={{ flex: 2 }}>{t.startWork}</Button>
  } else if (s === 'in_progress' && isAssignee) {
    actions = <Button variant="success" disabled={busy || resPhotos.length === 0} onClick={submitForApproval} style={{ flex: 2 }}>{t.markForCompletion || 'Submit for Approval'}</Button>
  } else if (s === 'approval_requested' && admin && !ownWork) {
    actions = (
      <>
        <Button variant="ghost" disabled={busy} onClick={() => setStatus('in_progress')} style={{ flex: 1 }}>{t.reject || 'Send Back'}</Button>
        <Button variant="success" disabled={busy} onClick={() => setStatus('completed', { resolved_at: nowISO() })} style={{ flex: 2 }}>{t.approve || 'Approve'}</Button>
      </>
    )
  }
  // (delete is handled by the always-available button in the footer below)

  return (
    <Modal open onClose={onClose} title={row.title}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          {/* admins delete any request; the poster can delete their own */}
          {canDelete && (
            <Button variant="danger" disabled={busy} onClick={del} style={{ flex: 1 }}>
              <Icon name="trash" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.delete}
            </Button>
          )}
          {actions}
        </>
      )}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge color={C[(STATUS_META[s] || STATUS_META.open).tone]} bg={C[(STATUS_META[s] || STATUS_META.open).bg]}>{statusLabel(s, t)}</Badge>
        <Badge color={C[PRIOS[row.priority] || 'blue']}>{prioLabel(row.priority, t)}</Badge>
        {row.category && row.category !== 'other' && <Badge>{row.category}</Badge>}
      </div>

      {row.description && <p style={{ fontSize: 14, color: C.tl, marginBottom: 12 }}>{row.description}</p>}
      {row.voice_url && (
        <div style={{ marginBottom: 12 }}>
          <AudioPlayer src={row.voice_url} label={t.voiceNote} />
        </div>
      )}
      <div style={{ fontSize: 13, color: C.tl, marginBottom: 12 }}>{row.posted_by_name} · {fmtDateTime(row.created_at)}</div>

      {postedPhotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {postedPhotos.map((u) => <img key={u} src={u} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />)}
        </div>
      )}

      {row.assigned_to_name && (
        <div style={{ fontSize: 13.5, marginBottom: 12 }}>{t.members || 'Assigned to'}: <b>{row.assigned_to_name}</b></div>
      )}
      {row.due_date && s !== 'open' && (
        <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5, color: C.tl }}>
          <Icon name="clock" size={14} color={C.tl} /> {t.dueDate}: <b>{fmtDate(row.due_date)}</b>
        </div>
      )}

      {/* admin can reassign a request that isn't finished yet — but not one
          that's on their own plate; that's for another admin to move */}
      {admin && !ownWork && ['assigned', 'in_progress', 'approval_requested'].includes(s) && !reassigning && (
        <button
          type="button"
          onClick={() => setReassigning(true)}
          style={{ background: 'transparent', color: C.maroon, fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}
        >
          <Icon name="edit" size={15} color={C.maroon} /> {t.reassign}
        </button>
      )}

      {/* assignment editor — shown for a new (open) request or when reassigning */}
      {admin && (s === 'open' || reassigning) && (
        <>
          {superAdmin && (
            <Field label={t.properties || 'Property'}>
              <select style={inputStyle(C)} value={propFilter} onChange={(e) => setPropFilter(e.target.value)}>
                {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
              </select>
            </Field>
          )}
          {/* STEP 1 — which team owns this. Required; changing it clears the
              person, since staff belong to one department. */}
          <Field label={t.department} required hint={hasDept ? undefined : t.deptRoutingHint}>
            <select
              style={inputStyle(C)}
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setAssignTo('') }}
            >
              <option value="">{t.selectDepartment}</option>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>)}
            </select>
          </Field>

          {/* STEP 2 — the person, drawn from that department only. Gated on the
              department already SAVED on the row, not on the dropdown: an admin
              routing a request should never see a person picker. It appears only
              once the request has been handed to a department. */}
          {hasDept && (
            <Field label={t.personName} hint={deptMembers.length ? undefined : t.noStaffInDept}>
              <select style={inputStyle(C)} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">—</option>
                {deptMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {assigneeLabel(m, { showDept: false, lang })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={`${t.dueDate} (${t.optional})`}>
            <input type="date" min={todayISO()} style={inputStyle(C)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {/* open uses the footer "Assign"; reassign saves inline */}
          {reassigning && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <Button variant="ghost" onClick={() => { setReassigning(false); setAssignTo(row.assigned_to || ''); setDueDate(row.due_date || '') }} style={{ flex: 1 }}>{t.cancel}</Button>
              <Button variant="primary" disabled={busy || !assignTo || !deptFilter} onClick={saveAssignment} style={{ flex: 2 }}>{t.save}</Button>
            </div>
          )}
        </>
      )}

      {/* assignee submits the completed work */}
      {s === 'in_progress' && isAssignee && (
        <>
          <Field label={`${t.uploadPhoto || 'Photo of completed work'} *`}>
            <PhotoCapture folder="work_board" value={resPhotos} onChange={setResPhotos} />
          </Field>
          <Field label={`${t.completionNote || 'Note'} (${t.optional})`}>
            <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}

      {/* resolution shown once submitted / completed */}
      {['approval_requested', 'completed', 'approved'].includes(s) && (row.resolution_note || (row.resolution_photos || []).length > 0) && (
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t.completed} — {row.assigned_to_name}</div>
          {row.resolution_note && <p style={{ fontSize: 13.5, color: C.tl, marginBottom: 8 }}>{row.resolution_note}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(row.resolution_photos || []).map((u) => <img key={u} src={u} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />)}
          </div>
        </div>
      )}

      {s === 'approval_requested' && isAssignee && (
        <div style={{ fontSize: 13, color: C.yellow, fontWeight: 600, marginTop: 10 }}>{t.awaitingApprovalMsg || 'Sent to admin for approval.'}</div>
      )}

      {/* rating — admin rates the work while it's awaiting approval (before
          approving). Never your own work: someone else scores that. */}
      {s === 'approval_requested' && admin && !ownWork && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tl, marginBottom: 8 }}>{t.workRating}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Stars value={rating} onRate={rate} C={C} />
            {rating > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rating}/5</span>}
          </div>
          {rating === 0 && (
            <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6 }}>{t.rateHint}</div>
          )}
        </div>
      )}

      {/* explain the missing admin buttons on work assigned to me */}
      {admin && ownWork && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.tl, marginTop: 12 }}>
          <Icon name="warning" size={14} color={C.tl} /> {t.ownWorkLocked}
        </div>
      )}

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
    </Modal>
  )
}

function ScopeChip({ children, active, onClick, C, full }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
        background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
        flex: full ? 1 : undefined, // full: share the row evenly (segmented control)
      }}
    >
      {children}
    </button>
  )
}

// 5-star rating. Interactive when `onRate` is given, otherwise read-only.
function Stars({ value = 0, onRate, C, size = 26 }) {
  const clickable = typeof onRate === 'function'
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!clickable}
          onClick={() => onRate?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{ background: 'transparent', padding: 1, lineHeight: 0, cursor: clickable ? 'pointer' : 'default' }}
        >
          <Icon name="star" size={size} color={C.yellow} fill={n <= value ? C.yellow : 'none'} />
        </button>
      ))}
    </div>
  )
}
