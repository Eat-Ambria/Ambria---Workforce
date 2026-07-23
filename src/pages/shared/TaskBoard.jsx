import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nowISO, fmtDateTime, todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { isAdminRole, isSuperAdmin, scopedProperty, scopedDepartment, DEPARTMENT_MAP, PROPERTY_MAP, PROPERTIES, deptName } from '../../constants/org'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Tabs, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import PhotoCapture from '../../components/common/PhotoCapture'
import Icon from '../../components/common/Icon'

const PRIOS = { low: 'tl', normal: 'blue', high: 'yellow', urgent: 'red' }

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
  const [members, setMembers] = useState([]) // staff available for assignment (admin)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [memberFilter, setMemberFilter] = useState('all') // filter list by assigned staff (admin)
  const [scope, setScope] = useState('assigned') // staff view: 'assigned' to me | 'posted' by me
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(null)

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
        let mq = supabase.from('users').select('id, name, department, property').eq('is_active', true).eq('role', 'e').order('name')
        if (propScope) mq = mq.eq('property', propScope)
        if (deptScope) mq = mq.eq('department', deptScope)
        const { data: mem } = await mq
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

  const groups = useMemo(() => ({
    open: visibleRows.filter((r) => ['open', 'assigned'].includes(r.status)),
    in_progress: visibleRows.filter((r) => r.status === 'in_progress'),
    review: visibleRows.filter((r) => r.status === 'approval_requested'),
    completed: visibleRows.filter((r) => ['approved', 'completed'].includes(r.status)),
  }), [visibleRows])

  // staff who actually have requests assigned — populate the name filter
  const memberOptions = useMemo(() => {
    const byId = new Map()
    rows.forEach((r) => { if (r.assigned_to && r.assigned_to_name) byId.set(r.assigned_to, r.assigned_to_name) })
    members.forEach((m) => { if (byId.has(m.id)) byId.set(m.id, m.name) })
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [rows, members])

  const tabs = [
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

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {list.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((r) => {
            const st = STATUS_META[r.status] || STATUS_META.open
            const pTone = C[PRIOS[r.priority] || 'blue']
            return (
              <Card key={r.id} onClick={() => setActive(r)} style={{ cursor: 'pointer', borderLeft: `4px solid ${pTone}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>{r.posted_by_name} · {fmtDateTime(r.created_at)}</div>
                    {r.assigned_to_name && (
                      <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="user" size={12} /> {r.assigned_to_name}
                      </div>
                    )}
                    {r.assigned_to_name && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="pin" size={12} />
                        {PROPERTY_MAP[r.property]?.name || r.property}
                        {r.department ? ` · ${deptName(r.department, lang)}` : ''}
                      </div>
                    )}
                    {r.due_date && (
                      <div style={{ fontSize: 12, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="clock" size={12} /> {t.dueDate}: {fmtDate(r.due_date)}
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
                    {admin && ['completed', 'approved'].includes(r.status) && (
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
  const admin = isAdminRole(user?.role)          // admin + super admin can assign at creation
  const superAdmin = isSuperAdmin(user?.role)    // only super admin picks the property
  const [form, setForm] = useState({
    title: '', description: '', priority: 'normal', due_date: '',
    property: user.property && user.property !== 'all' ? user.property : 'pp',
    dept: 'all', assignTo: '',
  })
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // departments that have staff, for the assign filter
  const deptOptions = useMemo(() => {
    const codes = [...new Set(members.map((m) => m.department).filter(Boolean))]
    return codes.map((code) => ({ code, name: DEPARTMENT_MAP[code]?.name || code }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members])

  // staff assignable — scoped to the chosen property + department
  const assignable = useMemo(() => {
    let list = members
    if (form.property) list = list.filter((m) => m.property === form.property)
    if (form.dept !== 'all') list = list.filter((m) => m.department === form.dept)
    return list
  }, [members, form.property, form.dept])

  // clear a pick that no longer matches the property/department filters
  useEffect(() => {
    if (form.assignTo && !assignable.some((m) => m.id === form.assignTo)) {
      setForm((f) => ({ ...f, assignTo: '' }))
    }
  }, [assignable, form.assignTo])

  async function save() {
    if (!form.title.trim()) { setErr(t.required); return }
    if (form.due_date && form.due_date < todayISO()) { setErr(t.dueDatePast); return }
    setBusy(true); setErr('')
    const assignee = members.find((m) => m.id === form.assignTo)
    const property = superAdmin ? form.property : (user.property && user.property !== 'all' ? user.property : 'pp')
    const { error } = await supabase.from('work_board').insert({
      title: form.title.trim(),
      description: form.description || null,
      category: 'other',
      property,
      posted_by: user.id,
      posted_by_name: user.name,
      // if assigned at creation, the request follows the assignee's department
      department: assignee?.department || user.department || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: assignee?.id || null,
      assigned_to_name: assignee?.name || null,
      photos,
      status: assignee ? 'assigned' : 'open',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={t.taskBoard}
      footer={<><Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button><Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.submit}</Button></>}>
      <Field label={t.title}><input style={inputStyle(C)} value={form.title} onChange={set('title')} /></Field>
      <Field label={`${t.description} (${t.optional})`}><textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.description} onChange={set('description')} /></Field>
      {superAdmin && (
        <Field label={t.properties || 'Property'}>
          <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
            {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={t.priority}>
        <select style={inputStyle(C)} value={form.priority} onChange={set('priority')}>
          {Object.keys(PRIOS).map((p) => <option key={p} value={p}>{prioLabel(p, t)}</option>)}
        </select>
      </Field>
      {/* admins & super admins can assign the fix right away (optional) */}
      {admin && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label={t.department}>
              <select style={inputStyle(C)} value={form.dept} onChange={set('dept')}>
                <option value="all">{t.all}</option>
                {deptOptions.map((dpt) => <option key={dpt.code} value={dpt.code}>{dpt.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label={`${t.assignTo} (${t.optional})`}>
              <select style={inputStyle(C)} value={form.assignTo} onChange={set('assignTo')}>
                <option value="">—</option>
                {assignable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.department && form.dept === 'all' ? ` · ${DEPARTMENT_MAP[m.department]?.name || m.department}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}
      <Field label={`${t.dueDate} (${t.optional})`}>
        <input type="date" min={todayISO()} style={inputStyle(C)} value={form.due_date} onChange={set('due_date')} />
      </Field>
      <Field label={`${t.uploadPhoto} (${t.optional})`}><PhotoCapture folder="work_board" value={photos} onChange={setPhotos} /></Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}

function DetailModal({ row, user, admin, members, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [assignTo, setAssignTo] = useState(row.assigned_to || '')
  const [deptFilter, setDeptFilter] = useState('all') // narrow the assign list by department
  const [dueDate, setDueDate] = useState(row.due_date || '') // deadline set at assign time
  const [note, setNote] = useState(row.resolution_note || '')
  const [resPhotos, setResPhotos] = useState(Array.isArray(row.resolution_photos) ? row.resolution_photos : [])
  const [reassigning, setReassigning] = useState(false) // admin editing the assignment
  const [rating, setRating] = useState(row.rating || 0)  // 1..5 stars given by admin

  // departments that actually have staff, for the assign filter
  const deptOptions = useMemo(() => {
    const codes = [...new Set(members.map((m) => m.department).filter(Boolean))]
    return codes
      .map((code) => ({ code, name: DEPARTMENT_MAP[code]?.name || code }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members])

  // staff shown in the assign dropdown — filtered by the chosen department
  const assignable = useMemo(
    () => (deptFilter === 'all' ? members : members.filter((m) => m.department === deptFilter)),
    [members, deptFilter]
  )

  // if the current pick isn't in the filtered department, clear it
  useEffect(() => {
    if (assignTo && !assignable.some((m) => m.id === assignTo)) setAssignTo('')
  }, [assignable, assignTo])

  const postedPhotos = Array.isArray(row.photos) ? row.photos : []
  const isAssignee = !!row.assigned_to && row.assigned_to === user.id
  const s = row.status

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

  // used for the first assignment AND for admin reassignment later
  function saveAssignment() {
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
      department: m?.department || row.department || null,
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
    actions = <Button variant="primary" disabled={busy || !assignTo} onClick={saveAssignment} style={{ flex: 2 }}>{t.assign}</Button>
  } else if (s === 'assigned' && isAssignee) {
    actions = <Button variant="primary" disabled={busy} onClick={() => setStatus('in_progress')} style={{ flex: 2 }}>{t.startWork}</Button>
  } else if (s === 'in_progress' && isAssignee) {
    actions = <Button variant="success" disabled={busy || resPhotos.length === 0} onClick={submitForApproval} style={{ flex: 2 }}>{t.markForCompletion || 'Submit for Approval'}</Button>
  } else if (s === 'approval_requested' && admin) {
    actions = (
      <>
        <Button variant="ghost" disabled={busy} onClick={() => setStatus('in_progress')} style={{ flex: 1 }}>{t.reject || 'Send Back'}</Button>
        <Button variant="success" disabled={busy} onClick={() => setStatus('completed', { resolved_at: nowISO() })} style={{ flex: 2 }}>{t.approve || 'Approve'}</Button>
      </>
    )
  } else if (['completed', 'approved'].includes(s) && admin) {
    actions = <Button variant="danger" disabled={busy} onClick={del} style={{ flex: 2 }}><Icon name="trash" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.delete}</Button>
  }

  return (
    <Modal open onClose={onClose} title={row.title}
      footer={<><Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>{actions}</>}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge color={C[(STATUS_META[s] || STATUS_META.open).tone]} bg={C[(STATUS_META[s] || STATUS_META.open).bg]}>{statusLabel(s, t)}</Badge>
        <Badge color={C[PRIOS[row.priority] || 'blue']}>{prioLabel(row.priority, t)}</Badge>
        {row.category && row.category !== 'other' && <Badge>{row.category}</Badge>}
      </div>

      {row.description && <p style={{ fontSize: 14, color: C.tl, marginBottom: 12 }}>{row.description}</p>}
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

      {/* admin can reassign a request that isn't finished yet */}
      {admin && ['assigned', 'in_progress', 'approval_requested'].includes(s) && !reassigning && (
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
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label={t.department}>
                <select style={inputStyle(C)} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                  <option value="all">{t.all}</option>
                  {deptOptions.map((dpt) => <option key={dpt.code} value={dpt.code}>{dpt.name}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label={t.assignTo}>
                <select style={inputStyle(C)} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">—</option>
                  {assignable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.department && deptFilter === 'all' ? ` · ${DEPARTMENT_MAP[m.department]?.name || m.department}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
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

      {/* rating — admin rates the work while it's awaiting approval (before approving) */}
      {s === 'approval_requested' && admin && (
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

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
    </Modal>
  )
}

function ScopeChip({ children, active, onClick, C }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap', padding: '8px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
        background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
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
