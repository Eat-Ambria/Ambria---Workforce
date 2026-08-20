import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nowISO, fmtDateTime, todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENTS, isAdminRole, isSuperAdmin, scopedProperty, scopedProperties, scopedDepartment, DEPARTMENT_MAP, PROPERTY_MAP, propName, PROPERTIES, deptName, memberInProperty, assigneeLabel, isOwnAssignedWork, personName, isFlaggedPriority } from '../../constants/org'
import { assigneesQuery } from '../../lib/assignees'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Tabs, Field, inputStyle, filterStyle, ChipRow, FilterField } from '../../components/common/UI'
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

// overdue accent, the same one the dashboard and Daily Task use
const TR_ORANGE = '#EA580C'

const PRIOS = { low: 'tl', normal: 'blue', high: 'yellow', urgent: 'red' }
// 'low' is kept above so older rows still render, but it is not offered on new ones
const PRIO_CHOICES = ['normal', 'high', 'urgent']

// What an empty tab says. Six tabs all reading "Nothing here yet" answered none
// of the six questions being asked — an empty Overdue is good news, an empty
// Open is not, and neither is "nothing here".
const EMPTY_TITLE = {
  all: 'noRepairRequests',
  overdue: 'noOverdueRequests',
  open: 'noOpenRequests',
  in_progress: 'noInProgressRequests',
  review: 'noAwaitingApproval',
  completed: 'noCompletedRequests',
  logged: 'noWorkLogged',
}

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

// What broke, not who fixes it. 'other' is every request ever written before the
// kitchen split, so it stays the default and means "general".
// What broke, not who fixes it. 'other' is every request written before any of
// this existed, so it stays the default and means "general".
//
// Everything after 'other' is also a department code. Kitchen was never a
// special case — it was the first kind of repair that belonged to one team, and
// the trades are more of the same.
const FIX_CATEGORIES = ['other', 'kitchen', 'ms', 'el', 'pt', 'cp']

// 'other' has no team — a general repair can go to anyone.
const catDept = (c) => (!c || c === 'other' ? null : (c === 'kitchen' ? 'kt' : c))

const fixCatLabel = (c, t, lang) => {
  if (!c || c === 'other') return t.fixCatGeneral
  if (c === 'kitchen') return t.fixCatKitchen
  return deptName(c, lang)
}
const FIX_CAT_TONE = { other: 'blue', kitchen: 'accent' }

// Who may take this request. A kitchen fault goes to the kitchen team and a
// wiring fault to the electricians — picking a gardener for a broken oven is a
// mistake the list should not make available. A general repair has no such
// team, so everyone is offered.
//
// The exception is a team nobody is in yet: a picker with no names simply blocks
// the assignment. Then everyone is offered and the hint says why, rather than
// leaving the admin stuck at a blank list.
function assignableFor(category, members) {
  const dept = catDept(category)
  if (!dept) return { people: members, restricted: false }
  const team = members.filter((m) => m.department === dept)
  return team.length
    ? { people: team, restricted: true }
    : { people: members, restricted: false }
}

