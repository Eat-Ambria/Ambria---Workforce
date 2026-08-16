import { Children, cloneElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, fmtDate } from '../lib/time'
import { useColors } from '../context/ThemeContext'
import { useT, useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { personName, isAdminRole, canSeeAllProperties, scopedProperty, scopedDepartment, isTaskOverdue, notDueToday, dailyOverdueLabel, memberInProperty, isFlaggedPriority, taskFrequency, frequencyLabel, FREQUENCY_MAP, TASK_STATUS, PROPERTIES, PROPERTY_MAP, propName } from '../constants/org'
import { assigneesQuery } from '../lib/assignees'
import { Card, Loader, SectionTitle, filterStyle, FilterField } from '../components/common/UI'
import Icon from '../components/common/Icon'
import { useMediaQuery } from '../hooks/useMediaQuery'

function tint(hex, alpha = 0.1) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function Dashboard() {
  const { user } = useAuth()
  const admin = isAdminRole(user?.role)
  return admin ? <AdminDashboard user={user} /> : <EmployeeDashboard user={user} />
}

/* ------------------------------ ADMIN ------------------------------ */
function AdminDashboard({ user }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const navigate = useNavigate()
  const scopeAll = canSeeAllProperties(user)
  // desktop has room for every venue; the dropdown stays for narrow screens
  const wide = useMediaQuery('(min-width: 900px)')

  const [loading, setLoading] = useState(true)
  const [d, setD] = useState(null)          // aggregated stats (server counts)
  const [members, setMembers] = useState([]) // staff for the filter dropdown
  const [prop, setProp] = useState('all') // top-level property selector (all-scope admins)
  const [member, setMember] = useState('all') // staff filter for task stats (all | <staff id>)

  // people list for the filter — staff + admins (both can hold tasks),
  // scoped to the admin, loaded once
  useEffect(() => {
    assigneesQuery({ propScope: scopedProperty(user), deptScope: scopedDepartment(user) })
      .then(({ data }) => setMembers(data || []))
  }, [user])

  // all counts computed in the database; re-runs when property / member changes
  const load = useCallback(async () => {
    const propScope = scopedProperty(user)   // null = every property
    const deptScope = scopedDepartment(user) // null = every department
    const today = todayISO()

    // Today's rows, not a count of all of them. Everything about tasks is
    // counted from these in memory — see the note where they are read back.
    const taskRowsQ = (() => {
      let q = supabase.from('tasks')
        .select('id, status, priority, category, week_day, week_days, skip_sunday, month_week, due_date')
      if (deptScope) q = q.eq('department', deptScope)
      if (prop !== 'all') q = q.eq('property', prop)
      else if (propScope) q = q.eq('property', propScope)
      if (member !== 'all') q = q.eq('assigned_to', member)
      return q
    })()

    const boardBase = () => {
      let q = supabase.from('work_board').select('*', { count: 'exact', head: true })
      if (deptScope) q = q.eq('department', deptScope)
      if (prop !== 'all') q = q.eq('property', prop)
      else if (propScope) q = q.eq('property', propScope)
      return q
    }
    // fire / chem still need rows (expiry buckets, quantity sum) — small + scoped
    const scopedRows = (table, cols, hasDept) => {
      let q = supabase.from(table).select(cols)
      if (deptScope && hasDept) q = q.eq('department', deptScope)
      if (prop !== 'all') q = q.eq('property', prop)
      else if (propScope) q = q.eq('property', propScope)
      return q
    }
    let vq = supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_active', true)
    if (propScope) vq = vq.eq('property', propScope)
    else if (prop !== 'all') vq = vq.or(`property.eq.${prop},property.eq.all`)

    // work assigned to THIS admin — admins can be given tasks / repairs too.
    // Deliberately unfiltered by the property/member selectors: it's personal.
    const myTasksQ = supabase.from('tasks').select('*', { count: 'exact', head: true })
      .eq('assigned_to', user.id).neq('status', TASK_STATUS.COMPLETED)
    const myFixesQ = supabase.from('work_board').select('*', { count: 'exact', head: true })
      .eq('assigned_to', user.id).neq('status', 'approved').neq('status', 'completed')

    // ORDER IS THE CONTRACT. These names are matched to the array below by
    // position and nothing else — no key, no label, no error if they slip. Add a
    // query in the middle of one list and the end of the other and every name
    // after it silently reads somebody else's answer, which is exactly what
    // happened to bUrgent and bHigh: Fire Safety read the vendor count, the
    // chemical log read the video count, and Urgent read a rows response that
    // has no .count at all, so it displayed 0 while nine requests were urgent.
    //
    // Keep the two lists in the same order, and add to the end of both.
    const [
      taskRows,
      bOpen, bProg, bDone, bUrgent, bHigh,
      vendors, videos, fireR, chemR, boardOverdue,
      myTasks, myFixes,
    ] = await Promise.all([
      taskRowsQ,
      boardBase().in('status', ['open', 'assigned']),
      boardBase().in('status', ['in_progress', 'approval_requested']),
      boardBase().in('status', ['approved', 'completed']),
      // Urgent and High among the requests still OPEN. Counting finished ones
      // too would leave the number high all week after the work was done.
      boardBase().eq('priority', 'urgent').not('status', 'in', '("approved","completed")'),
      boardBase().eq('priority', 'high').not('status', 'in', '("approved","completed")'),
      vq,
      supabase.from('training_videos').select('*', { count: 'exact', head: true }).eq('is_active', true),
      scopedRows('fire_extinguishers', 'expiry_date', false),
      scopedRows('chemical_usage', 'quantity', true),
      // repair requests past their due date and not finished (counted as overdue)
      boardBase().lt('due_date', today).neq('status', 'approved').neq('status', 'completed'),
      myTasksQ,
      myFixesQ,
    ])

    const cnt = (r) => r.count || 0

    // Only what is due today. A Monday-only round and a week-4 monthly job are
    // both on the roster and neither is today's work — counting them made this
    // tile read 312 above a list of 247.
    //
    // isDueToday / isTaskOverdue are imported rather than rebuilt as filters:
    // the rule reads category, week_day, week_days, skip_sunday and month_week
    // together, and a second copy of it is how a tile and the screen it opens
    // start disagreeing.
    const due = (taskRows.data || []).filter((r) => !notDueToday(r))
    const tc = (fn) => due.filter(fn).length
    const fireStat = { ok: 0, expiring: 0, expired: 0 }
    ;(fireR.data || []).forEach((e) => {
      if (!e.expiry_date) { fireStat.ok++; return }
      const days = Math.ceil((new Date(e.expiry_date) - new Date(today)) / 86400000)
      if (days < 0) fireStat.expired++
      else if (days <= 15) fireStat.expiring++
      else fireStat.ok++
    })
    const chemRows = chemR.data || []

    setD({
      task: {
        total: due.length,
        pending: tc((r) => r.status === TASK_STATUS.PENDING),
        inProgress: tc((r) => r.status === TASK_STATUS.IN_PROGRESS),
        waiting: tc((r) => r.status === TASK_STATUS.COMPLETION_REQUESTED),
        done: tc((r) => r.status === TASK_STATUS.COMPLETED),
        // one rule for late work, the same one My Tasks and the board use
        overdue: tc((r) => isTaskOverdue(r, today)),
        priority: {
          high: tc((r) => r.priority === 'high'),
          medium: tc((r) => r.priority === 'medium'),
          low: tc((r) => r.priority === 'low'),
        },
      },
      board: {
        open: cnt(bOpen), progress: cnt(bProg), done: cnt(bDone), overdue: cnt(boardOverdue),
        urgent: cnt(bUrgent), high: cnt(bHigh),
      },
      mine: { tasks: cnt(myTasks), fixes: cnt(myFixes) },
      vendors: cnt(vendors),
      fire: fireStat,
      chem: { entries: chemRows.length, total: chemRows.reduce((s, r) => s + Number(r.quantity || 0), 0) },
      videos: cnt(videos),
    })
    setLoading(false)
  }, [user, prop, member])

  useEffect(() => { load() }, [load])

  // people options for the filter — scoped to the selected property, sorted by name
  const memberOptions = useMemo(() => {
    const scoped = members.filter((m) => memberInProperty(m, prop))
    return [...scoped].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members, prop])

  // reset the person filter if the chosen member isn't in the current property scope
  useEffect(() => {
    if (member !== 'all' && members.length && !memberOptions.some((m) => m.id === member)) setMember('all')
  }, [memberOptions, member, members])

  if (loading || !d) return <Loader label={t.loading} />

  const task = d.task
  const scopeLabel = prop === 'all' ? t.all : propName(prop, lang)

  // navigate to a section, carrying the selected property + optional target tab
  const go = (path, tab) => {
    const state = {}
    if (prop !== 'all') state.property = prop
    if (tab) state.tab = tab
    if (member !== 'all' && path === '/tasks') state.member = member
    navigate(path, { state: Object.keys(state).length ? state : undefined })
  }

  return (
    <div>
      {/* An all-venue admin has the chip row below saying which venue; repeating
          it here as "Properties: All" was the same answer twice. Today's date is
          the thing nothing else on the page states, and every figure on it is
          today's. A single-venue admin keeps their venue, which they have no
          chips to read it from. */}
      <SectionTitle subtitle={scopeAll ? fmtDate(todayISO()) : propName(user?.property, lang)}>
        {t.welcome}, {personName(user, lang)}
      </SectionTitle>

      {/* venue + staff filters — both dropdowns, side by side (stack on narrow) */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {scopeAll && (wide ? (
          /* One setting with six values, drawn as one object. Six separate
             pills read as six independent toggles, which is not what they are —
             the same control the Analytics period bar uses. */
          <div className="no-bar" style={{
            display: 'flex', gap: 2, padding: 3, minWidth: 0,
            background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10,
            // contained, or six unshrinkable buttons push the page sideways
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            {[{ code: 'all', name: t.all }, ...PROPERTIES.map((p) => ({ code: p.code, name: propName(p.code, lang) }))]
              .map((p) => {
                const on = prop === p.code
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setProp(p.code)}
                    aria-pressed={on}
                    style={{
                      whiteSpace: 'nowrap', padding: '7px 15px', borderRadius: 8,
                      fontSize: 13, fontWeight: on ? 700 : 600,
                      background: on ? C.card : 'transparent',
                      color: on ? C.maroon : C.tl,
                      border: 'none', boxShadow: on ? C.shadow : 'none', cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </button>
                )
              })}
          </div>
        ) : (
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <FilterField label={t.properties}>
              <select style={filterStyle(C)} value={prop} onChange={(e) => setProp(e.target.value)}>
                <option value="all">{t.all}</option>
                {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
              </select>
            </FilterField>
          </div>
        ))}
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <FilterField label={t.members}>
            <select style={filterStyle(C)} value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="all">{t.all}</option>
              {memberOptions.map((m) => <option key={m.id} value={m.id}>{personName(m, lang)}</option>)}
            </select>
          </FilterField>
        </div>
      </div>

      {/* Work handed to this admin personally — only shown when there is some, so
          the rest of the time the dashboard stays purely org-wide.
          A line, not a banner: two chips in a full-width tinted bar with their
          own icon read as an alert, and this is just the admin's own work. */}
      {(d.mine.tasks > 0 || d.mine.fixes > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.faint }}>
            {t.assignedToMe}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {d.mine.tasks > 0 && (
              <MineChip C={C} label={t.myTasks} value={d.mine.tasks} onClick={() => navigate('/my-tasks', { state: { status: 'all' } })} />
            )}
            {d.mine.fixes > 0 && (
              <MineChip C={C} label={t.taskBoard} value={d.mine.fixes} onClick={() => navigate('/task-board')} />
            )}
          </div>
        </div>
      )}

      {/* Side by side once there is room. Overdue carries two numbers and was
          taking a band as wide as the four above it, which pushed everything
          worth reading below the fold. */}
      <div style={{
        display: 'grid', gap: 14, alignItems: 'start', marginBottom: 4,
        gridTemplateColumns: wide ? 'minmax(0, 3fr) minmax(0, 2fr)' : '1fr',
      }}>
      {/* Tasks — every task figure in one block */}
      <StatBlock C={C} icon="tasks" tone={C.maroon} title={t.tasks} onView={() => go('/tasks', 'all')}>
        <StatCell C={C} icon="tasks" value={task.total} label={t.totalTasks} tone={C.maroon} onClick={() => go('/tasks', 'all')} />
        <StatCell C={C} icon="clock" value={task.pending} label={t.pending} tone={C.yellow} onClick={() => go('/tasks', 'pending')} />
        <StatCell C={C} icon="refresh" value={task.inProgress} label={t.inProgress} tone={C.blue} onClick={() => go('/tasks', 'inprogress')} />
        {/* staff close their own tasks now — this only counts rows left over
            from the old approval queue, so the tile goes once they are cleared */}
        {task.waiting > 0 && (
          <StatCell C={C} icon="inbox" value={task.waiting} label={t.reviewQueue} tone={C.indigo} onClick={() => go('/tasks', 'review')} />
        )}
        <StatCell C={C} icon="check" value={task.done} label={t.completed} tone={C.green} onClick={() => go('/tasks', 'completed')} />
      </StatBlock>

      {/* Overdue — tasks and repairs together, because both are late work */}
      <StatBlock
        C={C} icon="warning" tone={C.red} title={t.overdue}
        hint={task.overdue + d.board.overdue === 0
          ? (lang === 'hi' ? 'कुछ भी बाकी नहीं — शाबाश' : 'Nothing late — all clear')
          : undefined}
      >
        <StatCell C={C} icon="calendar" strong value={task.overdue} label={t.tasks} tone={C.red} onClick={() => go('/tasks', 'overdue')} />
        <StatCell C={C} icon="taskBoard" strong value={d.board.overdue} label={t.taskBoard} tone={C.red} onClick={() => navigate('/task-board', { state: { tab: 'overdue' } })} />
      </StatBlock>
      </div>

      {/* section widgets */}
      <div style={widgetGrid}>
        <Widget C={C} icon="taskBoard" title={t.taskBoard} onView={() => go('/task-board')}>
          {/* What needs doing first, before how much there is. Both count only
              unfinished requests, so the number falls as the work gets done. */}
          <Row C={C} label={t.prioUrgent} value={d.board.urgent} tone={C.red} danger={d.board.urgent > 0} />
          <Row C={C} label={t.prioHigh} value={d.board.high} tone={C.yellow} />
          <Row C={C} label={t.open} value={d.board.open} tone={C.blue} />
          <Row C={C} label={t.inProgress} value={d.board.progress} tone={C.yellow} />
          <Row C={C} label={t.completed} value={d.board.done} tone={C.green} />
        </Widget>

        <Widget C={C} icon="training" title={t.training} onView={() => navigate('/training')}>
          <Row C={C} label={t.videos} value={d.videos} tone={C.indigo} />
          <Row C={C} label={t.chemicalUsage} value={`${d.chem.entries} logs`} tone={C.cyan} />
          <Row C={C} label={t.chemicalUsed} value={`${d.chem.total}`} tone={C.maroon} />
        </Widget>

        <Widget C={C} icon="fire" title={t.fireSafety} onView={() => navigate('/training', { state: { tab: 'fire' } })}>
          {d.fire.expired > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.rBg, color: C.red, border: `1px solid ${C.red}33`, borderLeft: `3px solid ${C.red}`, borderRadius: 10, padding: '9px 11px', fontSize: 13, fontWeight: 700 }}>
              <Icon name="warning" size={16} color={C.red} />
              {d.fire.expired} {t.fsReplaceNow}
            </div>
          )}
          <Row C={C} label={t.fsOk} value={d.fire.ok} tone={C.green} />
          <Row C={C} label={t.fsExpiring} value={d.fire.expiring} tone={C.yellow} />
          <Row C={C} label={t.fsExpired} value={d.fire.expired} tone={C.red} danger={d.fire.expired > 0} />
        </Widget>

        <Widget C={C} icon="vendors" title={t.vendors} onView={() => navigate('/vendors')}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: C.text }}>{d.vendors}</span>
            <span style={{ fontSize: 13, color: C.tl }}>{t.activeVendors}</span>
          </div>
        </Widget>

        {/* each row opens the task list filtered to that priority — the View
            link alone landed on an unfiltered list, which told you nothing */}
        <Widget C={C} icon="warning" title={t.taskPriority} onView={() => go('/tasks', 'all')}>
          <Row C={C} label={t.priorityHigh} value={d.task.priority.high} tone={C.red}
               onClick={() => navigate('/tasks', { state: { tab: 'all', priority: 'high', property: prop, member } })} />
          <Row C={C} label={t.priorityMedium} value={d.task.priority.medium} tone={C.yellow}
               onClick={() => navigate('/tasks', { state: { tab: 'all', priority: 'medium', property: prop, member } })} />
          <Row C={C} label={t.priorityLow} value={d.task.priority.low} tone={C.green}
               onClick={() => navigate('/tasks', { state: { tab: 'all', priority: 'low', property: prop, member } })} />
        </Widget>
      </div>
    </div>
  )
}

