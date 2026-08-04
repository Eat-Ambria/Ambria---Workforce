import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nowISO, fmtDateTime, todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENTS, isAdminRole, isSuperAdmin, scopedProperty, scopedProperties, scopedDepartment, DEPARTMENT_MAP, PROPERTY_MAP, propName, PROPERTIES, deptName, memberInProperty, assigneeLabel, isOwnAssignedWork, personName, isFlaggedPriority } from '../../constants/org'
import { assigneesQuery } from '../../lib/assignees'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Tabs, Field, inputStyle } from '../../components/common/UI'
import HindiInput from '../../components/common/HindiInput'
import Modal from '../../components/common/Modal'
import PhotoCapture from '../../components/common/PhotoCapture'
import AudioPlayer from '../../components/common/AudioPlayer'
import VoiceRecorder from '../../components/common/VoiceRecorder'
import Icon from '../../components/common/Icon'
import { useConfirm } from '../../components/common/ConfirmDialog'
import PhotoViewer from '../../components/common/PhotoViewer'
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

// What the request says, in the reader's language. Written English and
// auto-translated at creation, same as a task's title — and same fallback:
// a request raised before the Hindi columns existed shows its English text.
const fixTitle = (r, hi) => (hi && r?.title_hi ? r.title_hi : r?.title)
const fixDesc = (r, hi) => (hi && r?.description_hi ? r.description_hi : r?.description)

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
  const [tab, setTab] = useState(location.state?.tab || 'all')
  const [memberFilter, setMemberFilter] = useState('all') // filter list by assigned staff (admin)
  const [scope, setScope] = useState('assigned') // staff view: 'assigned' to me | 'posted' by me
  const [showAllDone, setShowAllDone] = useState(false) // Completed tab: recent vs everything
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(null)
  const [editingRow, setEditingRow] = useState(null) // wording/Hindi fix from the list

  // react to a tab preset from navigation (e.g. dashboard "Overdue Repairs" tile)
  useEffect(() => { if (location.state?.tab) setTab(location.state.tab) }, [location.state])

  const load = useCallback(async () => {
    try {
      // own venue + anything being covered today
      const propScope = scopedProperties(user) // null = every property (SA, Vicky, Sandeep)
      const deptScope = scopedDepartment(user) // null = every department (Sandeep → security)
      let q = supabase.from('work_board').select('*').order('created_at', { ascending: false }).limit(300)
      if (propScope) q = propScope.length > 1 ? q.in('property', propScope) : q.eq('property', propScope[0])
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
        // no propScope: a repair can be handed to anyone, whichever venue they
        // are based at — the request's property is where the work happens
        const { data: mem } = await assigneesQuery({ deptScope })
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

  const groups = useMemo(() => {
    // finished repairs older than the window are hidden, not deleted — keep "All"
    // consistent with the Completed tab instead of resurrecting them here
    const shown = new Set((showAllDone ? doneAll : doneRecent).map((r) => r.id))
    const isDone = (r) => ['approved', 'completed'].includes(r.status)
    return {
      all: visibleRows.filter((r) => !isDone(r) || shown.has(r.id)),
      // overdue = past its due date and not yet finished (cross-cuts open/in-progress)
      overdue: visibleRows.filter((r) => r.due_date && r.due_date < today && !isDone(r)),
      open: visibleRows.filter((r) => ['open', 'assigned'].includes(r.status)),
      in_progress: visibleRows.filter((r) => r.status === 'in_progress'),
      review: visibleRows.filter((r) => r.status === 'approval_requested'),
      completed: showAllDone ? doneAll : doneRecent,
    }
  }, [visibleRows, today, doneAll, doneRecent, showAllDone])

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
    { key: 'all', label: `${t.all} (${groups.all.length})` },
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
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{fixTitle(r, lang === 'hi')}</div>
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
                    {isFlaggedPriority(r.priority) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: pTone }} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: pTone, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{prioLabel(r.priority, t)}</span>
                      </div>
                    )}
                    {r.rating > 0 && (
                      <div style={{ marginTop: 6 }}><Stars value={r.rating} C={C} size={15} /></div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
                    <Badge color={C[st.tone]} bg={C[st.bg]}>{statusLabel(r.status, t)}</Badge>
                    {/* fix the wording — above all the Hindi — without opening
                        the whole request first. Stops the card's own click. */}
                    {admin && (
                      <button
                        type="button"
                        title={t.editText}
                        aria-label={t.editText}
                        onClick={(e) => { e.stopPropagation(); setEditingRow(r) }}
                        style={{ background: 'transparent', padding: 4, lineHeight: 0, borderRadius: 8 }}
                      >
                        <Icon name="edit" size={15} color={C.tl} />
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
      {['completed', 'all'].includes(tab) && hiddenDone > 0 && (
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
      {editingRow && (
        <EditTextModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={() => { setEditingRow(null); load() }}
        />
      )}
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
    title: '', title_hi: '', description: '', description_hi: '',
    priority: '', due_date: '', assignee: '',
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
  const prioRef = useRef(null)
  const assigneeRef = useRef(null)
  // update a field and clear its inline error as the user fixes it
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setFieldErr((fe) => (fe[k] ? { ...fe, [k]: undefined } : fe))
  }

  // everyone at the chosen venue — the picker narrows it by kind + department
  // everyone assignable, in one list — the venue does not narrow it
  const atProperty = members

  async function save() {
    // validate per-field so the message appears next to the field, not at the bottom
    const fe = {}
    if (!form.title.trim()) fe.title = `${t.title} ${t.isRequired}`
    if (!form.priority) fe.priority = `${t.priority} ${t.isRequired}`
    if (!form.assignee) fe.assignee = `${t.members} ${t.isRequired}`
    if (form.due_date && form.due_date < todayISO()) fe.due_date = t.dueDatePast
    setFieldErr(fe)
    if (Object.keys(fe).length) {
      // jump the user to the first field that needs fixing
      const target = fe.title ? titleRef.current
        : fe.priority ? prioRef.current
        : fe.assignee ? assigneeRef.current
        : fe.due_date ? dueRef.current : null
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus?.({ preventScroll: true })
      return
    }
    setBusy(true); setErr('')
    const property = admin ? form.property : (user.property && user.property !== 'all' ? user.property : 'pp')
    const person = atProperty.find((m) => m.id === form.assignee)
    // The Hindi shown to the staff who will do the work: auto-translated as the
    // title is typed, corrected by hand if the machine got it wrong. Blank when
    // the request was itself written in Hindi — the English column holds it.
    const { error } = await supabase.from('work_board').insert({
      title: form.title.trim(),
      title_hi: form.title_hi.trim() || null,
      description: form.description || null,
      description_hi: form.description_hi.trim() || null,
      category: 'other',
      // the venue the work has to be done at
      property,
      posted_by: user.id,
      posted_by_name: user.name,
      // taken from whoever is doing it, so department scoping still works;
      // left null when nobody is picked yet
      department: person?.department || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: person?.id || null,
      assigned_to_name: person?.name || null,
      photos,
      voice_url: voice || null,
      // assigning at creation skips the open->assigned hop
      status: person ? 'assigned' : 'open',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={t.taskBoard}
      footer={<><Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button><Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.submit}</Button></>}>
      <Field label={t.title} required error={fieldErr.title}><input ref={titleRef} style={inputStyle(C)} value={form.title} onChange={set('title')} /></Field>
      {/* the staff doing the job read this one, so it is worth a look */}
      <HindiInput
        label={t.hindiTitle}
        hint={t.hindiForStaffHint}
        source={form.title}
        value={form.title_hi}
        onChange={(v) => setForm((f) => ({ ...f, title_hi: v }))}
      />
      <Field label={`${t.description} (${t.optional})`}><textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.description} onChange={set('description')} /></Field>
      {form.description.trim() && (
        <HindiInput
          label={t.hindiDescription}
          rows={2}
          source={form.description}
          value={form.description_hi}
          onChange={(v) => setForm((f) => ({ ...f, description_hi: v }))}
        />
      )}
      <Field label={`${t.voiceNote} (${t.optional})`} hint={t.voiceInsteadHint}>
        <VoiceRecorder folder="work-voice" value={voice} onChange={setVoice} />
      </Field>
      {admin && (
        <Field label={t.propertyLabel} hint={t.propertyWorkHint}>
          <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
            {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
          </select>
        </Field>
      )}
      <Field label={t.priority} required error={fieldErr.priority}>
        <select ref={prioRef} style={inputStyle(C)} value={form.priority} onChange={set('priority')}>
          <option value="">{t.selectPriority}</option>
          {PRIO_CHOICES.map((p) => <option key={p} value={p}>{prioLabel(p, t)}</option>)}
        </select>
      </Field>
      {/* Straight to a person. Everyone at the chosen venue is listed, with
          their department beside the name so the right one is easy to spot. */}
      {admin && (
        <Field label={t.members} required error={fieldErr.assignee} hint={t.assigneeAnyVenueHint}>
          <PersonPicker
            ref={assigneeRef}
            C={C} t={t} lang={lang}
            people={atProperty}
            value={form.assignee}
            onChange={(id) => { setForm((f) => ({ ...f, assignee: id })); setFieldErr((fe) => ({ ...fe, assignee: undefined })) }}
          />
        </Field>
      )}
      <Field label={`${t.dueDate} (${t.optional})`} error={fieldErr.due_date}>
        <input ref={dueRef} type="date" min={todayISO()} style={inputStyle(C)} value={form.due_date} onChange={set('due_date')} />
      </Field>
      <Field label={`${t.uploadPhoto} (${t.optional})`}><PhotoCapture folder="work_board" value={photos} onChange={setPhotos} /></Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}

function DetailModal({ row, user, admin, members, onClose, onSaved }) {
  const confirm = useConfirm()
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const superAdmin = isSuperAdmin(user?.role) // super admin also picks the property when assigning
  const [assignTo, setAssignTo] = useState(row.assigned_to || '')
  const [propFilter, setPropFilter] = useState(row.property || 'pp') // property to assign within (super admin)
  const [dueDate, setDueDate] = useState(row.due_date || '') // deadline set at assign time
  const [note, setNote] = useState(row.resolution_note || '')
  const [resPhotos, setResPhotos] = useState(Array.isArray(row.resolution_photos) ? row.resolution_photos : [])
  const [reassigning, setReassigning] = useState(false) // admin editing the assignment
  const [editingText, setEditingText] = useState(false) // fixing the wording / the Hindi
  const [rating, setRating] = useState(row.rating || 0)  // 1..5 stars given by admin
  const [viewing, setViewing] = useState(null)           // { photos, index } in the lightbox

  // super admin assigns within a chosen property; other admins are already scoped
  const scopedMembers = useMemo(
    () => (superAdmin ? members.filter((m) => memberInProperty(m, propFilter)) : members),
    [members, superAdmin, propFilter]
  )

  // changing the property clears the person
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
    if (!(await confirm({ message: t.deleteRequestConfirm }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').delete().eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  // STEP 1: hand the request to a department. Stays 'open' and unassigned — the
  // trigger notifies that department's head, who then picks the person.
  // used for the first assignment AND for admin reassignment later
  function saveAssignment() {
    if (!assignTo) { setErr(`${t.members} ${t.isRequired}`); return }
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
      department: m?.department || row.department || null,
      due_date: dueDate || null,
    })
  }

  // The assignee never finished it (or nobody was on it) and the job is done —
  // an admin closes it out. Recorded with resolved_at like any other completion.
  async function completeNow() {
    if (!(await confirm({ message: t.repairMarkDoneConfirm, confirmLabel: t.markDone }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board')
      .update({ status: 'completed', resolved_at: nowISO() }).eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (row.assigned_to && row.assigned_to !== user.id) {
      await supabase.from('notifications').insert({
        type: 'fix_closed_by_admin', task_text: row.title, for_user: row.assigned_to,
        property: row.property, entity_id: String(row.id),
      })
    }
    onSaved()
  }

  // Closed by mistake. Goes back to whoever had it, or to Open if nobody did —
  // and the rating is cleared, since it was given for work now unfinished.
  async function reopen() {
    if (!(await confirm({ message: t.reopenRepairConfirm, confirmLabel: t.reopen, danger: false }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').update({
      status: row.assigned_to ? 'assigned' : 'open',
      resolved_at: null,
      rating: null,
    }).eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setRating(0)
    onSaved()
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
    actions = <Button variant="primary" disabled={busy || !assignTo} onClick={saveAssignment} style={{ flex: 2 }}>{t.assign}</Button>
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
  } else if (['approved', 'completed'].includes(s) && admin && !ownWork) {
    // undo a completion that should not have happened
    actions = (
      <Button variant="ghost" disabled={busy} onClick={reopen} style={{ flex: 2 }}>
        <Icon name="refresh" size={15} color={C.text} style={{ marginRight: 4 }} />{t.reopen}
      </Button>
    )
  }

  // close it without waiting for the assignee — available on any unfinished repair
  const canCloseNow = admin && !ownWork && ['open', 'assigned', 'in_progress'].includes(s)
  // (delete is handled by the always-available button in the footer below)

  return (
    <Modal open onClose={onClose} title={fixTitle(row, lang === 'hi')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          {/* admins delete any request; the poster can delete their own */}
          {canDelete && (
            <Button variant="danger" disabled={busy} onClick={del} style={{ flex: 1 }}>
              <Icon name="trash" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.delete}
            </Button>
          )}
          {canCloseNow && (
            <Button variant="success" disabled={busy} onClick={completeNow} style={{ flexShrink: 0 }}>
              <Icon name="check" size={15} color="#fff" style={{ marginRight: 4 }} />{t.markDone}
            </Button>
          )}
          {actions}
        </>
      )}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge color={C[(STATUS_META[s] || STATUS_META.open).tone]} bg={C[(STATUS_META[s] || STATUS_META.open).bg]}>{statusLabel(s, t)}</Badge>
        {isFlaggedPriority(row.priority) && (
          <Badge color={C[PRIOS[row.priority] || 'blue']}>{prioLabel(row.priority, t)}</Badge>
        )}
        {row.category && row.category !== 'other' && <Badge>{row.category}</Badge>}
        {/* A request raised in English is unreadable to the people who have to
            do it. Anyone can fix the wording — or write the Hindi themselves. */}
        {admin && !ownWork && (
          <button
            type="button"
            onClick={() => setEditingText(true)}
            style={{ background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}
          >
            <Icon name="edit" size={13} color={C.maroon} /> {t.editText}
          </button>
        )}
      </div>

      {row.description && <p style={{ fontSize: 14, color: C.tl, marginBottom: 12, whiteSpace: 'pre-line' }}>{fixDesc(row, lang === 'hi')}</p>}
      {row.voice_url && (
        <div style={{ marginBottom: 12 }}>
          <AudioPlayer src={row.voice_url} label={t.voiceNote} />
        </div>
      )}
      <div style={{ fontSize: 13, color: C.tl, marginBottom: 12 }}>{row.posted_by_name} · {fmtDateTime(row.created_at)}</div>

      {postedPhotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {postedPhotos.map((u, i) => (
            <img
              key={u} src={u} alt=""
              onClick={() => setViewing({ photos: postedPhotos, index: i })}
              style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'zoom-in' }}
            />
          ))}
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
          {/* Straight to a person — every assignable name, searchable. The
              department is taken from whoever is picked, so routing still works
              without anyone choosing a team first. */}
          <Field label={t.members} required hint={t.assigneeAnyVenueHint}>
            <PersonPicker
              C={C} t={t} lang={lang}
              people={members}
              value={assignTo}
              onChange={setAssignTo}
            />
          </Field>
          <Field label={`${t.dueDate} (${t.optional})`}>
            <input type="date" min={todayISO()} style={inputStyle(C)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {/* open uses the footer "Assign"; reassign saves inline */}
          {reassigning && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <Button variant="ghost" onClick={() => { setReassigning(false); setAssignTo(row.assigned_to || ''); setDueDate(row.due_date || '') }} style={{ flex: 1 }}>{t.cancel}</Button>
              <Button variant="primary" disabled={busy || !assignTo} onClick={saveAssignment} style={{ flex: 2 }}>{t.save}</Button>
            </div>
          )}
        </>
      )}

      {viewing && (
        <PhotoViewer
          photos={viewing.photos}
          index={viewing.index}
          onIndex={(i) => setViewing((v) => ({ ...v, index: i }))}
          onClose={() => setViewing(null)}
        />
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
            {(row.resolution_photos || []).map((u, i) => (
              <img
                key={u} src={u} alt=""
                onClick={() => setViewing({ photos: row.resolution_photos || [], index: i })}
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'zoom-in' }}
              />
            ))}
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

      {editingText && (
        <EditTextModal
          row={row}
          onClose={() => setEditingText(false)}
          onSaved={() => { setEditingText(false); onSaved() }}
        />
      )}
    </Modal>
  )
}

// Fix what a request says, in either language. The Hindi is what the staff read,
// so it is the reason this exists: a machine translation that came out wrong, or
// an older request raised before anything was translated at all.
function EditTextModal({ row, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [form, setForm] = useState({
    title: row.title || '',
    title_hi: row.title_hi || '',
    description: row.description || '',
    description_hi: row.description_hi || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.title.trim()) { setErr(`${t.title} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').update({
      title: form.title.trim(),
      title_hi: form.title_hi.trim() || null,
      description: form.description.trim() || null,
      description_hi: form.description_hi.trim() || null,
    }).eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} maxWidth={520} title={t.editText}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}
    >
      <Field label={t.title} required>
        <input style={inputStyle(C)} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <HindiInput
        label={t.hindiTitle}
        hint={t.hindiForStaffHint}
        source={form.title}
        value={form.title_hi}
        onChange={(v) => setForm((f) => ({ ...f, title_hi: v }))}
      />
      <Field label={`${t.description} (${t.optional})`}>
        <textarea
          rows={3}
          style={{ ...inputStyle(C), resize: 'vertical' }}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>
      {form.description.trim() && (
        <HindiInput
          label={t.hindiDescription}
          rows={3}
          source={form.description}
          value={form.description_hi}
          onChange={(v) => setForm((f) => ({ ...f, description_hi: v }))}
        />
      )}
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
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

// A person picker with a search box. There are enough staff across five venues
// that a plain <select> means scrolling a long unsorted list; typing two letters
// of a name is faster, and the department/venue beside each name settles the
// "which Akash?" question without opening anything else.
const PersonPicker = forwardRef(function PersonPicker({ C, t, lang, people, value, onChange }, ref) {
  const [q, setQ] = useState('')
  const chosen = people.find((m) => m.id === value)

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return people
    return people.filter((m) => [
      m.name, m.name_hi, m.designation,
      deptName(m.department, lang), propName(m.property, lang),
    ].filter(Boolean).some((f) => String(f).toLowerCase().includes(needle)))
  }, [people, q, lang])

  return (
    <div>
      <input
        ref={ref}
        style={{ ...inputStyle(C), marginBottom: 6 }}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.searchPerson}
      />
      <div style={{ maxHeight: 210, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }} className="modal-scroll">
        {matches.length === 0 ? (
          <div style={{ padding: '12px 12px', fontSize: 13, color: C.tl }}>{t.noMatch}</div>
        ) : matches.map((m) => {
          const on = m.id === value
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(on ? '' : m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '9px 11px', background: on ? C.maroonSoft : 'transparent',
                borderBottom: `1px solid ${C.border}`, color: C.text,
              }}
            >
              <span style={{
                width: 17, height: 17, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                border: `1.5px solid ${on ? C.maroon : C.borderStrong || C.border}`, background: on ? C.maroon : 'transparent',
              }}>
                {on && <Icon name="check" size={11} color="#fff" />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? C.maroon : C.text }}>{personName(m, lang)}</span>
                <span style={{ fontSize: 12, color: C.tl, marginLeft: 6 }}>
                  {[m.department ? deptName(m.department, lang) : null, propName(m.property, lang)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {chosen && (
        <div style={{ fontSize: 12.5, color: C.maroon, fontWeight: 600, marginTop: 6 }}>
          {t.assignedTo}: {personName(chosen, lang)}
        </div>
      )}
    </div>
  )
})
