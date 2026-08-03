import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { nowISO, todayISO, fmtDate, fmtDateTime } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { TASK_STATUS, TASK_CATEGORIES, PRIORITIES, PROPERTIES, PROPERTY_MAP, propName, DEPARTMENT_MAP, canSeeAllProperties, scopedProperty, scopedDepartment, isTaskOverdue, memberInProperty, assigneeLabel, isOwnAssignedWork, personName, deptName } from '../../constants/org'
import { assigneesQuery } from '../../lib/assignees'
import { statusColors } from '../../constants/status'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Tabs, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import RosterModal from './RosterModal'
import PhotoViewer from '../../components/common/PhotoViewer'
import { useConfirm } from '../../components/common/ConfirmDialog'
import VoiceRecorder from '../../components/common/VoiceRecorder'
import { deleteStorageFile } from '../../lib/storage'
import { translateToHindi } from '../../lib/translate'

const TR_ORANGE = '#EA580C' // overdue accent (matches the dashboard)

export default function AdminTasks() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()

  const canSeeAllProps = canSeeAllProperties(user)
  const location = useLocation()
  const presetProp = location.state?.property // set when navigating from the dashboard
  const presetTab = location.state?.tab       // which tab to open (e.g. 'pending', 'completed')
  const presetMember = location.state?.member // staff filter carried from the dashboard

  const PAGE_SIZE = 20
  const TAB_KEYS = ['overdue', 'pending', 'inprogress', 'review', 'issues', 'issuesDone', 'completed', 'all']

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
  const [roster, setRoster] = useState(false)  // bulk assignment table

  const today = todayISO()
  // collapse the status tabs into a dropdown once the row gets tight (≤1073px)
  const statusCompact = useMediaQuery('(max-width: 1073px)')

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
    if (key === 'issues') return q.in('issue_status', [TASK_STATUS.ISSUE, TASK_STATUS.ISSUE_WORKING])
    if (key === 'issuesDone') return q.eq('issue_status', TASK_STATUS.ISSUE_RESOLVED)
    if (key === 'overdue') return q.lt('due_date', today).neq('status', TASK_STATUS.COMPLETED)
    return q // 'all'
  }, [today])

  // switch to the tab carried by a navigation (e.g. a notification click),
  // even when we're already on this page and the component doesn't remount.
  useEffect(() => {
    if (location.state?.tab) { setTab(location.state.tab); setPage(0) }
  }, [location.state])

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

  // people list for the filter + assign dropdowns — staff and fellow admins,
  // scoped to this admin, loaded once
  useEffect(() => {
    if (!user) return
    assigneesQuery({ propScope: scopedProperty(user), deptScope: scopedDepartment(user) })
      .then(({ data }) => setMembers(data || []))
  }, [user])

  // load per-tab counts + the active tab's page whenever filters/tab/page change.
  // `silent` skips the loading dim — used by the background auto-refresh below.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!user) return
    if (!silent) setListLoading(true)
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

  // keep counts (incl. the Issues badge) + the list fresh without a manual
  // refresh: silently re-poll every 30s and whenever the tab regains focus.
  useEffect(() => {
    const tick = () => { if (!document.hidden) load({ silent: true }) }
    const id = setInterval(tick, 30000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [load])

  // filter/tab changes reset to the first page (single fetch, no double-load)
  const changeTab = (k) => { setTab(k); setPage(0) }
  const changeProp = (p) => { setPropFilter(p); setPage(0) }
  const changeCat = (c) => { setCatFilter(c); setPage(0) }
  const changeMember = (m) => { setMemberFilter(m); setPage(0) }

  // people shown in the name filter — scoped to the selected property when set
  const memberOptions = useMemo(() => {
    const opts = members.filter((m) => memberInProperty(m, propFilter))
    return [...opts].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members, propFilter])

  // if the selected person isn't in the current property scope, reset to All
  useEffect(() => {
    if (memberFilter !== 'all' && members.length && !memberOptions.some((m) => m.id === memberFilter)) {
      setMemberFilter('all'); setPage(0)
    }
  }, [memberOptions, memberFilter, members])

  // tasks store the assignee's name as it was at assignment time (English).
  // When the UI is Hindi, prefer that person's Hindi name from the loaded list.
  const nameOf = useCallback((id, stored) => {
    const m = members.find((x) => x.id === id)
    return (m && personName(m, lang)) || stored || '—'
  }, [members, lang])

  const issueView = tab === 'issues' || tab === 'issuesDone'

  const c = (k) => (counts[k] ? ` (${counts[k]})` : '')
  // task-status tabs only — the Issues view is a separate button (see below)
  const tabs = [
    { key: 'all', label: `${t.all} (${counts.all || 0})` },
    { key: 'overdue', label: `${t.overdue}${c('overdue')}` },
    { key: 'pending', label: `${t.pending}${c('pending')}` },
    { key: 'inprogress', label: `${t.inProgress}${c('inprogress')}` },
    { key: 'completed', label: `${t.completed}${c('completed')}` },
    { key: 'review', label: `${t.reviewQueue}${c('review')}` },
  ]

  if (loading) return <Loader label={t.loading} />

  const total = counts[tab] || 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <SectionTitle
        right={(
          <Button variant="primary" onClick={() => setRoster(true)}>
            <Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{t.tasks}
          </Button>
        )}
      >
        {t.tasks}
      </SectionTitle>

      {/* venue + staff filters — both dropdowns, side by side (stack on narrow) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {canSeeAllProps && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 150 }}>
            <Icon name="pin" size={16} color={C.tl} />
            <select
              style={inputStyle(C)}
              value={propFilter}
              onChange={(e) => changeProp(e.target.value)}
              aria-label={t.properties}
            >
              <option value="all">{t.properties} — {t.all}</option>
              {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 150 }}>
          <Icon name="user" size={16} color={C.tl} />
          <select
            style={inputStyle(C)}
            value={memberFilter}
            onChange={(e) => changeMember(e.target.value)}
            aria-label={t.members}
          >
            <option value="all">{t.members} — {t.all}</option>
            {memberOptions.map((m) => <option key={m.id} value={m.id}>{personName(m, lang)}</option>)}
          </select>
        </div>
      </div>

      {/* category filter — full-width segmented row: all / daily / weekly / monthly */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <PropChip C={C} full active={catFilter === 'all'} onClick={() => changeCat('all')}>{t.all}</PropChip>
        {TASK_CATEGORIES.map((cat) => (
          <PropChip key={cat} C={C} full active={catFilter === cat} onClick={() => changeCat(cat)}>{t[cat]}</PropChip>
        ))}
      </div>

      {/* task-status on the left (tabs on wide screens, one dropdown when tight),
          the Issues view as a separate button on the right */}
      <div style={{ fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: 6 }}>{t.taskStatus}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {statusCompact ? (
            <select
              style={inputStyle(C)}
              value={tabs.some((s) => s.key === tab) ? tab : tabs[0].key}
              onChange={(e) => changeTab(e.target.value)}
              aria-label={t.status || 'Status'}
            >
              {tabs.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          ) : (
            <Tabs tabs={tabs} active={tab} onChange={changeTab} noMargin />
          )}
        </div>
        <button
          onClick={() => changeTab('issues')}
          aria-pressed={issueView}
          style={{
            whiteSpace: 'nowrap', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700,
            background: issueView ? C.red : C.rBg,
            color: issueView ? '#fff' : C.red,
            border: `1px solid ${issueView ? C.red : 'transparent'}`,
          }}
        >
          <Icon name="warning" size={15} color={issueView ? '#fff' : C.red} />
          {t.issues}{counts.issues ? ` (${counts.issues})` : ''}
        </button>
      </div>

      {/* Resolving an issue no longer hides the task — it moves here, and the
          nightly job clears the flag a day later. */}
      {issueView && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { key: 'issues', label: `${t.openIssues}${c('issues')}`, tone: C.red },
            { key: 'issuesDone', label: `${t.issueResolved}${c('issuesDone')}`, tone: C.green },
          ].map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => changeTab(v.key)}
              style={{
                padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                background: tab === v.key ? v.tone : C.card,
                color: tab === v.key ? '#fff' : C.tl,
                border: `1px solid ${tab === v.key ? v.tone : C.border}`,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {listLoading && list.length === 0 ? (
        <Loader label={t.loading} />
      ) : list.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12, opacity: listLoading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {list.map((task) => {
            const sc = statusColors(task.status, C)
            const isc = task.issue_status ? statusColors(task.issue_status, C) : null
            const od = isTaskOverdue(task, today)
            return (
              <Card key={task.id} onClick={() => setReview(task)} style={{ cursor: 'pointer', borderLeft: `4px solid ${sc.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{task.title}</div>
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>
                      {nameOf(task.assigned_to, task.assignee_name)}{task.area ? ` · ${task.area}` : ''}
                    </div>
                    {canSeeAllProps && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="pin" size={12} /> {propName(task.property, lang)}
                      </div>
                    )}
                    {task.due_date && (
                      <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: od ? TR_ORANGE : C.faint, fontWeight: od ? 700 : 500 }}>
                        <Icon name={od ? 'warning' : 'clock'} size={12} color={od ? TR_ORANGE : C.faint} />
                        {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(task.due_date)}
                      </div>
                    )}
                  </div>
                  {/* right column: status + fixed-width category badge, vertically centered,
                      so Daily/Weekly/Monthly line up in one straight column across cards */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
                    {isc && <Badge color={isc.color} bg={isc.bg}>{t[isc.key]}</Badge>}
                    {task.category && (
                      <span style={{ minWidth: 62, textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.maroon, background: C.maroonSoft, padding: '3px 6px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                        {t[task.category]}
                      </span>
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
        <ReviewModal
          task={review}
          user={user}
          assigneeName={nameOf(review.assigned_to, review.assignee_name)}
          onEdit={(tk) => { setReview(null); setCreating(tk) }}
          onClose={() => setReview(null)}
          onSaved={() => { setReview(null); load() }}
        />
      )}
      {roster && (
        <RosterModal
          user={user}
          members={members}
          canSeeAllProps={canSeeAllProps}
          defaultProperty={propFilter !== 'all' ? propFilter : (user.property !== 'all' ? user.property : undefined)}
          onClose={() => setRoster(false)}
          onSaved={() => { setRoster(false); load() }}
          onDetailed={() => { setRoster(false); setCreating(true) }}
        />
      )}
      {creating && (
        <CreateModal
          user={user}
          members={members}
          record={creating === true ? null : creating}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load() }}
        />
      )}
    </div>
  )
}

function PropChip({ children, active, onClick, C, full }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
        background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
        flex: full ? 1 : undefined, // full: stretch to share the row evenly (segmented control)
      }}
    >
      {children}
    </button>
  )
}

function PhotoCol({ C, label, photos }) {
  const [at, setAt] = useState(null)   // index open in the lightbox
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tl, marginBottom: 6 }}>{label}</div>
      {photos && photos.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {photos.map((u, i) => (
            <img
              key={u} src={u} alt=""
              onClick={() => setAt(i)}
              style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'zoom-in' }}
            />
          ))}
          {at != null && (
            <PhotoViewer photos={photos} index={at} onIndex={setAt} onClose={() => setAt(null)} />
          )}
        </div>
      ) : <div style={{ fontSize: 13, color: C.faint }}>—</div>}
    </div>
  )
}

function ReviewModal({ task, user, assigneeName, onEdit, onClose, onSaved }) {
  const confirm = useConfirm()
  const C = useColors()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectVoice, setRejectVoice] = useState('')
  const sc = statusColors(task.status, C)
  const isc = task.issue_status ? statusColors(task.issue_status, C) : null
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
    // an admin looking at a reported issue can easily read the bin as "clear
    // this issue" — spell out that it takes the whole task with it
    const warn = (task.issue_status && task.issue_status !== TASK_STATUS.ISSUE_RESOLVED)
      ? t.deleteTaskWarnIssue
      : t.deleteTaskConfirm
    if (!(await confirm({ message: warn, confirmLabel: t.delete }))) return
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

  // ---- issue lifecycle: admin acknowledges & resolves a staff-reported issue ----
  // notify the staff member who reported it (bell + push via the notifications table)
  async function notifyEmployee(type) {
    if (!task.assigned_to) return
    await supabase.from('notifications').insert({
      type, task_text: task.title, for_user: task.assigned_to, property: task.property, entity_id: String(task.id),
    })
  }
  async function startIssue() {
    // issue lifecycle is independent of task status — only touch issue_status
    if (await update({ issue_status: TASK_STATUS.ISSUE_WORKING })) { await notifyEmployee('issue_working'); onSaved() }
  }
  // Bin on an issue = remove the issue, keep the task. Used when an issue was
  // raised by mistake or no longer applies: it clears the flag and the reported
  // text outright, so it shows in neither Open nor Resolved. The task's own
  // status is left alone — the two tracks are independent by design.
  async function clearIssue() {
    if (!(await confirm({ message: t.removeIssueConfirm, confirmLabel: t.remove }))) return
    if (await update({ issue_status: null, notes: null, resolved_at: null })) onSaved()
  }

  async function resolveIssue() {
    // resolving the issue returns the task to Pending so the employee can carry
    // on. resolved_at lets the scheduled cleanup clear the issue one day later.
    if (await update({ issue_status: TASK_STATUS.ISSUE_RESOLVED, resolved_at: nowISO(), status: TASK_STATUS.PENDING })) {
      await notifyEmployee('issue_resolved'); onSaved()
    }
  }

  const isIssue = task.issue_status === TASK_STATUS.ISSUE
  const isIssueWorking = task.issue_status === TASK_STATUS.ISSUE_WORKING
  const isIssueState = isIssue || isIssueWorking || task.issue_status === TASK_STATUS.ISSUE_RESOLVED
  // while an issue is open the task cannot be deleted — resolve it first
  const hasOpenIssue = isIssue || isIssueWorking
  // this task is on my own plate: I'm its assignee, not its admin. Approving,
  // sending back, closing the issue and deleting are another admin's call — I
  // do the actual work over in My Tasks. Untouched for everyone else's tasks.
  const ownWork = isOwnAssignedWork(user, task.assigned_to)

  return (
    <Modal
      open onClose={onClose} title={task.title}
      footer={isQueue && rejectMode ? (
        <>
          <Button variant="ghost" onClick={() => setRejectMode(false)} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="danger" onClick={sendBack} disabled={busy || (!rejectNote.trim() && !rejectVoice)} style={{ flex: 2 }}>{t.reject}</Button>
        </>
      ) : (
        // Close + the status-specific action(s) + Delete, available on any task
        // (this page is admin-only) — but none of them on your own work, which
        // is view-only here.
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          {isQueue && !ownWork && (
            <>
              <Button variant="ghost" onClick={() => setRejectMode(true)} style={{ flex: 1 }}>{t.reject}</Button>
              <Button variant="success" onClick={approve} disabled={busy} style={{ flex: 2 }}>{t.approve}</Button>
            </>
          )}
          {isIssue && !ownWork && (
            <>
              <Button variant="ghost" onClick={startIssue} disabled={busy} style={{ flex: 1 }}>{t.startWorkingIssue}</Button>
              {/* clears the issue and tells the reporter — the task itself stays */}
              <Button variant="success" onClick={resolveIssue} disabled={busy} style={{ flex: 2 }}>{t.dismissIssue}</Button>
            </>
          )}
          {isIssueWorking && !ownWork && <Button variant="success" onClick={resolveIssue} disabled={busy} style={{ flex: 2 }}>{t.markResolved}</Button>}
          {/* while an issue is open the bin clears the issue; the task is never
              deleted from here. Once resolved, the bin deletes the task again. */}
          {!ownWork && (
            <Button variant="ghost" onClick={() => onEdit?.(task)} disabled={busy} style={{ flexShrink: 0 }}>
              <Icon name="edit" size={15} color={C.text} style={{ marginRight: 4 }} />{t.edit}
            </Button>
          )}
          {!ownWork && hasOpenIssue && (
            <Button variant="danger" onClick={clearIssue} disabled={busy} title={t.removeIssue} aria-label={t.removeIssue} style={{ flexShrink: 0 }}>
              <Icon name="trash" size={16} color="#fff" />
            </Button>
          )}
          {!ownWork && !hasOpenIssue && (
            <Button variant="danger" onClick={del} disabled={busy} title={t.delete} aria-label={t.delete} style={{ flexShrink: 0 }}>
              <Icon name="trash" size={16} color="#fff" />
            </Button>
          )}
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
        {isc && <Badge color={isc.color} bg={isc.bg}>{t[isc.key]}</Badge>}
        {task.category && <Badge>{t[task.category]}</Badge>}
      </div>
      <div style={{ fontSize: 14, marginBottom: 6 }}>{t.members}: <b>{assigneeName || task.assignee_name || '—'}</b></div>
      {task.completion_requested_at && <div style={{ fontSize: 13, color: C.tl, marginBottom: 12 }}>{fmtDateTime(task.completion_requested_at)}</div>}

      {/* staff-reported issue text */}
      {isIssueState && task.notes && (
        <div style={{ background: C.rBg, border: `1px solid ${C.red}22`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.red, fontWeight: 700, fontSize: 13.5 }}>
            <Icon name="warning" size={16} /> {t.issue}
          </div>
          <div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{task.notes}</div>
          {task.issue_status !== TASK_STATUS.ISSUE_RESOLVED && (
            <div style={{ fontSize: 11.5, color: C.tl, marginTop: 8, lineHeight: 1.5 }}>
              {t.resolveKeepsTask}<br />{t.cannotDeleteWithIssue}
            </div>
          )}
        </div>
      )}

      {/* time taken */}
      {durMs != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
          <Icon name="clock" size={16} color={C.tl} />
          <span style={{ fontSize: 13.5 }}>{t.timeTaken}: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDur(durMs)}</b></span>
        </div>
      )}

      {task.completion_note && <p style={{ fontSize: 14, color: C.tl, marginBottom: 12 }}>{task.completion_note}</p>}

      {/* before / after comparison */}
      {(beforePhotos.length > 0 || photos.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <PhotoCol C={C} label={t.before} photos={beforePhotos} />
          <PhotoCol C={C} label={t.after} photos={photos} />
        </div>
      )}

      {rejectMode && (
        <>
          <Field label={t.rejectionNote}>
            <textarea rows={3} style={{ ...inputStyle(C), resize: 'vertical' }} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
          </Field>
          <Field label={`${t.voiceNote} (${t.optional})`}>
            <VoiceRecorder folder="task-voice" value={rejectVoice} onChange={setRejectVoice} />
          </Field>
        </>
      )}

      {/* explain the missing admin buttons on work assigned to me */}
      {ownWork && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.tl, marginTop: 12 }}>
          <Icon name="warning" size={14} color={C.tl} /> {t.ownWorkLocked}
        </div>
      )}

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}

function CreateModal({ user, members, record, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const canSeeAllProps = canSeeAllProperties(user)
  const editing = !!record
  const [form, setForm] = useState({
    title: record?.title || '',
    description: record?.description || '',
    category: record?.category || 'daily',
    priority: record?.priority || 'medium',
    area: record?.area || '',
    time_block: record?.time_block || '',
    assigned_to: record?.assigned_to || '',
    due_date: record?.due_date || '',
    property: record?.property || (canSeeAllProps ? 'pp' : (user.property && user.property !== 'all' ? user.property : 'pp')),
  })
  const [dept, setDept] = useState('all') // narrow the assign list by department
  const [extraProps, setExtraProps] = useState([]) // create the same task at these venues too
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // departments that actually have people, for the assign filter
  const deptOptions = useMemo(() => {
    const codes = [...new Set(members.map((m) => m.department).filter(Boolean))]
    return codes
      .map((code) => ({ code, name: deptName(code, lang) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members])

  // people shown in the assign dropdown — staff and admins, filtered by the
  // chosen property + department
  const assignable = useMemo(() => {
    let list = members.filter((m) => memberInProperty(m, form.property))
    if (dept !== 'all') list = list.filter((m) => m.department === dept)
    return list
  }, [members, dept, form.property])

  // the primary venue can't also be an extra
  useEffect(() => { setExtraProps((prev) => prev.filter((c) => c !== form.property)) }, [form.property])

  // if the current pick no longer matches the property/department filters, clear it
  useEffect(() => {
    if (form.assigned_to && !assignable.some((m) => m.id === form.assigned_to)) {
      setForm((f) => ({ ...f, assigned_to: '' }))
    }
  }, [assignable, form.assigned_to])

  async function save() {
    if (!form.title.trim()) { setErr(`${t.title} ${t.isRequired}`); return }
    if (form.due_date && form.due_date < todayISO()) { setErr(t.dueDatePast); return }
    setBusy(true); setErr('')
    const assignee = members.find((m) => m.id === form.assigned_to)
    // auto-translate the title to Hindi so staff on the Hindi UI see it (best-effort)
    let title_hi = null
    try { title_hi = await translateToHindi(form.title.trim()) } catch { /* leave null — falls back to English */ }

    if (editing) {
      // Re-translate only when the title actually changed, so a hand-corrected
      // Hindi title isn't silently overwritten by the machine translation.
      const patch = {
        property: form.property,
        category: form.category,
        title: form.title.trim(),
        description: form.description || null,
        area: form.area || null,
        time_block: form.time_block || null,
        priority: form.priority,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
        assignee_name: assignee?.name || null,
      }
      if (form.title.trim() !== record.title) patch.title_hi = title_hi
      if (assignee?.department) patch.department = assignee.department
      const { error: upErr } = await supabase.from('tasks').update(patch).eq('id', record.id)
      setBusy(false)
      if (upErr) { setErr(upErr.message); return }
      onSaved()
      return
    }

    // One row per chosen venue. The extras carry no assignee: the person picked
    // here belongs to one venue, and silently making them responsible at three
    // others would be wrong. Those rows land unassigned for the venue's own
    // admin to hand out.
    const targets = extraProps.length ? [form.property, ...extraProps] : [form.property]
    const rows = targets.map((prop, i) => ({
      id: newId('t_'),
      property: prop || assignee?.property || (user.property !== 'all' ? user.property : 'pp'),
      department: assignee?.department || user.department || 'k',
      category: form.category,
      title: form.title.trim(),
      title_hi,
      description: form.description || null,
      area: form.area || null,
      time_block: form.time_block || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: i === 0 ? (form.assigned_to || null) : null,
      assignee_name: i === 0 ? (assignee?.name || null) : null,
      status: TASK_STATUS.PENDING,
      task_date: todayISO(),
    }))
    const { error } = await supabase.from('tasks').insert(rows)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={editing ? `${t.edit} — ${record.title}` : t.tasks}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label={t.title}><input style={inputStyle(C)} value={form.title} onChange={set('title')} /></Field>
      <Field label={`${t.description} (${t.optional})`}>
        <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.description} onChange={set('description')} />
      </Field>
      <Field label={t.properties || 'Property'}>
        <select style={inputStyle(C)} value={form.property} onChange={set('property')} disabled={!canSeeAllProps}>
          {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
        </select>
      </Field>
      {canSeeAllProps && !editing && (
        <Field label={`${t.addToProperties} (${t.optional})`} hint={extraProps.length ? t.createdInProperties.replace('{n}', extraProps.length + 1) : t.sameTaskOtherProps}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PROPERTIES.filter((p) => p.code !== form.property).map((p) => {
              const on = extraProps.includes(p.code)
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setExtraProps((prev) => (on ? prev.filter((c) => c !== p.code) : [...prev, p.code]))}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                    border: `1.5px solid ${on ? C.maroon : C.border}`,
                    background: on ? C.maroonSoft : C.card,
                    color: on ? C.maroon : C.tl,
                  }}
                >
                  {on && <Icon name="check" size={13} color={C.maroon} />}
                  {propName(p.code, lang)}
                </button>
              )
            })}
          </div>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t.category}>
            <select style={inputStyle(C)} value={form.category} onChange={set('category')}>
              {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{t[c]}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t.priority}>
            <select style={inputStyle(C)} value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t.department}>
            <select style={inputStyle(C)} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">{t.all}</option>
              {deptOptions.map((dpt) => <option key={dpt.code} value={dpt.code}>{dpt.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t.assignTo}>
            <select style={inputStyle(C)} value={form.assigned_to} onChange={set('assigned_to')}>
              <option value="">—</option>
              {assignable.map((m) => (
                <option key={m.id} value={m.id}>
                  {assigneeLabel(m, { showDept: dept === 'all', lang })}
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
        <div style={{ flex: 1 }}><Field label={`${t.area} (${t.optional})`}><input style={inputStyle(C)} value={form.area} onChange={set('area')} /></Field></div>
        <div style={{ flex: 1 }}><Field label={`${t.timeBlock} (${t.optional})`}><input style={inputStyle(C)} value={form.time_block} onChange={set('time_block')} placeholder="e.g. 9-10 AM" /></Field></div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
