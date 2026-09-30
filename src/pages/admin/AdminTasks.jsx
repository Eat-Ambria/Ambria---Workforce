import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { nowISO, todayISO, fmtDate, fmtDateTime } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { TASK_STATUS, TASK_CATEGORIES, PRIORITIES, DEPARTMENTS, PROPERTIES, PROPERTY_MAP, propName, DEPARTMENT_MAP, canSeeAllProperties, scopedProperty, scopedDepartment, isTaskOverdue, isTodaysWork, overdueReason, dailyOverdueLabel, dayName, memberInProperty, assigneeLabel, isOwnAssignedWork, personName, deptName } from '../../constants/org'
import { assigneesQuery } from '../../lib/assignees'
import { statusColors } from '../../constants/status'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Field, inputStyle, filterStyle, FilterField, StatCard } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import RosterModal from './RosterModal'
import StaffProgress from './StaffProgress'
import MyTasks from '../employee/MyTasks'
import PhotoViewer from '../../components/common/PhotoViewer'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import VoiceRecorder from '../../components/common/VoiceRecorder'
import { deleteStorageFile } from '../../lib/storage'
import { translateToHindi } from '../../lib/translate'

const TR_ORANGE = '#EA580C' // overdue accent (matches the dashboard)

// One icon and one colour per band. The bands are a fixed list in org.js, so
// these are written out beside it rather than derived — a new band should be a
// deliberate choice of both, not whatever the next palette entry happens to be.
const CAT_ICON = {
  all: 'taskBoard', daily: 'myTasks', alternate: 'refresh',
  weekly: 'calendar', monthly: 'dashboard',
}
const CAT_TONE = {
  all: 'maroon', daily: 'blue', alternate: 'green',
  weekly: 'yellow', monthly: 'purple',
}

// A full-width segment in the view switcher. Same shape as PillTabs' buttons,
// written here because the row it lives in also carries the Issues pill, which
// keeps its own red and is not a scope.
function ScopeTab({ C, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 12,
        fontSize: 14, fontWeight: active ? 800 : 600,
        color: active ? '#fff' : C.tl,
        background: active ? C.brandBg : C.card,
        border: `1px solid ${active ? C.brandBg : C.border}`,
        boxShadow: active ? C.shadow : 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {children}
    </button>
  )
}