// What the request says, in the reader's language. Written English and
// auto-translated at creation, same as a task's title — and same fallback:
// a request raised before the Hindi columns existed shows its English text.
// The row's own id, which has been a sequence since the table was made. Shown
// so a request can be referred to out loud — on the phone, in a WhatsApp
// message, standing in front of the thing that is broken.
const ticketNo = (r) => `#${r?.id ?? ''}`

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
  const [catFilter, setCatFilter] = useState('all')       // all | other (general) | kitchen
  const [query, setQuery] = useState('')                  // ticket number or words
  const [prioFilter, setPrioFilter] = useState('all')     // all | urgent | high | normal | low
  const [scope, setScope] = useState('assigned') // staff view: 'assigned' to me | 'posted' by me
  const [showAllDone, setShowAllDone] = useState(false) // Completed tab: recent vs everything
  const [creating, setCreating] = useState(false)
  const [logging, setLogging] = useState(false)   // recording work already done
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

      // Everyone, not only the people who can assign. This list is what every
      // name on the board is read out of — without it nameOf() falls back to the
      // English snapshot stored on the row, and a staff member reading in Hindi
      // saw English names throughout, including their own.
      //
      // Neither propScope nor deptScope applies. A department scope says which
      // requests an admin is responsible FOR; it must not say who they may hand
      // one to. A broken camera is a security request and an electrician's job —
      // Sandeep could only ever pick other guards.
      // (The one real restriction is the kitchen rule, in assignableFor.)
      const { data: mem } = await assigneesQuery()
      setMembers(mem || [])
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
  // Guarded on the navigation, not the id. Remembering the id meant the second
  // tap on the same notification was ignored for as long as the page lived;
  // location.key is new for every navigation and unchanged across re-renders,
  // which is exactly the difference that matters here.
  const focusedRef = useRef(null)
  useEffect(() => {
    const id = location.state?.focusFix
    if (!id || focusedRef.current === location.key) return
    focusedRef.current = location.key
    ;(async () => {
      const { data } = await supabase.from('work_board').select('*').eq('id', id).maybeSingle()
      if (data) setActive(data)
    })()
  }, [location.state])

  // what the board shows:
  //  - admin: everything in scope, optionally narrowed to one staff member
  //  - staff: either work assigned to them, or requests they raised
  // Everything this person may see, before the kitchen/general split. The chips
  // count from HERE, so their numbers match the list you land in.
  const scopedRows = useMemo(() => {
    if (admin) return memberFilter === 'all' ? rows : rows.filter((r) => r.assigned_to === memberFilter)
    return scope === 'posted'
      ? rows.filter((r) => r.posted_by === user.id)
      : rows.filter((r) => r.assigned_to === user.id)
  }, [rows, memberFilter, admin, scope, user.id])

  // a row written before the kitchen split has no category at all — it is general
  const byCat = useCallback(
    (list) => (catFilter === 'all' ? list : list.filter((r) => (r.category || 'other') === catFilter)),
    [catFilter]
  )
  const byPrio = useCallback(
    (list) => (prioFilter === 'all' ? list : list.filter((r) => (r.priority || 'normal') === prioFilter)),
    [prioFilter]
  )

  // Typed "#142" or "142" finds that one ticket; anything else is words, matched
  // against both titles and the description. Applied after the chips so their
  // counts keep meaning what they say — the search narrows the list, it does not
  // redefine what is being counted.
  const needle = query.trim().toLowerCase().replace(/^#/, '')
  const bySearch = useCallback((list) => {
    if (!needle) return list
    return list.filter((r) => String(r.id) === needle
      || `${r.title || ''} ${r.title_hi || ''} ${r.description || ''} ${r.description_hi || ''}`
        .toLowerCase().includes(needle))
  }, [needle])

  const visibleRows = useMemo(
    () => bySearch(byPrio(byCat(scopedRows))),
    [scopedRows, byCat, byPrio, bySearch]
  )

  // Each filter counts with the OTHER already applied, so a number always says
  // what clicking it returns. Counting both from scopedRows is how a chip ends
  // up promising 28 above a list of 3.
  const catPool = useMemo(() => byPrio(scopedRows), [scopedRows, byPrio])
  const prioPool = useMemo(() => byCat(scopedRows), [scopedRows, byCat])

  // repair rows keep the assignee name from assignment time; swap in the Hindi
  // name when the UI is Hindi and we know the person
  const nameOf = useCallback((id, stored) => {
    const m = members.find((x) => x.id === id)
    return (m && personName(m, lang)) || stored || ''
  }, [members, lang])

  const today = todayISO()
  // Split before anything counts. Work logged after the fact was never open, so
  // it must not swell "Completed" — that number means requests that were raised
  // and then finished.
  const requestRows = useMemo(() => visibleRows.filter((r) => !r.logged_direct), [visibleRows])
  const loggedRows = useMemo(() => visibleRows.filter((r) => r.logged_direct), [visibleRows])

  const doneAll = useMemo(
    () => requestRows.filter((r) => ['approved', 'completed'].includes(r.status)),
    [requestRows]
  )
  const recentCutoff = () => new Date(Date.now() - COMPLETED_DAYS * 86400000).toISOString()
  const doneRecent = useMemo(() => {
    const cutoff = recentCutoff()
    return doneAll.filter((r) => (r.resolved_at || r.created_at || '') >= cutoff)
  }, [doneAll])
  // logged work is finished by definition, so it needs the same window
  const loggedRecent = useMemo(() => {
    const cutoff = recentCutoff()
    return loggedRows.filter((r) => (r.resolved_at || r.created_at || '') >= cutoff)
  }, [loggedRows])

  const groups = useMemo(() => {
    // finished repairs older than the window are hidden, not deleted — keep "All"
    // consistent with the Completed tab instead of resurrecting them here
    const shown = new Set((showAllDone ? doneAll : doneRecent).map((r) => r.id))
    const isDone = (r) => ['approved', 'completed'].includes(r.status)
    return {
      all: requestRows.filter((r) => !isDone(r) || shown.has(r.id)),
      // overdue = past its due date and not yet finished (cross-cuts open/in-progress)
      overdue: requestRows.filter((r) => r.due_date && r.due_date < today && !isDone(r)),
      open: requestRows.filter((r) => ['open', 'assigned'].includes(r.status)),
      in_progress: requestRows.filter((r) => r.status === 'in_progress'),
      review: requestRows.filter((r) => r.status === 'approval_requested'),
      // Unfinished work that is on me. A completed repair is not on anyone's
      // plate, and including it would make this a list you filter in your head.
      mine: requestRows.filter((r) => r.assigned_to === user.id && !isDone(r)),
      completed: showAllDone ? doneAll : doneRecent,
      logged: showAllDone ? loggedRows : loggedRecent,
    }
  }, [requestRows, loggedRows, loggedRecent, today, doneAll, doneRecent, showAllDone])

  const hiddenDone = tab === 'logged'
    ? loggedRows.length - loggedRecent.length
    : doneAll.length - doneRecent.length

  // staff who actually have requests assigned — populate the name filter
  const memberOptions = useMemo(() => {
    const byId = new Map()
    rows.forEach((r) => { if (r.assigned_to && r.assigned_to_name) byId.set(r.assigned_to, r.assigned_to_name) })
    members.forEach((m) => { if (byId.has(m.id)) byId.set(m.id, m.name) })
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [rows, members])

  // collapse the status tabs into a dropdown on narrow screens (≤813px)
  const statusCompact = useMediaQuery('(max-width: 813px)')
  // seven kinds of repair need more room than six statuses
  const catCompact = useMediaQuery('(max-width: 900px)')
  // one source for both shapes — a label that differs between the chips and the
  // dropdown is a bug waiting to be reported as "it says something else on my phone"
  const catChoices = [
    { key: 'all', label: `${t.all} (${catPool.length})` },
    ...FIX_CATEGORIES.map((c) => ({
      key: c,
      label: `${fixCatLabel(c, t, lang)} (${catPool.filter((r) => (r.category || 'other') === c).length})`,
    })),
  ]
  const tabs = [
    { key: 'all', label: `${t.all} (${groups.all.length})` },
    { key: 'overdue', label: `${t.overdue} (${groups.overdue.length})` },
    { key: 'open', label: `${t.open} (${groups.open.length})` },
    { key: 'in_progress', label: `${t.inProgress} (${groups.in_progress.length})` },
    { key: 'review', label: `${t.reviewQueue} (${groups.review.length})` },
    { key: 'completed', label: `${t.completed} (${groups.completed.length})` },
    // Next to Completed, and only when it has something in it — an empty tab is a
    // question nobody asked, which is the rule the logged tab below follows too.
    ...(groups.mine.length ? [{ key: 'mine', label: `${t.assignedToMe} (${groups.mine.length})` }] : []),
    // shown only once there is something in it — an empty tab is a question
    // nobody asked
    ...(groups.logged.length ? [{ key: 'logged', label: `${t.logWorkTab} (${groups.logged.length})` }] : []),
  ]

  if (loading) return <Loader label={t.loading} />
  const list = groups[tab]

  return (
    <div>
      <SectionTitle
        right={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Recording finished work is a different act from asking for work,
                so it is a different button — not a checkbox inside the request
                form that everyone would miss. */}
            {/* Everyone, not just admins. A guard who re-seats a loose camera
                or a gardener who clears a blocked drain has done the work — the
                log exists so that work is on the record, and gating it by role
                only recorded the half of it done by admins. */}
            <Button variant="ghost" onClick={() => setLogging(true)}>
              <Icon name="check" size={16} color={C.maroon} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {t.logWork}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {t.taskBoard}
            </Button>
          </div>
        )}
      >
        {t.taskBoard}
      </SectionTitle>

      {/* admins can grab the public (no-login) repair-request link to share */}
      {admin && <PublicLinkBar C={C} t={t} />}

      {/* staff view toggle — work assigned to me vs requests I raised */}
      {!admin && (
        <ChipRow style={{ marginBottom: 14 }}>
          <ScopeChip C={C} active={scope === 'assigned'} onClick={() => setScope('assigned')}>{t.assignedToMe}</ScopeChip>
          <ScopeChip C={C} active={scope === 'posted'} onClick={() => setScope('posted')}>{t.myRequests}</ScopeChip>
        </ChipRow>
      )}

      {/* Counted from every row in scope, not from the filtered list, so the
          number beside a kind still says how much is behind it.
          Every kind is listed, including the ones sitting at zero: this doubles
          as the list of what a repair can be filed as, and a trade that only
          appears once someone has used it is a trade nobody discovers.
          Seven of them do not fit a phone, and a sideways-scrolling row hides
          whichever ones you have not scrolled to — so below 900px it becomes a
          dropdown, the same way the status tabs already do. */}
      {/* Wide only. Every kind is listed, including the ones sitting at zero:
          this doubles as the list of what a repair can be filed as, and a trade
          that only appears once someone has used it is a trade nobody
          discovers. Seven of them do not fit a phone, so below 900px it drops
          into the filter grid below as a select. */}
      {!catCompact && (
        <ChipRow style={{ marginBottom: 14 }}>
          {catChoices.map((c) => (
            <ScopeChip key={c.key} C={C} active={catFilter === c.key} onClick={() => setCatFilter(c.key)}>
              {c.label}
            </ScopeChip>
          ))}
        </ChipRow>
      )}

      {/* Search sits on its own line: it is typed into, and half a phone width
          is not enough to read back what you typed. The icon lives inside the
          field — a text box has no vocabulary of its own to announce itself
          with, which is exactly why the selects below need no icons. */}
      <div style={{ position: 'relative', maxWidth: 380, marginBottom: 10 }}>
        <Icon
          name="search"
          size={15}
          color={C.faint}
          style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          style={{ ...filterStyle(C), paddingLeft: 34 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchFix}
          aria-label={t.searchFix}
        />
      </div>

      {/* One grid, however many filters this viewer actually has. auto-fit
          rather than a breakpoint: two columns on a phone, one row on a
          desktop, and still right for a non-admin who sees no assignee filter
          or a wide screen where type and status are not selects at all. */}
      <div style={{
        display: 'grid', gap: 8, marginBottom: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {catCompact && (
          <FilterField label={t.requestType}>
            <select style={filterStyle(C)} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              {catChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </FilterField>
        )}

        {statusCompact && (
          <FilterField label={t.repairStatus}>
            <select style={filterStyle(C)} value={tab} onChange={(e) => setTab(e.target.value)}>
              {tabs.map((tb) => <option key={tb.key} value={tb.key}>{tb.label}</option>)}
            </select>
          </FilterField>
        )}

        {/* Priorities with nothing in them are left out: an option that returns
            an empty list is a dead end. 'low' is not offered on new requests,
            but old rows still carry it, so it appears only if one does. */}
        <FilterField label={t.priority}>
          <select style={filterStyle(C)} value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)}>
            <option value="all">{t.all}</option>
            {['urgent', 'high', 'normal', 'low'].map((pkey) => {
              const n = prioPool.filter((r) => (r.priority || 'normal') === pkey).length
              if (!n) return null
              return <option key={pkey} value={pkey}>{prioLabel(pkey, t)} ({n})</option>
            })}
          </select>
        </FilterField>

        {admin && memberOptions.length > 0 && (
          <FilterField label={t.assignedTo}>
            <select style={filterStyle(C)} value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
              <option value="all">{t.all}</option>
              {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </FilterField>
        )}
      </div>

      {/* Wide only — the same choice the status select above offers when tight. */}
      {!statusCompact && <Tabs tabs={tabs} active={tab} onChange={setTab} />}

      {list.length === 0 ? (
        <EmptyState icon={null} title={t[EMPTY_TITLE[tab]] || t.noData} />
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
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>
                      {nameOf(r.posted_by, r.posted_by_name)} · {fmtDateTime(r.created_at)}
                    </div>
                    {r.assigned_to_name && (
                      <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="user" size={12} />
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{nameOf(r.assigned_to, r.assigned_to_name)}</span>
                      </div>
                    )}
                    {r.assigned_to_name && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="pin" size={12} />
                        {propName(r.property, lang)}
                        {r.department ? ` · ${deptName(r.department, lang)}` : ''}
                      </div>
                    )}
                    {/* on the card too, so a stack of finished requests says who
                        passed each one without opening them one at a time */}
                    {r.approved_by_name && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="check" size={12} color={C.green} />
                        {t.approvedByAdmin} {nameOf(r.approved_by, r.approved_by_name)}
                      </div>
                    )}
                    {r.due_date && (
                      <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: od ? '#EA580C' : C.tl, fontWeight: od ? 700 : 400 }}>
                        <Icon name={od ? 'warning' : 'clock'} size={12} color={od ? TR_ORANGE : C.tl} /> {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(r.due_date)}
                      </div>
                    )}
                    {(r.category || 'other') !== 'other' && (
                      <div style={{ marginTop: 6 }}>
                        {r.logged_direct && (
                          <Badge color={C.maroon} bg={C.maroonSoft}>{t.loggedBadge}</Badge>
                        )}
                        <Badge color={C[FIX_CAT_TONE[r.category] || 'blue']} bg={C.cardAlt}>
                          {fixCatLabel(r.category, t, lang)}
                        </Badge>
                      </div>
                    )}
                    {/* How people refer to the request out loud — "check 211" —
                        so it belongs with the title, not with the hints. It was
                        the palest thing on the card. */}
                    <span style={{
                      fontSize: 14, fontWeight: 800, color: C.text,
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    }}>
                      {ticketNo(r)}
                    </span>
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
      {['completed', 'all', 'logged'].includes(tab) && hiddenDone > 0 && (
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
      {logging && <LogWorkModal user={user} onClose={() => setLogging(false)} onSaved={() => { setLogging(false); load() }} />}
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
  // Trailing slash on purpose: dist/fix-request/index.html is a real file, and
  // that URL fetches it. Without the slash GitHub Pages 404s to the admin shell,
  // which carries the admin manifest — and installing from there gave people the
  // admin app instead of the repair one.
  const link = `${window.location.origin}${import.meta.env.BASE_URL}fix-request/`

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

// Work already done, recorded after the fact.
//
// Deliberately shorter than the request form: there is nobody to assign, no
// priority to weigh and no due date to meet, because it is finished. What is
// left is what the super admin needs to read — where, what kind, what happened,
// and a photo if there is one.
function LogWorkModal({ user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const superAdmin = isSuperAdmin(user?.role)
  const [form, setForm] = useState({
    title: '', title_hi: '', note: '', category: 'other',
    // General repair belongs to no trade, so the logger says whose work it was;
    // their own department is the sensible starting point.
    dept: user.department || '',
    property: user.property && user.property !== 'all' ? user.property : 'pp',
  })
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.title.trim()) { setErr(`${t.title} ${t.isRequired}`); return }
    if (!form.note.trim()) { setErr(`${t.logWorkWhat} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').insert({
      title: form.title.trim(),
      title_hi: form.title_hi.trim() || null,
      category: form.category || 'other',
      property: superAdmin ? form.property : (user.property && user.property !== 'all' ? user.property : 'pp'),
      department: catDept(form.category) || form.dept || user.department || null,
      posted_by: user.id,
      posted_by_name: user.name,
      // Whoever logged it did it, so they are both sides of it. Recording the
      // assignee is what puts the work against their name later — and what lets
      // their admin see it on the property's board.
      assigned_to: user.id,
      assigned_to_name: user.name,
      priority: 'normal',
      // Finished the moment it is written — it was finished before that.
      status: 'completed',
      resolved_at: nowISO(),
      resolution_note: form.note.trim(),
      resolution_photos: photos,
      logged_direct: true,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.logWorkTitle}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}
    >
      <div style={{ background: C.maroonSoft, color: C.maroon, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
        {t.logWorkHint}
      </div>

      <Field label={t.title} required>
        <input autoFocus style={inputStyle(C)} value={form.title} onChange={set('title')} />
      </Field>

      <HindiInput
        label={t.hindiTitle}
        hint={t.hindiForStaffHint}
        source={form.title}
        value={form.title_hi}
        onChange={(v) => setForm((f) => ({ ...f, title_hi: v }))}
      />

      <Field label={t.requestType} hint={t.requestTypeHint}>
        <select style={inputStyle(C)} value={form.category} onChange={set('category')}>
          {FIX_CATEGORIES.map((c) => <option key={c} value={c}>{fixCatLabel(c, t, lang)}</option>)}
        </select>
      </Field>

      {/* Only for General repair. Kitchen and the trades already name their own
          team; asking again would let one row claim two. This is what decides
          which department's admin finds the work on their board. */}
      {form.category === 'other' && (
        <Field label={t.department} hint={t.fixDeptOwnerHint}>
          <select style={inputStyle(C)} value={form.dept} onChange={set('dept')}>
            <option value="">— {t.department} —</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>
            ))}
          </select>
        </Field>
      )}

      {superAdmin && (
        <Field label={t.propertyLabel} hint={t.propertyWorkHint}>
          <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
            {PROPERTIES.map((pp) => <option key={pp.code} value={pp.code}>{propName(pp.code, lang)}</option>)}
          </select>
        </Field>
      )}

      <Field label={t.logWorkWhat} required hint={t.logWorkWhatHint}>
        <textarea rows={3} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.note} onChange={set('note')} />
      </Field>

      <Field label={`${t.uploadPhoto} (${t.optional})`}>
        <PhotoCapture folder="work_board" value={photos} onChange={setPhotos} />
      </Field>

      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
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
    priority: '', due_date: '', assignee: '', category: 'other',
    property: user.property && user.property !== 'all' ? user.property : 'pp',
    dept: '',
  })
  const [photos, setPhotos] = useState([])
  const [voice, setVoice] = useState('')
  // Can this device record at all? A phone with no microphone, or a browser where
  // permission was refused, cannot — and a required field nobody can fill is a
  // fault that never gets reported. Those fall back to typing it.
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
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

  // A kitchen request narrows the names the moment the kind is chosen.
  const { people: atProperty, restricted: teamOnly } = assignableFor(form.category, members)
  const teamHint = teamOnly
    ? t.tradeStaffOnly.replace('{d}', deptName(catDept(form.category), lang))
    : t.assigneeAnyVenueHint

  async function save() {
    // validate per-field so the message appears next to the field, not at the bottom
    const fe = {}
    if (!form.title.trim()) fe.title = `${t.title} ${t.isRequired}`
    if (!form.priority) fe.priority = `${t.priority} ${t.isRequired}`
    // what is wrong: recorded, or typed where recording is impossible
    if (!voice && !(!canRecord && form.description.trim())) {
      fe.voice = canRecord ? t.voiceRequired : t.voiceOrTypeRequired
    }
    // Only an admin gets the assignee field, so only an admin can be required
    // to fill it. Demanding it from staff made Submit do nothing at all: no
    // field to fill, no ref to scroll to, no error to read.
    // A request raised by staff goes in as 'open' for an admin to route — the
    // same path a request from the public link takes.
    if (admin && !form.assignee) fe.assignee = `${t.assignedTo} ${t.isRequired}`
    if (form.due_date && form.due_date < todayISO()) fe.due_date = t.dueDatePast
    setFieldErr(fe)
    if (Object.keys(fe).length) {
      // jump the user to the first field that needs fixing
      const target = fe.title ? titleRef.current
        : fe.priority ? prioRef.current
        : fe.assignee ? assigneeRef.current
        : fe.due_date ? dueRef.current : null
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.focus?.({ preventScroll: true })
      } else {
        // No field to jump to — say it out loud instead of failing in silence,
        // which is exactly how the staff-assignee bug stayed invisible.
        setErr(Object.values(fe).join(' '))
      }
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
      category: form.category || 'other',
      // the venue the work has to be done at
      property,
      posted_by: user.id,
      posted_by_name: user.name,
      // The kind of repair carries its own team — a wiring fault is the
      // electricians', whoever ends up holding the screwdriver. A general repair
      // has none, so it falls back to whoever is doing it, which is what keeps
      // department scoping routing the request.
      department: catDept(form.category) || person?.department || null,
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
      <Field label={t.requestType} hint={t.requestTypeHint}>
        <select style={inputStyle(C)} value={form.category} onChange={set('category')}>
          {FIX_CATEGORIES.map((c) => <option key={c} value={c}>{fixCatLabel(c, t, lang)}</option>)}
        </select>
      </Field>
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
      {/* Required, with the same exception as the public form: a device that
          cannot record takes a typed description instead. */}
      <Field
        label={t.voiceNote}
        required
        hint={canRecord ? t.voiceRequired : t.voiceOrTypeRequired}
        error={fieldErr.voice}
      >
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
        <Field label={t.assignedTo} required error={fieldErr.assignee} hint={teamHint}>
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
  // The name stored on the row is a snapshot from assignment time. Prefer the
  // live record, so a Hindi UI shows the Hindi name and a renamed person shows
  // their new name; fall back to the snapshot when they are no longer listed.
  const assigneeName = personName(members.find((m) => m.id === row.assigned_to) || {}, lang)
    || row.assigned_to_name
  // Same for whoever raised it. 'public' has no user record — the snapshot is
  // the only name that request will ever have.
  const posterName = personName(members.find((m) => m.id === row.posted_by) || {}, lang)
    || row.posted_by_name || row.posted_by
  const [assignTo, setAssignTo] = useState(row.assigned_to || '')
  // kitchen requests only offer the kitchen team — unless nobody is in it yet
  const assignPool = assignableFor(row.category, members)
  const [propFilter, setPropFilter] = useState(row.property || 'pp') // property to assign within (super admin)
  const [dueDate, setDueDate] = useState(row.due_date || '') // deadline set at assign time
  const [note, setNote] = useState(row.resolution_note || '')
  const [resPhotos, setResPhotos] = useState(Array.isArray(row.resolution_photos) ? row.resolution_photos : [])
  // The spoken half of the answer. Separate from row.voice_url, which is the
  // reporter saying what was wrong — a request can carry both.
  const [resVoice, setResVoice] = useState(row.resolution_voice_url || '')
  const [reassigning, setReassigning] = useState(false) // admin editing the assignment
  // The update thread. Loaded on open rather than with the board: most requests
  // are never opened, and this is the only place it is read.
  const [updates, setUpdates] = useState([])
  const [upNote, setUpNote] = useState('')
  const [upVoice, setUpVoice] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingText, setEditingText] = useState(false) // fixing the wording / the Hindi
  const [closing, setClosing] = useState(false)         // admin closing it out themselves
  // The panel opens below the fold of a scrolling modal, so the button looked
  // like it did nothing. Bring it to the reader the moment it appears.
  const closeRef = useRef(null)
  useEffect(() => {
    if (closing) closeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [closing])
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

  // Sending back is a two-step action: the reason is the point of it, and a
  // single tap cannot carry one.
  const [backMode, setBackMode] = useState(false)
  const [backNote, setBackNote] = useState('')
  const [backVoice, setBackVoice] = useState('')
  // Same exception as raising a request: an admin on a device that cannot record
  // must still be able to reject work, so those type the reason instead.
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const backReasonGiven = backVoice || (!canRecord && backNote.trim())

  async function sendBack() {
    if (!backReasonGiven) {
      setErr(canRecord ? t.sendBackVoiceRequired : t.sendBackTypeRequired)
      return
    }
    setBusy(true); setErr('')
    // Guarded like approve: if another admin has already dealt with it, this
    // changes nothing rather than dragging a finished request back open.
    const { data, error } = await supabase
      .from('work_board')
      .update({
        status: 'in_progress',
        rejection_note: backNote.trim() || null,
        rejection_voice_url: backVoice || null,
      })
      .eq('id', row.id)
      .eq('status', 'approval_requested')
      .select('id')
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (!data?.length) { setErr(t.alreadyApproved); onSaved(); return }
    setBackMode(false)
    onSaved()
  }

  // The first approval wins. The update names the status it expects to find, so
  // a second admin working from a screen that has not caught up matches no rows
  // and overwrites nobody — rather than replacing the first admin's name with
  // their own on a request that was already passed.
  async function approve() {
    setBusy(true); setErr('')
    const { data, error } = await supabase
      .from('work_board')
      .update({
        status: 'completed',
        resolved_at: nowISO(),
        approved_by: user.id,
        approved_by_name: user.name,
      })
      .eq('id', row.id)
      .eq('status', 'approval_requested')
      .select('id')
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (!data?.length) {
      // somebody got there first; the reload brings back who and when
      setErr(t.alreadyApproved)
      onSaved()
      return
    }
    onSaved()
  }

  // admins can permanently delete a completed request to clear it out
  // Overdue, somebody's name on it, and an admin looking at it. All three have
  // to be true before there is anything to remind anyone about.
  const overdue = row.due_date && row.due_date < todayISO()
    && !['approved', 'completed'].includes(row.status)
  const canRemind = admin && overdue && !!row.assigned_to

  const [reminded, setReminded] = useState(false)

  // An update needs somebody to reach. A request from the public link has no
  // account behind it — posted_by is the literal string 'public' — and the
  // tracker those people read does not show the thread, so there is nowhere for
  // it to land. No recipient, no box.
  const canUpdate = admin && !!row.posted_by && row.posted_by !== 'public'

  const loadUpdates = useCallback(async () => {
    const { data } = await supabase
      .from('work_board_updates')
      .select('*')
      .eq('board_id', row.id)
      .order('created_at', { ascending: true })
    setUpdates(data || [])
  }, [row.id])
  useEffect(() => { loadUpdates() }, [loadUpdates])

  // One row in, and the trigger tells whoever is waiting. Nothing else about the
  // request changes — an update is a message, not a status.
  async function postUpdate() {
    if (!upNote.trim() && !upVoice) return
    setPosting(true); setErr('')
    const { error } = await supabase.from('work_board_updates').insert({
      board_id: row.id,
      by_user: user.id,
      by_name: personName(user, lang) || user.name || null,
      note: upNote.trim() || null,
      voice_url: upVoice || null,
    })
    setPosting(false)
    if (error) { setErr(error.message); return }
    setUpNote(''); setUpVoice('')
    loadUpdates()
  }
  async function remind() {
    setBusy(true); setErr('')
    // One a day. Checked against the table rather than local state, so a second
    // admin on another device cannot send the same nudge an hour later.
    const since = `${todayISO()}T00:00:00Z`
    const { data: already } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'fix_reminder')
      .eq('entity_id', String(row.id))
      .eq('for_user', row.assigned_to)
      .gte('created_at', since)
      .limit(1)
    if (already?.length) { setBusy(false); setErr(t.remindAlreadyToday); return }

    const { error } = await supabase.from('notifications').insert({
      type: 'fix_reminder',
      task_text: row.title,
      for_user: row.assigned_to,
      by_user: user.id,
      by_name: user.name,
      property: row.property,
      entity_id: String(row.id),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setReminded(true)
  }

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
    if (!assignTo) { setErr(`${t.assignedTo} ${t.isRequired}`); return }
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
  // A second report of a fault already on the board. Closed rather than
  // deleted: deleting it would erase the fact that somebody reported it.
  //
  // Nothing new is written — the same three fields "close it myself" sets, so it
  // drops out of the working tabs and turns up under Completed, where the
  // resolution note says it was a duplicate instead of implying it was fixed.
  const canMarkDuplicate = admin && !['completed', 'approved'].includes(s)

  async function markDuplicate() {
    const ok = await confirm({
      message: t.markDuplicateAsk,
      detail: fixTitle(row, lang === 'hi'),
      confirmLabel: t.markDuplicate,
    })
    if (!ok) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board')
      .update({
        status: 'completed',
        resolved_at: nowISO(),
        resolution_note: t.duplicateNote,
        // which admin decided this, the same question every other close answers
        approved_by: user.id,
        approved_by_name: user.name,
      })
      .eq('id', row.id)
      // same race guard as the other closes: not if somebody has finished it
      .neq('status', 'completed')
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function completeNow() {
    setBusy(true); setErr('')
    // The admin's own photo of the finished work, when they have one. With no
    // photo the note records that fact rather than leaving a silent gap — the
    // same honesty the task side applies when an admin closes someone's task.
    const patch = {
      status: 'completed',
      resolved_at: nowISO(),
      resolution_photos: resPhotos,
      resolution_voice_url: resVoice || null,
      resolution_note: note.trim() || (resPhotos.length || resVoice ? null : t.closedByAdminNote),
      // a different action from approving submitted work, but the same question:
      // which admin signed this off
      approved_by: user.id,
      approved_by_name: user.name,
    }
    // same race, same guard: not if it has already been finished by someone else
    const { data: done, error } = await supabase.from('work_board')
      .update(patch)
      .eq('id', row.id)
      .neq('status', 'completed')
      .neq('status', 'approved')
      .select('id')
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (!done?.length) { setErr(t.alreadyApproved); onSaved(); return }
    if (row.assigned_to && row.assigned_to !== user.id) {
      await supabase.from('notifications').insert({
        type: 'fix_closed_by_admin', task_text: row.title, for_user: row.assigned_to,
        property: row.property, entity_id: String(row.id),
      })
    }
    onSaved()
  }

  // Closed by mistake. Goes back to whoever had it, or to Open if nobody did —
  // and the rating is cleared, since it was given for work now unfinished. The
  // approver goes with it: a name left on a request that is open again credits
  // somebody with a decision they have not made about it in this state.
  async function reopen() {
    if (!(await confirm({ message: t.reopenRepairConfirm, confirmLabel: t.reopen, danger: false }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('work_board').update({
      status: row.assigned_to ? 'assigned' : 'open',
      resolved_at: null,
      rating: null,
      approved_by: null,
      approved_by_name: null,
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
  // An admin finishing work they were assigned themselves has nobody to submit
  // to: the approve button is gated on `admin && !ownWork`, so approval_requested
  // would be a queue with no one able to clear it. Straight to completed, signed
  // off in their own name — the same two fields approve() and completeNow() write,
  // because it answers the same question: which admin stands behind this.
  const selfApproves = admin && isAssignee

  function submitForApproval() {
    if (resPhotos.length === 0) { setErr(t.photoRequired || 'Add a photo of the completed work'); return }
    const done = {
      resolution_note: note || null,
      resolution_photos: resPhotos,
      resolution_voice_url: resVoice || null,
    }
    if (selfApproves) {
      setStatus('completed', {
        ...done,
        resolved_at: nowISO(),
        approved_by: user.id,
        approved_by_name: user.name,
      })
      return
    }
    setStatus('approval_requested', done)
  }

  // footer actions depend on status + who's looking
  let actions = null
  if (s === 'open' && admin) {
    actions = <Button variant="primary" disabled={busy || !assignTo} onClick={saveAssignment} style={{ flex: 2 }}>{t.assign}</Button>
  } else if (s === 'assigned' && isAssignee) {
    actions = <Button variant="primary" disabled={busy} onClick={() => setStatus('in_progress')} style={{ flex: 2 }}>{t.startWork}</Button>
  } else if (s === 'in_progress' && isAssignee) {
    // The label has to match what the button does: for an admin on their own
    // assignment this completes the request rather than submitting it anywhere.
    actions = (
      <Button variant="success" disabled={busy || resPhotos.length === 0} onClick={submitForApproval} style={{ flex: 2 }}>
        {selfApproves ? t.markDone : (t.markForCompletion || 'Submit for Approval')}
      </Button>
    )
  } else if (s === 'approval_requested' && admin && !ownWork) {
    actions = (
      <>
        <Button variant="ghost" disabled={busy} onClick={() => setBackMode(true)} style={{ flex: 1 }}>{t.reject || 'Send Back'}</Button>
        {/* who passed it, so the board can answer that later */}
        <Button variant="success" disabled={busy} onClick={approve} style={{ flex: 2 }}>{t.approve || 'Approve'}</Button>
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
  // Not on your own assignment: this button closes work out on somebody else's
  // behalf, and there is nobody else here. isAssignee rather than ownWork —
  // ownWork exempts super admins by design, and that exemption is about keeping
  // their approve/reassign/delete powers, not about this.
  const canCloseNow = admin && !ownWork && !isAssignee && ['open', 'assigned', 'in_progress'].includes(s)
  // (delete is handled by the always-available button in the footer below)

  if (backMode) {
    return (
      <Modal
        open
        onClose={() => setBackMode(false)}
        title={fixTitle(row, lang === 'hi')}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setBackMode(false)} style={{ flex: 1 }}>{t.cancel}</Button>
            <Button variant="danger" disabled={busy || !backReasonGiven} onClick={sendBack} style={{ flex: 2 }}>
              {t.reject || 'Send Back'}
            </Button>
          </>
        )}
      >
        <Field
          label={t.sendBackReason}
          required
          hint={canRecord ? t.sendBackReasonHint : t.sendBackTypeRequired}
        >
          <VoiceRecorder folder="work-voice" value={backVoice} onChange={setBackVoice} />
        </Field>
        <Field label={`${t.notes} (${t.optional})`}>
          <textarea
            rows={3}
            value={backNote}
            onChange={(e) => setBackNote(e.target.value)}
            style={{ ...inputStyle(C), resize: 'vertical' }}
          />
        </Field>
        {err && <p style={{ fontSize: 13, color: C.red, marginTop: 4 }}>{err}</p>}
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={fixTitle(row, lang === 'hi')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: '1 1 88px' }}>{t.close}</Button>
          {/* Only on an overdue request that somebody is already holding. */}
          {canRemind && (
            <Button variant="ghost" disabled={busy || reminded} onClick={remind} style={{ flex: '1 1 150px', whiteSpace: 'nowrap' }}>
              <Icon name="bell" size={15} color={reminded ? C.green : TR_ORANGE} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
              {reminded ? t.remindSent : t.remindAssignee}
            </Button>
          )}
          {/* admins delete any request; the poster can delete their own */}
          {canDelete && (
            <Button variant="danger" disabled={busy} onClick={del} style={{ flex: '1 1 110px', whiteSpace: 'nowrap' }}>
              <Icon name="trash" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.delete}
            </Button>
          )}
          {canMarkDuplicate && (
            <Button variant="ghost" disabled={busy} onClick={markDuplicate} style={{ flex: '1 1 150px', whiteSpace: 'nowrap' }}>
              <Icon name="copy" size={15} color={C.tl} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
              {t.markDuplicate}
            </Button>
          )}
          {canCloseNow && (
            <Button
              variant="success"
              disabled={busy}
              onClick={() => (closing ? completeNow() : setClosing(true))}
              style={{ flex: '1 1 165px', whiteSpace: 'nowrap' }}
            >
              <Icon name={closing ? 'check' : 'camera'} size={15} color="#fff" style={{ marginRight: 4 }} />
              {closing ? t.markDone : t.closeItMyself}
            </Button>
          )}
          {actions}
        </>
      )}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge color={C[(STATUS_META[s] || STATUS_META.open).tone]} bg={C[(STATUS_META[s] || STATUS_META.open).bg]}>{statusLabel(s, t)}</Badge>
        <span style={{
          fontSize: 12.5, fontWeight: 700, color: C.tl,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {ticketNo(row)}
        </span>
        {isFlaggedPriority(row.priority) && (
          <Badge color={C[PRIOS[row.priority] || 'blue']}>{prioLabel(row.priority, t)}</Badge>
        )}
        {(row.category || 'other') !== 'other' && (
          <Badge color={C[FIX_CAT_TONE[row.category] || 'blue']} bg={C.cardAlt}>{fixCatLabel(row.category, t, lang)}</Badge>
        )}
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

      {/* Why it came back, for as long as that is still the open question. Once
          the work is done it has been answered; the fields are kept rather than
          cleared so the recording is not orphaned in storage. */}
      {!['completed', 'approved'].includes(s) && (row.rejection_note || row.rejection_voice_url) && (
        <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderLeft: `3px solid ${TR_ORANGE}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: TR_ORANGE, marginBottom: 6 }}>
            {t.sentBackReasonLabel}
          </div>
          {row.rejection_note && (
            <p style={{ fontSize: 13.5, color: C.text, marginBottom: row.rejection_voice_url ? 8 : 0, whiteSpace: 'pre-line' }}>
              {row.rejection_note}
            </p>
          )}
          {row.rejection_voice_url && <AudioPlayer src={row.rejection_voice_url} label={t.voiceNote} />}
        </div>
      )}
      {row.description && <p style={{ fontSize: 14, color: C.tl, marginBottom: 12, whiteSpace: 'pre-line' }}>{fixDesc(row, lang === 'hi')}</p>}
      {row.voice_url && (
        <div style={{ marginBottom: 12 }}>
          <AudioPlayer src={row.voice_url} label={t.voiceNote} />
        </div>
      )}
      <div style={{ fontSize: 13, color: C.tl, marginBottom: 12 }}>
        {posterName} · {fmtDateTime(row.created_at)}
      </div>

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
        <div style={{ fontSize: 13.5, marginBottom: 12 }}>{t.assignedTo}: <b>{assigneeName}</b></div>
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
          <Field label={t.assignedTo} required hint={assignPool.restricted
            ? t.tradeStaffOnly.replace('{d}', deptName(catDept(row.category), lang))
            : t.assigneeAnyVenueHint}>
            <PersonPicker
              C={C} t={t} lang={lang}
              people={assignPool.people}
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

      {/* The admin closing it out: their own photo of the finished work, and a
          note. Optional, because sometimes there is nothing left to photograph —
          but then the note says the request was closed without proof. */}
      {closing && canCloseNow && (
        <div ref={closeRef} style={{ background: C.gBg, border: `1px solid ${C.green}22`, borderRadius: 12, padding: 12, marginTop: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.green, marginBottom: 8 }}>{t.closeOnBehalf}</div>
          <Field label={`${t.uploadPhoto} (${t.optional})`} hint={t.closeOnBehalfHint}>
            <PhotoCapture folder="work_board" value={resPhotos} onChange={setResPhotos} />
          </Field>
          <Field label={`${t.completionNote} (${t.optional})`}>
            <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {/* Optional, unlike the recording on the way in: an answer already has
              a note and photos to stand on. */}
          <Field label={`${t.completionVoice} (${t.optional})`}>
            <VoiceRecorder folder="work-voice" value={resVoice} onChange={setResVoice} />
          </Field>
        </div>
      )}

      {/* Where the work stands, told to whoever asked for it. Written by an
          admin only; read by anyone who can open the request, because the person
          notified has to be able to see what they were notified about.
          
          Hidden outright when there is neither: no updates yet and no right to
          write one is an empty heading. */}
      {(canUpdate || updates.length > 0) && (
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="mic" size={16} color={C.tl} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{t.updates}</span>
          {updates.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.tl }}>{updates.length}</span>
          )}
        </div>

        {updates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 12 }}>{t.noUpdatesYet}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {updates.map((u) => (
              <div key={u.id} style={{
                borderLeft: `3px solid ${C.border}`, paddingLeft: 11,
              }}>
                <div style={{ fontSize: 12, color: C.faint, marginBottom: 3 }}>
                  <b style={{ color: C.tl, fontWeight: 700 }}>{u.by_name || '—'}</b>
                  {' · '}{fmtDateTime(u.created_at)}
                </div>
                {u.note && (
                  <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {u.note}
                  </div>
                )}
                {u.voice_url && (
                  <div style={{ marginTop: u.note ? 6 : 0 }}>
                    <AudioPlayer src={u.voice_url} label={t.voiceNote} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canUpdate && (
          <>
            {/* Who it reaches, said before it is written rather than discovered
                afterwards. */}
            <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 8 }}>
              {t.updateGoesTo} <b>{posterName}</b>
            </div>
            <Field label={`${t.addUpdate} (${t.optional})`}>
              <textarea
                rows={2}
                style={{ ...inputStyle(C), resize: 'vertical' }}
                value={upNote}
                placeholder={t.addUpdateHint}
                onChange={(e) => setUpNote(e.target.value)}
              />
            </Field>
            <VoiceRecorder value={upVoice} onChange={setUpVoice} folder="work_board" />
            <Button
              variant="primary"
              disabled={posting || (!upNote.trim() && !upVoice)}
              onClick={postUpdate}
              style={{ marginTop: 10 }}
            >
              {t.sendUpdate}
            </Button>
          </>
        )}
      </div>
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
          <Field label={`${t.completionVoice} (${t.optional})`}>
            <VoiceRecorder folder="work-voice" value={resVoice} onChange={setResVoice} />
          </Field>
        </>
      )}

      {/* resolution shown once submitted / completed */}
      {/* approved_by_name is in the condition on purpose: a fix can be submitted
          with no note and no photo, and the sign-off must still be visible. */}
      {['approval_requested', 'completed', 'approved'].includes(s) && (row.resolution_note || (row.resolution_photos || []).length > 0 || row.resolution_voice_url || row.approved_by_name) && (
        <div style={{ background: C.bg, borderRadius: 10, padding: 12, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t.completed} — {assigneeName}</div>
          {/* Who signed it off. Both admins and the super admin see this; it is
              the whole point of storing it. */}
          {row.approved_by_name && (
            <div style={{ fontSize: 12.5, color: C.tl, fontWeight: 600, marginBottom: 6 }}>
              <Icon name="check" size={13} color={C.green} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {t.approvedByAdmin} {row.approved_by_name}
            </div>
          )}
          {row.resolution_note && <p style={{ fontSize: 13.5, color: C.tl, marginBottom: 8 }}>{row.resolution_note}</p>}
          {row.resolution_voice_url && (
            <div style={{ marginBottom: 8 }}>
              <AudioPlayer src={row.resolution_voice_url} label={t.completionVoice} />
            </div>
          )}
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
    // Rows raised before priority existed have none. They read as 'normal'
    // everywhere else, so the dialog opens on the same answer rather than on a
    // blank that would save as one.
    priority: row.priority || 'normal',
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
      priority: form.priority,
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
      <Field label={t.priority}>
        <select
          style={inputStyle(C)}
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
        >
          {/* 'low' is retired — renderable, not offered. No request carries it
              today, but a select whose current value is missing from its own
              options does not show a blank: it shows the first one, and saves
              it. Keeping the row's own value in the list means opening this
              dialog can never change something you did not touch. */}
          {[...new Set([form.priority, ...PRIO_CHOICES])].map((pk) => (
            <option key={pk} value={pk}>{prioLabel(pk, t)}</option>
          ))}
        </select>
      </Field>
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
        padding: '8px 13px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3,
        background: active ? C.brandBg : C.card, color: active ? '#fff' : C.tl,
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
                border: `1.5px solid ${on ? C.brandBg : C.borderStrong || C.border}`, background: on ? C.brandBg : 'transparent',
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