/* ---------------------------- EMPLOYEE ---------------------------- */
function EmployeeDashboard({ user }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [s, setS] = useState({})

  const load = useCallback(async () => {
    try {
      // fetch tasks + training data in parallel (faster, and a single failing
      // query can't stall or wipe out the rest)
      const settled = await Promise.allSettled([
        supabase.from('tasks').select('id, title, title_hi, status, priority, area, due_date, category, week_day, skip_sunday').eq('assigned_to', user.id),
        supabase.from('training_videos').select('id, deadline').eq('is_active', true).eq('department', user.department),
        supabase.from('training_assignments').select('video_id, deadline').eq('user_id', user.id),
        supabase.from('training_progress').select('video_key, completed').eq('user_id', user.id),
        supabase.from('work_board').select('id, title, title_hi, status, priority, category, due_date').eq('assigned_to', user.id),
      ])
      const [tasksR, deptVidsR, asgR, progR, fixR] = settled.map((r) => (r.status === 'fulfilled' ? r.value : { data: [] }))

      // Only work that is actually due today — the same rows My Tasks shows.
      // Counting everything here while the list hides the rest is how a tile
      // ends up disagreeing with the screen it opens.
      const rows = (tasksR.data || []).filter((r) => !notDueToday(r))
      const c = (fn) => rows.filter(fn).length
      const today0 = todayISO()
      // high-priority tasks assigned by admin that still need attention
      // (not yet completed) — surfaced at the top of the staff dashboard.
      // Overdue first, then by due date.
      const priorityTasks = rows
        .filter((r) => r.priority === 'high' && r.status !== TASK_STATUS.COMPLETED)
        .sort((a, b) => {
          const ao = isTaskOverdue(a, today0) ? 0 : 1
          const bo = isTaskOverdue(b, today0) ? 0 : 1
          if (ao !== bo) return ao - bo
          return (a.due_date || '9999').localeCompare(b.due_date || '9999')
        })

      // fix requests (task board) assigned to this member that are still open —
      // sorted by priority: urgent → high → normal → low
      const PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 }
      const allFixes = fixR.data || []
      const openFixes = allFixes.filter((r) => !['completed', 'approved'].includes(r.status))
      const fixRequests = [...openFixes].sort((a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9))
      // Bucketed the way the board buckets them, so a number here and the tab it
      // opens can never disagree. 'open' there covers open AND assigned — both
      // mean handed over and not started.
      const fc = (fn) => allFixes.filter(fn).length
      const fixes = {
        total: allFixes.length,
        open: fc((r) => ['open', 'assigned'].includes(r.status)),
        inProgress: fc((r) => r.status === 'in_progress'),
        waiting: fc((r) => r.status === 'approval_requested'),
        done: fc((r) => ['completed', 'approved'].includes(r.status)),
      }
      // repair requests past their due date count toward the overdue total
      const fixOverdue = openFixes.filter((r) => r.due_date && r.due_date < today0).length

      let vids = deptVidsR.data || []
      const dl = {}
      ;(asgR.data || []).forEach((a) => { dl[a.video_id] = a.deadline })
      const missing = Object.keys(dl).map(Number).filter((id) => !vids.some((v) => v.id === id))
      if (missing.length) {
        const { data: extra } = await supabase.from('training_videos').select('id, deadline').eq('is_active', true).in('id', missing)
        vids = [...vids, ...(extra || [])]
      }
      vids.forEach((v) => { dl[v.id] = dl[v.id] ?? v.deadline })
      const done = new Set((progR.data || []).filter((p) => p.completed).map((p) => String(p.video_key)))
      const today = todayISO()
      const trTotal = vids.length
      const trDone = vids.filter((v) => done.has(String(v.id))).length
      const training = {
        total: trTotal,
        completed: trDone,
        pending: trTotal - trDone,
        overdue: vids.filter((v) => !done.has(String(v.id)) && dl[v.id] && dl[v.id] < today).length,
      }

      setS({
        total: rows.length,
        pending: c((r) => r.status === TASK_STATUS.PENDING),
        inProgress: c((r) => r.status === TASK_STATUS.IN_PROGRESS),
        waiting: c((r) => r.status === TASK_STATUS.COMPLETION_REQUESTED),
        done: c((r) => r.status === TASK_STATUS.COMPLETED),
        overdue: c((r) => isTaskOverdue(r, today)),
        dailyLate: c((r) => r.category === 'daily' && isTaskOverdue(r, today)),
        fixOverdue,
        fixes,
        priorityTasks,
        fixRequests,
        training,
      })
    } catch {
      // don't leave the dashboard stuck on the loader if a query fails
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])
  if (loading) return <Loader label={t.loading} />

  return (
    <div>
      <SectionTitle>{t.welcome}, {personName(user, lang)}</SectionTitle>
      {/* Two blocks instead of seven loose tiles: everything about my tasks in
          one, and anything late in the other — so "what needs attention" is a
          single place to look. */}
      <StatBlock C={C} icon="tasks" tone={C.maroon} title={t.myTasks}
                 onView={() => navigate('/my-tasks', { state: { status: 'all' } })}>
        <StatCell C={C} icon="tasks" value={s.total} label={t.totalTasks} tone={C.maroon}
                  onClick={() => navigate('/my-tasks', { state: { status: 'all' } })} />
        <StatCell C={C} icon="clock" value={s.pending} label={t.pending} tone={C.yellow}
                  onClick={() => navigate('/my-tasks', { state: { status: TASK_STATUS.PENDING } })} />
        <StatCell C={C} icon="refresh" value={s.inProgress} label={t.inProgress} tone={C.blue}
                  onClick={() => navigate('/my-tasks', { state: { status: TASK_STATUS.IN_PROGRESS } })} />
        {/* nothing waits for approval any more; shown only if something still is */}
        {s.waiting > 0 && (
          <StatCell C={C} icon="inbox" value={s.waiting} label={t.completionRequested} tone={C.indigo}
                    onClick={() => navigate('/my-tasks', { state: { status: TASK_STATUS.COMPLETION_REQUESTED } })} />
        )}
        <StatCell C={C} icon="check" value={s.done} label={t.completed} tone={C.green}
                  onClick={() => navigate('/my-tasks', { state: { status: TASK_STATUS.COMPLETED } })} />
      </StatBlock>

      <StatBlock C={C} icon="warning" tone={C.red} title={t.overdue}
                 hint={s.overdue + s.fixOverdue === 0
                   ? (lang === 'hi' ? 'कुछ भी बाकी नहीं — शाबाश' : 'Nothing late — all clear')
                   : s.dailyLate > 0
                     // explain the cutoff, otherwise a task with no due date
                     // appearing here at 6 PM looks like a bug
                     ? t.dailyLateAfter.replace('{h}', dailyOverdueLabel())
                     : undefined}>
        <StatCell C={C} icon="calendar" strong value={s.overdue} label={t.tasks} tone={C.red}
                  onClick={() => navigate('/my-tasks', { state: { status: 'overdue' } })} />
        <StatCell C={C} icon="taskBoard" strong value={s.fixOverdue} label={t.taskBoard} tone={C.red}
                  onClick={() => navigate('/task-board', { state: { tab: 'overdue' } })} />
      </StatBlock>

      {/* The same shape as the My Tasks block, and shown on the same terms —
          including at zero. My Tasks reads four zeros for somebody with nothing
          on; this one going missing instead would leave them unable to tell "no
          repair work" from "the app did not look". */}
      <StatBlock C={C} icon="taskBoard" tone={C.maroon} title={t.taskBoard}
                 onView={() => navigate('/task-board', { state: { tab: 'all' } })}>
        <StatCell C={C} icon="taskBoard" value={s.fixes?.total || 0} label={t.total} tone={C.maroon}
                  onClick={() => navigate('/task-board', { state: { tab: 'all' } })} />
        <StatCell C={C} icon="clock" value={s.fixes?.open || 0} label={t.open} tone={C.yellow}
                  onClick={() => navigate('/task-board', { state: { tab: 'open' } })} />
        <StatCell C={C} icon="refresh" value={s.fixes?.inProgress || 0} label={t.inProgress} tone={C.blue}
                  onClick={() => navigate('/task-board', { state: { tab: 'in_progress' } })} />
        {s.fixes?.waiting > 0 && (
          <StatCell C={C} icon="inbox" value={s.fixes?.waiting || 0} label={t.reviewQueue} tone={C.indigo}
                    onClick={() => navigate('/task-board', { state: { tab: 'review' } })} />
        )}
        <StatCell C={C} icon="check" value={s.fixes?.done || 0} label={t.completed} tone={C.green}
                  onClick={() => navigate('/task-board', { state: { tab: 'completed' } })} />
      </StatBlock>

      {/* Priority tasks assigned by admin — high priority & still open */}
      {s.priorityTasks && s.priorityTasks.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
            <Icon name="warning" size={18} color={TR_ORANGE} />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{t.priorityTasks}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: TR_ORANGE, background: tint(TR_ORANGE, 0.12), padding: '2px 8px', borderRadius: 999 }}>{s.priorityTasks.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {s.priorityTasks.map((task) => {
              const od = isTaskOverdue(task, todayISO())
              return (
                <Card
                  key={task.id}
                  onClick={() => navigate('/my-tasks', { state: { status: 'all' } })}
                  style={{ cursor: 'pointer', borderLeft: `4px solid ${TR_ORANGE}`, padding: 14 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
                          {lang === 'hi' && task.title_hi ? task.title_hi : task.title}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: TR_ORANGE, background: tint(TR_ORANGE, 0.12), padding: '2px 8px', borderRadius: 999 }}>{t.priorityHigh}</span>
                        {task.category && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: (FREQUENCY_MAP[taskFrequency(task)] || {}).tint || C.maroonSoft, color: (FREQUENCY_MAP[taskFrequency(task)] || {}).ink || C.maroon }}>
                            {frequencyLabel(taskFrequency(task), lang)}
                          </span>
                        )}
                      </div>
                      {task.area && (
                        <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="pin" size={12} /> {task.area}
                        </div>
                      )}
                      {task.due_date && (
                        <div style={{ fontSize: 12, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: od ? TR_ORANGE : C.faint, fontWeight: od ? 700 : 500 }}>
                          <Icon name={od ? 'warning' : 'clock'} size={12} color={od ? TR_ORANGE : C.faint} />
                          {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(task.due_date)}
                        </div>
                      )}
                    </div>
                    <Icon name="chevronRight" size={16} color={C.faint} />
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Fix requests assigned by admin — urgent / high / normal / low */}
      {s.fixRequests && s.fixRequests.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
            <Icon name="taskBoard" size={18} color={C.maroon} />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{t.fixRequests}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.maroon, background: C.maroonSoft, padding: '2px 8px', borderRadius: 999 }}>{s.fixRequests.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {s.fixRequests.map((fix) => {
              const pTone = C[FIX_PRIO_TONE[fix.priority] || 'blue']
              return (
                <Card
                  key={fix.id}
                  onClick={() => navigate('/task-board')}
                  style={{ cursor: 'pointer', borderLeft: `4px solid ${pTone}`, padding: 14 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lang === 'hi' && fix.title_hi ? fix.title_hi : fix.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.tl, marginTop: 4 }}>{t[FIX_STATUS_LABEL[fix.status]] || fix.status}</div>
                    </div>
                    {/* priority badge pinned to the right, next to the chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {isFlaggedPriority(fix.priority) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: pTone, background: tint(pTone, 0.12), padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                          {t[FIX_PRIO_LABEL[fix.priority]] || fix.priority}
                        </span>
                      )}
                      <Icon name="chevronRight" size={16} color={C.faint} />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Training progress — completed (green) / pending (yellow) / overdue (orange) */}
      {s.training && s.training.total > 0 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', margin: '4px 0 12px' }}>{t.training}</div>
          <div style={kpiGrid}>
            <TrainTile C={C} icon="check" tone={TR_GREEN} value={s.training.completed} label={t.completed} onClick={() => navigate('/training', { state: { status: 'completed' } })} />
            <TrainTile C={C} icon="clock" tone={TR_YELLOW} value={s.training.pending} label={lang === 'hi' ? 'बाकी' : 'Pending'} onClick={() => navigate('/training', { state: { status: 'pending' } })} />
            <TrainTile C={C} icon="warning" tone={TR_ORANGE} value={s.training.overdue} label={lang === 'hi' ? 'समय पार' : 'Overdue'} onClick={() => navigate('/training', { state: { status: 'overdue' } })} />
          </div>
        </>
      )}
    </div>
  )
}

/* --------------------------- primitives --------------------------- */
// training stat tones: completed = green, pending = yellow, overdue = orange
const TR_GREEN = '#15803D'
const TR_YELLOW = '#CA8A04'
const TR_ORANGE = '#EA580C'

// fix-request (task board) priority → color key + label key (matches TaskBoard)
const FIX_PRIO_TONE = { low: 'tl', normal: 'blue', high: 'yellow', urgent: 'red' }
const FIX_PRIO_LABEL = { low: 'prioLow', normal: 'prioNormal', high: 'prioHigh', urgent: 'prioUrgent' }
// fix-request status → existing translation key
const FIX_STATUS_LABEL = { assigned: 'pending', in_progress: 'inProgress', approval_requested: 'reviewQueue', open: 'pending' }

const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }
const widgetGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }

function MineChip({ C, label, value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999,
        background: C.card, border: `1px solid ${C.maroon}33`, color: C.text, fontSize: 13, fontWeight: 700,
      }}
    >
      {label}
      <span style={{ background: C.maroon, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <Icon name="chevronRight" size={14} color={C.faint} />
    </button>
  )
}

function TrainTile({ C, icon, tone, value, label, onClick }) {
  return (
    <Card onClick={onClick} style={{ cursor: 'pointer', padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: tint(tone, 0.12), display: 'grid', placeItems: 'center' }}>
          <Icon name={icon} size={22} color={tone} />
        </div>
        <Icon name="chevronRight" size={16} color={C.faint} />
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: tone, lineHeight: 1.15, marginTop: 14, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value ?? 0}</div>
      <div style={{ fontSize: 13, color: C.tl, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </Card>
  )
}

function Widget({ C, icon, title, onView, children }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: C.maroonSoft, color: C.maroon, display: 'grid', placeItems: 'center' }}>
            <Icon name={icon} size={18} color={C.maroon} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
        </div>
        <button onClick={onView} style={{ background: 'transparent', color: C.maroon, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          View <Icon name="chevronRight" size={15} color={C.maroon} />
        </button>
      </div>
      <div style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>{children}</div>
    </Card>
  )
}

// A clickable row needs to look clickable: a bare label and number reads as
// static text, so people go for the widget's "View" link instead and land on an
// unfiltered list. The chevron and the hover tint say it is a link.
function Row({ C, label, value, tone, danger, onClick }) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.background = C.cardAlt } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.background = 'transparent' } : undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        cursor: interactive ? 'pointer' : undefined,
        margin: interactive ? '0 -8px' : undefined,
        padding: interactive ? '4px 8px' : undefined,
        borderRadius: interactive ? 8 : undefined,
        transition: 'background .12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: danger ? C.red : C.tl, fontWeight: danger ? 700 : 400 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, flexShrink: 0 }} />
        {label}
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: danger ? C.red : C.text }}>{value ?? 0}</span>
        {interactive && <Icon name="chevronRight" size={14} color={C.faint} />}
      </span>
    </div>
  )
}