export default function AdminTasks() {
  const C = useColors()
  const roomy = useMediaQuery('(min-width: 560px)')
  // The wide layout. 900px because the sidebar already takes 244 of the width
  // and five cards in a row need what is left; below it every control here
  // stays exactly as it was, which is what the phone view is.
  const wide = useMediaQuery('(min-width: 900px)')
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
  // The tabs that list today's work only, and the status each one is.
  const TODAY_TABS = {
    pending: TASK_STATUS.PENDING,
    inprogress: TASK_STATUS.IN_PROGRESS,
    completed: TASK_STATUS.COMPLETED,
    review: TASK_STATUS.COMPLETION_REQUESTED,
  }

  const [members, setMembers] = useState([])
  // The app header's height, so the tab row can sit directly under it. Measured,
  // because the header is not a fixed size across breakpoints.
  const [appHeaderH, setAppHeaderH] = useState(0)
  const [list, setList] = useState([])       // current page of rows for the active tab
  const [counts, setCounts] = useState({})   // per-tab totals (server counts)
  const [catCounts, setCatCounts] = useState({})  // today's work per frequency band
  const [loading, setLoading] = useState(true)       // first load
  const [listLoading, setListLoading] = useState(false) // subsequent refreshes
  const [page, setPage] = useState(0)
  const [tab, setTab] = useState(presetTab || 'all')
  const [propFilter, setPropFilter] = useState(
    canSeeAllProps ? (presetProp || 'all') : user.property
  )
  const [catFilter, setCatFilter] = useState('all') // all | daily | weekly | monthly
  const [memberFilter, setMemberFilter] = useState(presetMember || 'all') // all | <staff id>
  const [review, setReview] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deptFilter, setDeptFilter] = useState('all')  // narrow the list to one department
  const [scope, setScope] = useState('all')    // 'all' = everyone's work | 'mine' = my own

  const today = todayISO()

  // apply property / department / category / staff filters to any query
  // `skipCat` is for the per-band counts under the frequency pills: a count under
  // "Weekly" has to ignore that "Daily" is selected, or every band but the chosen
  // one reads zero.
  const applyFilters = useCallback((q, { skipCat = false } = {}) => {
    const deptScope = scopedDepartment(user) // Sandeep → security only
    if (propFilter !== 'all') q = q.eq('property', propFilter)
    // a department-locked admin is pinned to theirs; everyone else may filter
    if (deptScope) q = q.eq('department', deptScope)
    else if (deptFilter !== 'all') q = q.eq('department', deptFilter)
    if (!skipCat && catFilter !== 'all') q = q.eq('category', catFilter)
    if (memberFilter !== 'all') q = q.eq('assigned_to', memberFilter)
    return q
  }, [user, propFilter, deptFilter, catFilter, memberFilter])

  // narrow a query to a tab's status condition
  const withStatus = useCallback((q, key) => {
    if (key === 'pending') return q.eq('status', TASK_STATUS.PENDING)
    if (key === 'inprogress') return q.eq('status', TASK_STATUS.IN_PROGRESS)
    if (key === 'completed') return q.eq('status', TASK_STATUS.COMPLETED)
    if (key === 'review') return q.eq('status', TASK_STATUS.COMPLETION_REQUESTED)
    if (key === 'issues') return q.in('issue_status', [TASK_STATUS.ISSUE, TASK_STATUS.ISSUE_WORKING])
    if (key === 'issuesDone') return q.eq('issue_status', TASK_STATUS.ISSUE_RESOLVED)
    // 'overdue' is not here. Whether a job is late depends on its category,
    // week_day, week_days, skip_sunday, month_week and the hour, together — it
    // does not reduce to a filter, and every attempt to write one has drifted
    // from isTaskOverdue and left the tab disagreeing with the tile above it.
    // See overdueRows() below.
    return q // 'all', and 'overdue'
  }, [])

  // switch to the tab carried by a navigation (e.g. a notification click),
  // even when we're already on this page and the component doesn't remount.
  useEffect(() => {
    if (location.state?.tab) { setTab(location.state.tab); setPage(0) }
  }, [location.state])

  // deep-link from a notification: open the exact task's review modal by id
  // Guarded on the navigation, not the id. Remembering the id meant the second
  // tap on the same notification was ignored for as long as the page lived;
  // location.key is new for every navigation and unchanged across re-renders,
  // which is exactly the difference that matters here.
  const focusedRef = useRef(null)
  useEffect(() => {
    const id = location.state?.focusTask
    if (!id || focusedRef.current === location.key) return
    focusedRef.current = location.key
    ;(async () => {
      const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
      if (data) setReview(data)
    })()
  }, [location.state])

  useEffect(() => {
    const measure = () => setAppHeaderH(document.querySelector('header')?.offsetHeight || 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // people list for the filter + assign dropdowns — staff and fellow admins,
  // scoped to this admin, loaded once
  useEffect(() => {
    if (!user) return
    assigneesQuery({ propScope: scopedProperty(user), deptScope: scopedDepartment(user) })
      .then(({ data }) => setMembers(data || []))
  }, [user])

  // Late work, decided by the same function the dashboard tile, My Tasks and
  // the row's own badge use. Fetched rather than filtered in SQL: nothing that
  // is already finished can be late, which is the only narrowing the database
  // can safely do here.
  const overdueRows = useCallback(async () => {
    const { data } = await applyFilters(
      supabase.from('tasks').select('*')
        .neq('status', TASK_STATUS.COMPLETED)
        .order('created_at', { ascending: false })
    )
    return (data || []).filter((r) => isTaskOverdue(r, today))
  }, [applyFilters, today])

  // Pending, In progress, Completed and Review are TODAY'S — the same set the
  // Dashboard's Daily Task tile counts, so tapping a figure there opens the list
  // it described. They used to be every row in the roster with that status:
  // 184 pending under a tile saying 34, and 4 completed under a tile saying 2,
  // because a monthly job done on the 3rd stays "completed" until next month.
  // One read for all four, split here. Filtered in the app rather than in the
  // query for the same reason as overdue: the rule reads the frequency and the
  // day together and does not reduce to one.
  const todaysRows = useCallback(async () => {
    const { data } = await applyFilters(
      supabase.from('tasks').select('*').order('created_at', { ascending: false })
    )
    return (data || []).filter((r) => isTodaysWork(r))
  }, [applyFilters])

  // load per-tab counts + the active tab's page whenever filters/tab/page change.
  // `silent` skips the loading dim — used by the background auto-refresh below.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!user) return
    if (!silent) setListLoading(true)
    const [countPairs, late, todays, bands] = await Promise.all([
      Promise.all(TAB_KEYS.filter((k) => k !== 'overdue' && !TODAY_TABS[k]).map((k) =>
        withStatus(applyFilters(supabase.from('tasks').select('*', { count: 'exact', head: true })), k)
          .then(({ count }) => [k, count || 0])
      )),
      overdueRows(),
      todaysRows(),
      // Today's work in each band, for the five cards. It used to be every
      // pending row in the roster — 215 of them, a Friday job and next month's
      // audit included — above a board that only ever shows today. Same rule as
      // the Dashboard's Daily Task tile (isTodaysWork), so the two agree for the
      // same venue and member. Every status, not just pending: "All tasks" is
      // how much today holds, the way the tile's Total is.
      applyFilters(
        supabase.from('tasks').select('category, week_day, week_days, skip_sunday, month_week'),
        { skipCat: true },
      ).then(({ data }) => (data || []).filter((r) => isTodaysWork(r))),
    ])
    const from = page * PAGE_SIZE
    const ofStatus = (k) => todays.filter((r) => r.status === TODAY_TABS[k])
    // overdue and today's tabs paginate the rows they already have; the rest
    // page in the database as before
    const data = tab === 'overdue' ? late.slice(from, from + PAGE_SIZE)
      : TODAY_TABS[tab] ? ofStatus(tab).slice(from, from + PAGE_SIZE)
      : (await withStatus(
          applyFilters(supabase.from('tasks').select('*').order('created_at', { ascending: false })),
          tab
        ).range(from, from + PAGE_SIZE - 1)).data

    setCounts({
      ...Object.fromEntries(countPairs),
      overdue: late.length,
      ...Object.fromEntries(Object.keys(TODAY_TABS).map((k) => [k, ofStatus(k).length])),
    })
    setCatCounts(bands.reduce(
      (acc, r) => ({ ...acc, all: (acc.all || 0) + 1, [r.category]: (acc[r.category] || 0) + 1 }),
      {},
    ))
    setList(data || [])
    setListLoading(false)
    setLoading(false)
  }, [user, applyFilters, withStatus, overdueRows, todaysRows, tab, page])

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
  const changeDept = (d) => { setDeptFilter(d); setPage(0) }
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
  // Lit only where the queue actually is. The buttons now show on every view,
  // and a tab left on 'issues' would otherwise light them up over the Roster.
  const issuesOn = scope === 'all' && issueView
  const reviewOn = scope === 'all' && tab === 'review'
  // One tab lit at a time. Issues and the review queue live INSIDE All tasks,
  // so with either open both All tasks and it were filled — two selected tabs
  // in a row of four, and no telling which one you were on. All tasks lights
  // only for its own view, and tapping it from inside Issues goes back to it.
  const allTasksOn = scope === 'all' && !issuesOn && !reviewOn
  // Read off the tab, not the lit flags: coming back from My Tasks with Issues
  // still left open underneath, All tasks has to mean All tasks.
  const openAllTasks = () => { setScope('all'); if (issueView || tab === 'review') changeTab('all') }

  const c = (k) => (counts[k] ? ` (${counts[k]})` : '')
  // Rows from the retired approval queue can still be sitting in 'review'.
  // Nothing sends work there any more, so surface it only while it isn't empty.
  const staleReview = (counts.review || 0) > 0
  // Cards are for work you have to open and act on — an issue, or a leftover
  // approval. Everyday work is the progress table above; a 400-card list of it
  // was never read to the end.
  // Any status other than "none chosen" means somebody asked for a list —
  // the Issues button, the Review button, or a dashboard tile deep-linking in.
  // This used to name three tabs explicitly, so five of the six dashboard tiles
  // landed here and silently showed the progress table instead.
  const showList = tab !== 'all'
  const tabLabel = {
    overdue: t.overdue, pending: t.pending, inprogress: t.inProgress,
    review: t.reviewQueue, completed: t.completed,
    issues: t.openIssues, issuesDone: t.issueResolved,
  }[tab] || ''

  if (loading) return <Loader label={t.loading} />

  const total = counts[tab] || 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      {/* Three ways into the same work. "My tasks" renders the staff screen
          itself rather than a copy, because an admin doing their own task needs
          the worker flow — before photo, start, submit — not the review one.
          "Roster" is where the work is handed out: it used to hide behind a
          button and open as a dialog, which is the wrong container for a
          121-row document. */}
      {/* Stays put: switching view is the one thing you should never have to
          scroll up for. Opaque, and stretched past the page padding, because rows
          pass underneath it and any gap or tint reads as a rendering fault.
          data-tabs-bar is how the roster measures this from its own component. */}
      <div
        data-tabs-bar
        style={{
          position: 'sticky', top: appHeaderH, zIndex: 70,
          display: 'flex', gap: 8, flexWrap: 'wrap',
          background: C.bg,
          // The bar has to start at the very top of <main>, not 16px into it.
          // main's own padding was a transparent strip above this row, and while
          // the row is stuck under the header everything below scrolls THROUGH
          // that strip — which is the band of colour appearing between the
          // header and the tabs. The negative margin eats the padding on all
          // three sides and the padding puts it back inside, so the tabs sit
          // exactly where they did and the background now reaches the header.
          //
          // -16 rather than the -12 it was: main's padding is 16, so 12 left a
          // 4px sliver down each side doing the same thing more quietly.
          padding: '26px 16px 10px', margin: '-16px -16px 8px',
        }}
      >
        {/* Wide: three equal segments across the page. Narrow: the chips it has
            always been, which fit a phone and are what the staff view uses. */}
        {wide ? (
          <>
            <ScopeTab C={C} active={allTasksOn} onClick={openAllTasks}>{t.allTasks}</ScopeTab>
            <ScopeTab C={C} active={scope === 'mine'} onClick={() => setScope('mine')}>{t.myTasks}</ScopeTab>
            <ScopeTab C={C} active={scope === 'roster'} onClick={() => setScope('roster')}>{t.roster}</ScopeTab>
          </>
        ) : (
          <>
            <PropChip C={C} full active={allTasksOn} onClick={openAllTasks}>{t.allTasks}</PropChip>
            <PropChip C={C} full active={scope === 'mine'} onClick={() => setScope('mine')}>{t.myTasks}</PropChip>
            <PropChip C={C} full active={scope === 'roster'} onClick={() => setScope('roster')}>{t.roster}</PropChip>
          </>
        )}

        {/* Issues sit up here with the view switcher, not under the progress
            table. Something has gone wrong on two jobs — that is the first
            thing an admin should see, not the last.

            On every view, not only "All tasks". It used to vanish on My Tasks
            and the Roster, which made the other three tabs jump wider under the
            finger — and an issue does not stop being the first thing to see
            because you are looking at the roster. The queue itself lives under
            All tasks, so from the other two it takes you there. */}
        <span style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', ...(wide ? { flex: 1 } : null) }}>
            {staleReview && (
              <button
                onClick={() => {
                  if (scope !== 'all') { setScope('all'); changeTab('review'); return }
                  changeTab(tab === 'review' ? 'all' : 'review')
                }}
                aria-pressed={reviewOn}
                style={{
                  whiteSpace: 'nowrap', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 14px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: reviewOn ? C.brandBg : C.cardAlt,
                  color: reviewOn ? '#fff' : C.tl,
                  border: `1px solid ${reviewOn ? C.maroon : C.border}`,
                }}
              >
                {t.reviewQueue} ({counts.review})
              </button>
            )}
            <button
              onClick={() => {
                if (scope !== 'all') { setScope('all'); changeTab('issues'); return }
                changeTab(issueView ? 'all' : 'issues')
              }}
              aria-pressed={issuesOn}
              style={{
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                ...(wide
                  ? { width: '100%', padding: '12px 14px', borderRadius: 12 }
                  : { padding: '9px 14px', borderRadius: 999 }),
                fontSize: 14, fontWeight: 700,
                background: issuesOn ? C.red : C.rBg,
                color: issuesOn ? '#fff' : C.red,
                // A border like the three tabs beside it. It had none, so on the
                // light theme it was a pale pink patch with no edge, and read as
                // a smudge next to the outlined tabs rather than as the fourth.
                border: `1px solid ${issuesOn ? C.red : `${C.red}55`}`,
              }}
            >
              <Icon name="warning" size={15} color={issuesOn ? '#fff' : C.red} />
              {t.issues}{counts.issues ? ` (${counts.issues})` : ''}
            </button>
        </span>
      </div>

      {scope === 'roster' ? (
        <RosterModal
          inline
          user={user}
          members={members}
          canSeeAllProps={canSeeAllProps}
          defaultProperty={propFilter !== 'all' ? propFilter : (user.property !== 'all' ? user.property : undefined)}
          onSaved={() => load()}
        />
      ) : scope === 'mine' ? <MyTasks /> : (
      <>
      <SectionTitle>{t.tasks}</SectionTitle>

      {/* Four filters, one strip. The leading icons are gone: every option
          already names its own filter -- "Properties - All" -- so each icon
          repeated the word beside it while costing the select 24px, which is
          why that option was arriving truncated. auto-fit rather than a
          breakpoint: it lands on two columns on a phone and one row on a
          desktop, and stays right when an admin scoped to one venue or one
          department sees only two of them. */}
      <div style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {canSeeAllProps && (
          <FilterField label={t.properties}>
            <select style={filterStyle(C)} value={propFilter} onChange={(e) => changeProp(e.target.value)}>
              <option value="all">{t.all}</option>
              {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
            </select>
          </FilterField>
        )}
        {/* department — hidden for an admin already locked to one, who has no
            choice to make */}
        {!scopedDepartment(user) && (
          <FilterField label={t.department}>
            <select style={filterStyle(C)} value={deptFilter} onChange={(e) => changeDept(e.target.value)}>
              <option value="all">{t.all}</option>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>)}
            </select>
          </FilterField>
        )}
        <FilterField label={t.members}>
          <select style={filterStyle(C)} value={memberFilter} onChange={(e) => changeMember(e.target.value)}>
            <option value="all">{t.all}</option>
            {memberOptions.map((m) => <option key={m.id} value={m.id}>{personName(m, lang)}</option>)}
          </select>
        </FilterField>
      </div>

      {/* One setting with five values, made to fit rather than made to scroll.
          Sideways scrolling left "Monthly" off the edge of a phone, and a filter
          nobody can see is a filter nobody uses. On narrow the type and padding
          tighten and "Alternate days" shortens — the roster already labels that
          band ALT / बदल. overflow stays as a backstop for a longer translation,
          with the bar hidden. */}
      {wide ? (
        // The same one setting with five values, given the room to be read at a
        // glance instead of squeezed into a segmented control. Still a filter:
        // the card that is on carries the border, and tapping it again clears
        // back to All, exactly as the strip below does.
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {['all', ...TASK_CATEGORIES].map((cat) => (
            <StatCard
              key={cat}
              icon={CAT_ICON[cat] || 'tasks'}
              tone={CAT_TONE[cat] || 'maroon'}
              label={cat === 'all' ? t.allTasks : t[cat]}
              value={catCounts[cat] || 0}
              active={catFilter === cat}
              onClick={() => changeCat(cat)}
            />
          ))}
        </div>
      ) : (
      <div className="no-bar" style={{
        display: 'flex', gap: 2, marginBottom: 14, padding: 3,
        background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 11,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {['all', ...TASK_CATEGORIES].map((cat) => {
          const on = catFilter === cat
          return (
            <button
              key={cat}
              type="button"
              onClick={() => changeCat(cat)}
              aria-pressed={on}
              className={`seg-opt${on ? ' is-on' : ''}`}
              style={{
                flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap',
                display: 'grid', justifyItems: 'center', gap: 1,
                padding: roomy ? '6px 16px' : '5px 6px', borderRadius: 9,
                fontSize: roomy ? 13.5 : 13, fontWeight: on ? 700 : 600,
                ...(on ? { background: C.card, color: C.maroon } : null),
                '--seg-ink': C.tl, '--seg-hover': C.card, '--seg-hover-ink': C.text,
                border: 'none', boxShadow: on ? C.shadow : 'none', cursor: 'pointer',
              }}
            >
              <span>{cat === 'all' ? t.all : (!roomy && cat === 'alternate' ? t.alternateShort : t[cat])}</span>
              {/* How much of today is in this band. A zero is drawn too — an
                  empty band is an answer, and leaving it blank makes the row jump
                  as the counts land. */}
              <span style={{
                fontSize: roomy ? 11 : 10.5, fontWeight: 700, lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
                color: (catCounts[cat] || 0) ? (on ? C.maroon : C.faint) : C.faint,
                opacity: (catCounts[cat] || 0) ? 1 : 0.55,
              }}>
                {catCounts[cat] || 0}
              </span>
            </button>
          )
        })}
      </div>
      )}

      {/* Hidden while looking at issues or the leftover approval queue. That
          table answers "how is today going", which is not the question you are
          asking when you have opened an exception — and it is tall enough that
          the list underneath it looked like nothing had happened at all.
          The progress table only selects the columns it draws, so opening a job
          re-reads the whole row — the modal needs photos, notes, the issue trail. */}
      {!showList && (
      <StaffProgress
        user={user}
        members={members}
        propFilter={propFilter}
        deptFilter={deptFilter}
        memberFilter={memberFilter}
        catFilter={catFilter}
        onOpenTask={async ({ id }) => {
          const { data } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
          if (data) setReview(data)
        }}
      />
      )}

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

      {showList && (<>
      {/* Arriving from a dashboard tile used to leave no sign of what was being
          filtered, and no way back to the day's progress. */}
      {!issueView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {tabLabel} ({counts[tab] || 0})
          </span>
          <button
            type="button"
            onClick={() => changeTab('all')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
              background: C.card, color: C.tl, border: `1px solid ${C.border}`,
            }}
          >
            <Icon name="close" size={13} color={C.tl} />
            {t.clearFilter}
          </button>
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
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{nameOf(task.assigned_to, task.assignee_name)}</span>
                      {task.area ? ` · ${task.area}` : ''}
                    </div>
                    {task.department && (
                      <div style={{ fontSize: 12, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: DEPARTMENT_MAP[task.department]?.color || C.tl }} />
                        {deptName(task.department, lang)}
                      </div>
                    )}
                    {canSeeAllProps && (
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="pin" size={12} /> {propName(task.property, lang)}
                      </div>
                    )}
                    {/* Why it is late, in words. This line used to render only
                        when the row carried a due_date — and almost none do, so a
                        weekly round three days past its Monday sat in the Overdue
                        tab with nothing on it to say so. */}
                    {(() => {
                      const why = overdueReason(task, today)
                      if (!why) {
                        return task.due_date ? (
                          <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: C.faint }}>
                            <Icon name="clock" size={12} color={C.faint} />
                            {t.dueDate}: {fmtDate(task.due_date)}
                          </div>
                        ) : null
                      }
                      // Monthly work is 'today' here, not a kind of its own — a
                      // job pinned to one exact date is same-day work, like
                      // daily and alternate; see the comment on overdueReason.
                      const say = why.kind === 'date' ? fmtDate(why.date)
                        : why.kind === 'weekday' ? t.lateWasDue.replace('{d}', dayName(why.day, lang))
                        : t.lateToday.replace('{h}', dailyOverdueLabel())
                      // how far past, when that is a number worth reading
                      const by = why.kind === 'weekday' && why.late > 0 ? t.lateDays.replace('{n}', why.late) : ''
                      return (
                        <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: TR_ORANGE, fontWeight: 700 }}>
                          <Icon name="warning" size={12} color={TR_ORANGE} />
                          {t.overdue} · {say}{by ? ` · ${by}` : ''}
                        </div>
                      )
                    })()}
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
      </>)}

      </>
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
      {creating && (
        <CreateModal
          user={user}
          members={members}
          record={creating === true ? null : creating}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            load()
          }}
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
        background: active ? C.brandBg : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
        // grow to share a wide row, but keep a readable minimum and wrap to the
        // next line instead of squeezing the label away on a phone
        flex: full ? '1 1 auto' : undefined,
        minWidth: full ? 86 : undefined,
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
  // Staff now finish their own tasks, so this is the state an admin reviews.
  // isQueue only ever matches rows left over from the old approval flow.
  const isQueue = task.status === TASK_STATUS.COMPLETION_REQUESTED
  const isDone = task.status === TASK_STATUS.COMPLETED

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
  // The assignee never got to it. An admin can close it out, but the record has
  // to be honest about that: completed_by is the admin, and a note says the work
  // was signed off without the usual photo proof, so a completion with no
  // before/after images is never mistaken for one that had them.
  async function completeForStaff() {
    if (!(await confirm({ message: t.markDoneNoProofConfirm, confirmLabel: t.markDone }))) return
    const patch = {
      status: TASK_STATUS.COMPLETED,
      completed_at: nowISO(),
      completed_by: user.id,
      approved_by: user.id,
      approved_at: nowISO(),
      rejection_voice_url: null,
    }
    if (!task.completion_note) patch.completion_note = t.closedByAdminNote
    const voiceUrl = task.rejection_voice_url
    if (await update(patch)) {
      // the person it was assigned to gets told, so a task disappearing from
      // their list is never a mystery
      await notifyEmployee('task_closed_by_admin')
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
  // Send it back to be done again. Reachable from a finished task as well as
  // from the (now legacy) approval queue: the work is reopened In Progress and
  // the after-work proof is cleared, so the photos on the task always belong to
  // the attempt being looked at. The before photo and the timer's start stay —
  // the job was begun, and the completion already went into task_completions.
  async function sendBack() {
    if (!rejectNote.trim() && !rejectVoice) return
    const prevVoice = task.rejection_voice_url // an earlier send-back's note, if any — replace it
    const ok = await update({
      status: TASK_STATUS.IN_PROGRESS,
      rejection_note: rejectNote || null,
      rejection_voice_url: rejectVoice || null,
      completion_photo: null,
      completion_note: null,
      completion_requested_at: null,
      completed_at: null,
      completed_by: null,
      approved_by: null,
      approved_at: null,
    })
    if (ok) {
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
      footer={rejectMode ? (
        <>
          <Button variant="ghost" onClick={() => setRejectMode(false)} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="danger" onClick={sendBack} disabled={busy || (!rejectNote.trim() && !rejectVoice)} style={{ flex: 2 }}>
            {isDone ? t.sendForRedo : t.reject}
          </Button>
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
          {/* the work is finished; the admin's remaining call is "do it again" */}
          {isDone && !ownWork && (
            <Button variant="ghost" onClick={() => setRejectMode(true)} disabled={busy} style={{ flex: 2 }}>
              <Icon name="refresh" size={15} color={C.text} style={{ marginRight: 4 }} />{t.sendForRedo}
            </Button>
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
          {!ownWork && !isQueue && sc.key !== 'completed' && (
            <Button variant="success" onClick={completeForStaff} disabled={busy} style={{ flexShrink: 0 }}>
              <Icon name="check" size={15} color="#fff" style={{ marginRight: 4 }} />{t.markDone}
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
          <Field label={isDone ? t.redoReason : t.rejectionNote} hint={isDone ? t.redoReasonHint : undefined}>
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
        description: form.description?.trim() || null,
        // Area and window are trimmed for the same reason the title is: the
        // roster identifies a job by them, and so does the unique index on the
        // table. A trailing space files one job under two names, and then draws
        // it as two rows nothing can tell apart.
        area: form.area?.trim() || null,
        time_block: form.time_block?.trim() || null,
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
      description: form.description?.trim() || null,
      area: form.area?.trim() || null,
      time_block: form.time_block?.trim() || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to: i === 0 ? (form.assigned_to || null) : null,
      assignee_name: i === 0 ? (assignee?.name || null) : null,
      status: TASK_STATUS.PENDING,
      task_date: todayISO(),
    }))
    // The same person cannot hold the same job twice at one venue. Saying so
    // here means an accidental second save is a clear message rather than a
    // duplicate card on their phone — or a raw constraint error from the table.
    //
    // Asked exactly the way the index asks it — venue, person, department,
    // frequency, title, area, window. Checking on title alone was stricter than
    // the table: the same round at 9am and at 5pm is two jobs, and this refused
    // the second one as a duplicate.
    const first = rows[0]
    if (first.assigned_to) {
      let q = supabase.from('tasks')
        .select('id')
        .eq('property', first.property)
        .eq('title', first.title)
        .eq('assigned_to', first.assigned_to)
        .eq('department', first.department)
        .eq('category', first.category)
      q = first.area ? q.eq('area', first.area) : q.is('area', null)
      q = first.time_block ? q.eq('time_block', first.time_block) : q.is('time_block', null)
      const { data: clash } = await q.limit(1)
      if (clash?.length) { setBusy(false); setErr(t.taskAlreadyThere); return }
    }
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