// A titled block holding several related numbers, so the dashboard reads as
// "here are my tasks" / "here is what's late" rather than a wall of tiles.
function StatBlock({ C, icon, tone, title, hint, onView, children }) {
  // toArray drops the conditional cells that render as false, so the column
  // count and the dividers are both taken from what is actually shown.
  const cells = Children.toArray(children)
  return (
    <Card style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, background: tint(tone, 0.12), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={17} color={tone} />
        </span>
        <span style={{ fontSize: 15.5, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{title}</span>
        {onView && (
          <button
            type="button"
            onClick={onView}
            style={{ marginLeft: 'auto', background: 'transparent', color: C.tl, display: 'inline-flex', alignItems: 'center', padding: 2 }}
          >
            <Icon name="chevronRight" size={16} color={C.faint} />
          </button>
        )}
      </div>
      {hint ? (
        <div style={{ fontSize: 13, color: C.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="check" size={15} color={C.green} /> {hint}
        </div>
      ) : (
        // One row, always. auto-fit dropped the fifth cell onto a line of its
        // own where it read as a separate figure rather than the last of five.
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
          {cells.map((cell, i) => cloneElement(cell, { divider: i > 0 }))}
        </div>
      )}
    </Card>
  )
}

// One number inside a StatBlock: icon chip, figure, label, and a short rule in
// the cell's colour. Zero values go grey — chip included — so the eye lands on
// whatever actually has work in it.
//
// `strong` paints the figure itself in the tone and drops the rule. Overdue uses
// it: there the number being alarming is the whole message, and it should not
// look like the neutral counts above it.
//
// `divider` is set by StatBlock, not by the caller — only it knows which cell
// is first.
function StatCell({ C, icon, value, label, tone, onClick, strong, divider }) {
  const dim = !value && !strong
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid', justifyItems: 'center', gap: 5, padding: '2px 4px',
        background: 'transparent', border: 'none',
        borderLeft: divider ? `1px solid ${C.border}` : undefined,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: dim ? C.cardAlt : tint(tone, 0.12),
        display: 'grid', placeItems: 'center',
      }}>
        <Icon name={icon} size={16} color={dim ? C.faint : tone} />
      </span>
      {/* tabular figures: without them a row of 157 / 127 / 12 / 18 has its
          digits at four different widths and never lines up */}
      <span style={{
        fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color: dim ? C.faint : (strong ? tone : C.text),
      }}>
        {value ?? 0}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: C.tl, textAlign: 'center', lineHeight: 1.25 }}>
        {label}
      </span>
      {!strong && (
        <span style={{ width: 22, height: 3, borderRadius: 999, background: dim ? C.border : tone }} />
      )}
    </button>
  )
}
