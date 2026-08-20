import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

import { supabase } from '../../lib/supabase'
import { todayISO, fmtDate } from '../../lib/time'
import { statusColors } from '../../constants/status'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  MEASURED_ROLES, roleTag, expectedOccurrences, isAdminRole, canSeeAllProperties, scopedDepartment, DEPARTMENTS,
  PROPERTY_MAP, propName, PROPERTIES, DEPARTMENT_MAP, deptName, personName, TASK_STATUS,
  FREQUENCY_MAP, frequencyLabel, taskFrequency,
} from '../../constants/org'
import { Card, Loader, EmptyState, Button, SectionTitle, inputStyle, filterStyle, FilterField } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { pct, avgOf, sumBy, rateTone } from './analyticsUtils'
import { Headline, MetricGuide } from './AnalyticsParts'
import MissedWork from './MissedWork'

// Missed work's own colour, matching the overdue accent the dashboard and the
// task board already use for the same idea.
const TR_ORANGE = '#EA580C'

// Below this many scores, an average rating says more about who happened to be
// rated than about the work. Three ratings move a whole point when a fourth
// arrives, and a number that unstable should not be printed as a fact.
const MIN_RATINGS = 5

// What makes a job that job, to a completion record. The roster also keys on
// area and time_block; task_completions carries neither, so two jobs differing
// only in those merge here. Losing that distinction costs far less than losing
// the history of every row that has ever been rewritten.
const jobKey = (r) => [r.property, r.department, r.category, (r.title || '').trim()].join('|')

// --- period windows ----------------------------------------------------------
// All windows are half-open [from, to) in local time, converted to ISO for the
// query. "Week" starts Monday, matching how the weekly task reset works.
function periodRange(key, custom) {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  let from
  let to = startOfDay(now)
  to.setDate(to.getDate() + 1) // through the end of today

  // Chosen dates. Parsed by parts, not by passing the string to Date(), which
  // reads 'YYYY-MM-DD' as UTC and can shift the day. `to` is exclusive, so one
  // day means from that date to the next — which is how a single day is picked.
  if (key === 'custom') {
    const parse = (iso) => {
      const [y, m, d] = String(iso || '').split('-').map(Number)
      return y ? new Date(y, m - 1, d) : null
    }
    const a = parse(custom?.from)
    const b = parse(custom?.to) || a
    if (a && b) {
      const end = new Date(b)
      end.setDate(end.getDate() + 1)
      return { from: a.toISOString(), to: end.toISOString() }
    }
    // incomplete dates: fall back to today rather than querying all of time
    from = startOfDay(now)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  if (key === 'week') {
    from = startOfDay(now)
    from.setDate(from.getDate() - ((now.getDay() + 6) % 7)) // back to Monday
  } else if (key === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (key === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    to = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (key === 'today') {
    from = startOfDay(now)
  } else { // 'quarter' — the last 90 days
    from = startOfDay(now)
    from.setDate(from.getDate() - 89)
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

// The same-length window immediately before the selected one, so every figure
// can be read as "better or worse than last time".
function previousRange({ from, to }) {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return { from: new Date(a - (b - a)).toISOString(), to: from }
}

// The super admin's own PICK is exact: choosing Exotica shows people whose
// property IS Exotica — not the all-property admins who merely oversee it.
function inViewScope(row, scope) {
  if (scope.property && row.property !== scope.property) return false
  if (scope.department && row.department !== scope.department) return false
  return true
}

export default function Analytics() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()

  // Not "is this a phone" but "do six labels fit on one line" — they do from
  // about 560px up.
  const roomy = useMediaQuery('(min-width: 560px)')
  const [period, setPeriod] = useState('week')
  // custom range; `to` blank means a single day
  const [customFrom, setCustomFrom] = useState(todayISO())
  const [customTo, setCustomTo] = useState('')
  // three levels of narrowing, each one feeding the next
  const [propFilter, setPropFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [personFilter, setPersonFilter] = useState('all')   // 'all' | user id
  const [missedFor, setMissedFor] = useState(null)          // staff row, for the Not-done list
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [data, setData] = useState(null)
  const [taskList, setTaskList] = useState(null)  // 'overdue' | 'open' — drill-down modal

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    const { from, to } = periodRange(period, { from: customFrom, to: customTo })
    const args = { p_from: from, p_to: to }
    const prev = previousRange({ from, to })
    const prevArgs = { p_from: prev.from, p_to: prev.to }
    try {
      // every figure is aggregated server-side; these responses are one row per
      // person (or per property+department), never one row per task
      const [users, byAssignee, repairs, open, prevAssignee, prevRepairs, byDay, personDay, allTasks, comps] = await Promise.all([
        supabase.from('users')
          .select('id, name, name_hi, role, property, department, designation')
          .eq('is_active', true).order('name'),
        supabase.rpc('analytics_by_assignee', args),
        supabase.rpc('analytics_repairs', args),
        supabase.rpc('analytics_open'),
        supabase.rpc('analytics_by_assignee', prevArgs),
        supabase.rpc('analytics_repairs', prevArgs),
        supabase.rpc('analytics_by_day', args),
        supabase.rpc('analytics_person_day', args),
        // recurring work and the completions it earned — everything else on this
        // page comes from completions alone, which cannot show an absence
        supabase.from('tasks')
          .select('id, title, title_hi, category, week_day, week_days, skip_sunday, month_week, property, department, assigned_to, assignee_name')
          .limit(2000),
        supabase.from('task_completions')
          // the job's own identity, so a completion is still findable after the
          // row that produced it has been deleted and rewritten
          .select('task_id, task_date, title, property, department, category')
          .gte('task_date', from.slice(0, 10))
          .lte('task_date', to.slice(0, 10))
          .limit(20000),
      ])
      const firstError = [users, byAssignee, repairs, open].find((r) => r.error)
      if (firstError) throw firstError.error
      setData({
        users: users.data || [],
        byAssignee: byAssignee.data || [],
        repairs: repairs.data || [],
        open: open.data || [],
        prevAssignee: prevAssignee.data || [],
        prevRepairs: prevRepairs.data || [],
        // day-by-day is additive: an install that has not run the new function
        // yet still gets every other figure instead of an error page
        byDay: byDay.error ? [] : (byDay.data || []),
        personDay: personDay.error ? [] : (personDay.data || []),
        allTasks: allTasks.error ? [] : (allTasks.data || []),
        comps: comps.error ? [] : (comps.data || []),
        range: { from, to },
      })
    } catch (e) {
      // these are created by SUPABASE-MIGRATION-TASK-HISTORY.sql
      const msg = e?.message || ''
      setErr(/task_completions|analytics_by_assignee|analytics_open|does not exist|schema cache/i.test(msg)
        ? 'missing-table'
        : (msg || 'Could not load analytics'))
    } finally {
      setLoading(false)
    }
  }, [period, customFrom, customTo])

  useEffect(() => { load() }, [load])

  // ---- what the property + department pickers narrow to ----------------------
  const viewScope = useMemo(() => ({
    property: propFilter === 'all' ? null : propFilter,
    department: deptFilter === 'all' ? null : deptFilter,
  }), [propFilter, deptFilter])

  // One row per day: how much of each kind of work was closed, and how much of
  // it on time. Filtered here rather than in the query, so changing venue or
  // department costs no round trip.
  const dayRows = useMemo(() => {
    const src = (data?.byDay || []).filter((r) => inViewScope(r, viewScope))
    const by = new Map()
    src.forEach((r) => {
      if (!by.has(r.day)) {
        by.set(r.day, { day: r.day, total: 0, onTime: 0, daily: 0, alternate: 0, weekly: 0, monthly: 0 })
      }
      const d = by.get(r.day)
      const bucket = DAY_COLS.includes(r.category) ? r.category : 'daily'
      d[bucket] += r.done
      d.total += r.done
      d.onTime += r.on_time
    })
    return [...by.values()].sort((a, b) => b.day.localeCompare(a.day))
  }, [data, viewScope])

  // Owed vs credited, per recurring job. Anything with a shortfall is a miss —
  // and a job with zero completions and a real expectation is the loudest kind.
  const missedRows = useMemo(() => {
    if (!data?.range) return []
    const from = new Date(data.range.from)
    const to = new Date(data.range.to)
    // `to` is exclusive in periodRange; step back a day so the last day is not
    // counted as owed when it has not happened yet
    to.setDate(to.getDate() - 1)

    // Keyed on the job, not the row. A task row that was deleted and rewritten
    // — three hundred of them were, cleaning up duplicates — takes its id with
    // it, and every completion pointing at that id would read as work that
    // never happened.
    const doneBy = new Map()
    ;(data.comps || []).forEach((c) => {
      const k = jobKey(c)
      if (!doneBy.has(k)) doneBy.set(k, new Set())
      doneBy.get(k).add(c.task_date)
    })

    return (data.allTasks || [])
      .filter((task) => inViewScope(task, viewScope)
        && (personFilter === 'all' || task.assigned_to === personFilter))
      .map((task) => {
        const expected = expectedOccurrences(task, from, to)
        // distinct DATES, not rows: a task completed twice on one day was still
        // only owed once that day
        const done = Math.min(doneBy.get(jobKey(task))?.size || 0, expected)
        return { task, expected, done, missed: expected - done }
      })
      .filter((r) => r.expected > 0)
      .sort((a, b) => b.missed - a.missed
        || (a.task.title || '').localeCompare(b.task.title || ''))
  }, [data, viewScope, personFilter])

  // the tab counts JOBS that fell short, not every recurring row
  const missedCount = useMemo(
    () => missedRows.filter((r) => r.missed > 0).length,
    [missedRows]
  )

  // Staff and admins inside the current property/department selection. Admins
  // are measured because they are given tasks and close repairs; the super admin
  // is not, since this is their own report to read (see MEASURED_ROLES).
  // Everyone the property and department pickers leave. This is what the person
  // picker offers — narrowing it by itself would leave the picker unable to
  // offer anybody but the person already chosen.
  const staffInScope = useMemo(() => (
    data ? data.users.filter((u) => MEASURED_ROLES.includes(u.role) && inViewScope(u, viewScope)) : []
  ), [data, viewScope])

  // ...and what the rest of the page counts, once a person is chosen.
  const scopedStaff = useMemo(() => (
    personFilter === 'all' ? staffInScope : staffInScope.filter((u) => u.id === personFilter)
  ), [staffInScope, personFilter])

  const personOptions = useMemo(
    () => [...staffInScope].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [staffInScope]
  )

  // A person the property/department pickers have just filtered out cannot stay
  // selected, or the page would show one person's name above nobody's numbers.
  useEffect(() => {
    if (personFilter !== 'all' && staffInScope.length && !staffInScope.some((u) => u.id === personFilter)) {
      setPersonFilter('all')
    }
  }, [staffInScope, personFilter])

  // The department picker.
  //
  // It used to list only departments that had someone in them, which had it
  // backwards both ways: a live department with nobody posted to it yet (Admin,
  // and Kitchen until recently) vanished from the filter, while retired codes
  // that people still carry (HR, Technology) appeared as if they were current.
  //
  // So: the live departments are always offered, in their own order — and any
  // other code that real people still hold is appended after them, because
  // hiding it would make those people unreachable through this filter.
  const deptOptions = useMemo(() => {
    const live = DEPARTMENTS.map((d) => ({ code: d.code, name: deptName(d.code, lang), retired: false }))
    if (!data) return live
    const liveCodes = new Set(DEPARTMENTS.map((d) => d.code))
    const stragglers = [...new Set(
      data.users
        .filter((u) => MEASURED_ROLES.includes(u.role) && inViewScope(u, { property: viewScope.property, department: null }))
        .map((u) => u.department)
        .filter((c) => c && !liveCodes.has(c))
    )].map((code) => ({ code, name: deptName(code, lang), retired: true }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...live, ...stragglers]
  }, [data, viewScope.property, lang])

  // What each person was owed and did not deliver. Straight off missedRows,
  // which already worked it out job by job — grouped here by whoever holds the
  // row, so the staff table can carry it.
  const missedByPerson = useMemo(() => {
    const by = new Map()
    missedRows.forEach((r) => {
      if (r.missed <= 0) return
      const id = r.task.assigned_to
      if (!id) return                       // nobody's to miss
      if (!by.has(id)) by.set(id, { total: 0, rows: [] })
      const p = by.get(id)
      p.total += r.missed
      p.rows.push(r)
    })
    // worst first inside a person, so the modal opens on what matters
    by.forEach((p) => p.rows.sort((a, b) => b.missed - a.missed))
    return by
  }, [missedRows])

  // ---- per-staff roll-up -----------------------------------------------------
  const staffRows = useMemo(() => {
    if (!data) return []
    return scopedStaff
      .map((s) => {
        const c = data.byAssignee.find((r) => r.assigned_to === s.id)
        const open = data.open.filter((o) => o.assigned_to === s.id)
        const completed = Number(c?.completed || 0)
        const miss = missedByPerson.get(s.id)
        return {
          ...s,
          completed,
          onTimeRate: pct(Number(c?.on_time || 0), completed),
          openNow: sumBy(open, 'open_n'),
          overdueNow: sumBy(open, 'overdue_n'),
          missed: miss?.total || 0,
          missedRows: miss?.rows || [],
        }
      })
      .sort((a, b) => b.completed - a.completed)
  }, [data, scopedStaff, missedByPerson])

  // ---- the head filter narrows the whole page, KPIs included -----------------
  // Heads offered in the picker. With no department chosen: everyone who covers
  // the selected property (all-property heads qualify, since they oversee it).
  // With a department chosen: ONLY the head OF that department — matched on the
  // admin's own `department`, so the Finance head never appears under Housekeeping.
  // a department that the newly chosen property does not have falls back to All
  useEffect(() => {
    if (deptFilter !== 'all' && deptOptions.length && !deptOptions.some((d) => d.code === deptFilter)) {
      setDeptFilter('all')
    }
  }, [deptOptions, deptFilter])

  // ---- summary: whole organisation, or just the selected head's scope --------
  const totals = useMemo(() => {
    if (!data) return null
    // the same slice, one period earlier — drives every "vs previous" delta
    const prevOf = (ids) => {
      const rows = data.prevAssignee.filter((c) => ids.has(c.assigned_to))
      const done = sumBy(rows, 'completed')
      return {
        completed: done,
        onTimeRate: pct(sumBy(rows, 'on_time'), done),
      }
    }

    // roll up whatever the property/department filters left
    const staffIds = new Set(scopedStaff.map((s) => s.id))
    const comps = data.byAssignee.filter((c) => staffIds.has(c.assigned_to))
    // Scoped by the task's own venue and department, and by the chosen person —
    // the same predicate TaskListModal queries with, so the tile and the list it
    // opens can never disagree. It used to skip the person filter, which left
    // "Overdue" showing the whole venue beside one person's numbers.
    const openRows = data.open
      .filter((o) => inViewScope(o, viewScope))
      .filter((o) => personFilter === 'all' || o.assigned_to === personFilter)
    const repairRows = data.repairs.filter((r) => inViewScope(r, viewScope))

    const completed = sumBy(comps, 'completed')
    const prevRepairRows = data.prevRepairs.filter((r) => inViewScope(r, viewScope))

    // How much of the work that was DUE actually happened. missedRows already
    // works this out job by job for the "Not done" tab — expected occurrences
    // against distinct days completed — so it only needs adding up. This is the
    // question the page is opened with; on-time rate answers a later one.
    const due = missedRows.reduce((n, r) => n + r.expected, 0)
    const kept = missedRows.reduce((n, r) => n + r.done, 0)

    // Ratings are averaged only once there are enough to average. Three scores
    // across forty repairs is a number that moves a whole point when one more
    // arrives, and reads as fact.
    const ratingN = sumBy(repairRows, 'rating_n')

    return {
      prev: { ...prevOf(staffIds), repairs: sumBy(prevRepairRows, 'done') },
      completed,
      due,
      kept,
      doneRate: pct(kept, due),
      onTimeRate: pct(sumBy(comps, 'on_time'), completed),
      repairs: sumBy(repairRows, 'done'),
      ratingN,
      avgRating: ratingN >= MIN_RATINGS ? avgOf(sumBy(repairRows, 'rating_sum'), ratingN) : null,
      overdueNow: sumBy(openRows, 'overdue_n'),
      openNow: sumBy(openRows, 'open_n'),
    }
  }, [data, scopedStaff, viewScope, missedRows])

  // Every period needs an entry here. The Headline reads this straight into a
  // sentence, so a missing key is not a missing label — it is undefined, and
  // .toLowerCase() on it takes the page down. The fallback makes the next one
  // somebody forgets a wrong word instead of a white screen.
  const periodLabel = {
    today: lang === 'hi' ? 'आज' : 'Today',
    week: lang === 'hi' ? 'इस हफ़्ते' : 'This week',
    month: lang === 'hi' ? 'इस महीने' : 'This month',
    last_month: lang === 'hi' ? 'पिछले महीने' : 'Last month',
    quarter: lang === 'hi' ? 'पिछले 90 दिनों में' : 'Last 90 days',
    custom: customTo && customTo !== customFrom
      ? `${fmtDate(customFrom)} – ${fmtDate(customTo)}`
      : fmtDate(customFrom),
  }[period] || (lang === 'hi' ? 'इस अवधि में' : 'this period')

  const scopeLabel = viewScope.property
    ? propName(viewScope.property, lang)
    : (lang === 'hi' ? 'सभी प्रॉपर्टी' : 'all properties')

  // `short` is used below 560px. Each one drops only the word the bar already
  // supplies: under a control that is plainly about time, "This" and "Days" say
  // nothing that Week and 90d do not.
  const periods = [
    { key: 'today', label: lang === 'hi' ? 'आज' : 'Today', short: lang === 'hi' ? 'आज' : 'Today' },
    { key: 'week', label: lang === 'hi' ? 'यह हफ़्ता' : 'This Week', short: lang === 'hi' ? 'हफ़्ता' : 'Week' },
    { key: 'month', label: lang === 'hi' ? 'यह महीना' : 'This Month', short: lang === 'hi' ? 'महीना' : 'Month' },
    { key: 'last_month', label: lang === 'hi' ? 'पिछला महीना' : 'Last Month', short: lang === 'hi' ? 'पिछला' : 'Last mo' },
    { key: 'quarter', label: lang === 'hi' ? '90 दिन' : 'Last 90 Days', short: lang === 'hi' ? '90 दिन' : '90d' },
    { key: 'custom', label: lang === 'hi' ? 'तारीख़ चुनें' : 'Pick dates', short: lang === 'hi' ? 'तारीख़' : 'Dates' },
  ]

  return (
    <div>
      {/* the subtitle makes it obvious the figures below are scoped to one head */}
      <SectionTitle
        subtitle={lang === 'hi' ? 'स्टाफ़ का प्रदर्शन' : 'Staff performance'}
      >
        {lang === 'hi' ? 'विश्लेषण' : 'Analytics'}
      </SectionTitle>

      {/* One setting with six values, drawn as one object rather than six pills
          stretched edge to edge. Made to fit rather than made to scroll: at full
          size these come to about 590px against a 336px phone, and the three that
          fell off the edge had a hidden scrollbar to announce them. overflow stays
          as a backstop for a longer translation, with the bar hidden. */}
      <div className="no-bar" style={{
        display: 'flex', gap: 2, marginBottom: 16, padding: 3,
        background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {periods.map((p) => {
          const on = period === p.key
          return (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              aria-pressed={on}
              style={{
                flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap',
                padding: roomy ? '8px 16px' : '7px 5px', borderRadius: 9,
                fontSize: roomy ? 13.5 : 11.5, fontWeight: on ? 700 : 600,
                background: on ? C.card : 'transparent',
                color: on ? C.maroon : C.tl,
                border: 'none',
                boxShadow: on ? C.shadow : 'none',
                cursor: 'pointer',
              }}
            >
              {roomy ? p.label : p.short}
            </button>
          )
        })}
      </div>

      {/* Chosen dates. Leaving "to" empty means that single day — which is the
          usual question once the day-by-day table exists. */}
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: '1 1 150px', minWidth: 140 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tl, marginBottom: 4 }}>
              {lang === 'hi' ? 'तारीख़ / से' : 'Date / from'}
            </div>
            <input
              type="date"
              max={todayISO()}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ ...inputStyle(C), padding: '9px 11px', fontSize: 13 }}
            />
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 140 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tl, marginBottom: 4 }}>
              {lang === 'hi' ? 'तक (वैकल्पिक)' : 'To (optional)'}
            </div>
            <input
              type="date"
              min={customFrom}
              max={todayISO()}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ ...inputStyle(C), padding: '9px 11px', fontSize: 13 }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, flex: '1 1 190px', paddingBottom: 9, lineHeight: 1.5 }}>
            {lang === 'hi'
              ? 'सिर्फ़ एक दिन देखना हो तो "तक" खाली छोड़ दें।'
              : 'Leave "to" empty to look at a single day.'}
          </div>
        </div>
      )}

      {/* property -> department -> person. Each picker narrows the one to its
          right, and all three narrow everything below: the summary, the staff
          table, the day breakdown, the person grid and the missed work. */}
      {!loading && !err && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          }}>
            <FilterField label={t.properties}>
              <select
                style={filterStyle(C)}
                value={propFilter}
                onChange={(e) => { setPropFilter(e.target.value); setExpanded(null) }}
              >
                <option value="all">{t.all}</option>
                {PROPERTIES.map((pr) => <option key={pr.code} value={pr.code}>{propName(pr.code, lang)}</option>)}
              </select>
            </FilterField>
            <FilterField label={t.department}>
              <select
                style={filterStyle(C)}
                value={deptFilter}
                onChange={(e) => { setDeptFilter(e.target.value); setExpanded(null) }}
              >
                <option value="all">{t.all}</option>
                {deptOptions.map((d) => (
                  <option key={d.code} value={d.code}>{d.name}{d.retired ? ' · ⊖' : ''}</option>
                ))}
              </select>
            </FilterField>
            {/* One person, and the whole page reads as theirs. Only the people
                the two pickers above have left, so it can never offer somebody
                whose numbers would come back empty. */}
            <FilterField label={lang === 'hi' ? 'स्टाफ़' : 'Staff'}>
              <select
                style={filterStyle(C)}
                value={personFilter}
                onChange={(e) => { setPersonFilter(e.target.value); setExpanded(null) }}
              >
                <option value="all">{t.all} ({personOptions.length})</option>
                {personOptions.map((u) => (
                  <option key={u.id} value={u.id}>{personName(u, lang)}</option>
                ))}
              </select>
            </FilterField>
          </div>

        </div>
      )}

      {err === 'missing-table' ? (
        <Card style={{ borderLeft: `4px solid ${C.yellow}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>
            <Icon name="warning" size={17} color={C.yellow} /> Analytics is not switched on yet
          </div>
          <div style={{ fontSize: 13.5, color: C.tl, lineHeight: 1.6 }}>
            Run <b>SUPABASE-MIGRATION-TASK-HISTORY.sql</b> in the Supabase SQL Editor.
            It creates the <code>task_completions</code> table that records every approved
            task. The nightly reset erases completion data from the task itself, so history
            has to be captured separately — figures build up from the day you run it.
          </div>
        </Card>
      ) : err ? (
        <Card style={{ borderLeft: `4px solid ${C.red}` }}>
          <div style={{ color: C.red, fontSize: 13.5 }}>{err}</div>
        </Card>
      ) : loading ? (
        <Loader label={t.loading} />
      ) : (
        <>
          <Headline
            C={C} lang={lang} totals={totals}
            periodLabel={periodLabel} scopeLabel={scopeLabel}
            onOverdue={totals.overdueNow ? () => setTaskList('overdue') : undefined}
            onOpen={totals.openNow ? () => setTaskList('open') : undefined}
          />

          {/* The shape of the period, drawn. A table of counts per day makes you
              read fourteen numbers to see it. */}
          <Trend C={C} lang={lang} rows={dayRows} />

          {/* Two questions, each with its name on it. This was four tabs the
              reader had to open to find out which one held the answer. */}
          <Section C={C} title={lang === 'hi' ? 'कौन पीछे है' : 'Who is behind'}
                   count={staffRows.length}>
            {staffRows.length === 0 ? <EmptyState icon={null} title={t.noData} /> : (
              <div>
                <StaffHeader C={C} lang={lang} />
                <div style={{ display: 'grid', gap: 8 }}>
                  {staffRows.map((sr) => (
                    <StaffRow key={sr.id} C={C} lang={lang} s={sr} onOpenMissed={setMissedFor} />
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section C={C} title={lang === 'hi' ? 'कौन-सा काम छूट रहा है' : 'What keeps slipping'}
                   count={missedCount}>
            {missedCount === 0
              ? <EmptyState icon={null} title={lang === 'hi' ? 'सब कुछ समय पर हुआ' : 'Nothing was missed'}
                  hint={lang === 'hi'
                    ? 'इस अवधि में हर दोहराने वाला काम अपनी बार पूरा हुआ।'
                    : 'Every recurring job was completed as often as it was due in this period.'} />
              : <MissedWork lang={lang} t={t} rows={missedRows} periodLabel={periodLabel} />}
          </Section>

          {missedFor && (
            <PersonMissedModal C={C} lang={lang} t={t} person={missedFor}
                               onClose={() => setMissedFor(null)} />
          )}

          {taskList && (
            <TaskListModal
              C={C} lang={lang} t={t} mode={taskList}
              scope={viewScope}
              person={personFilter}
              people={scopedStaff}
              onClose={() => setTaskList(null)}
            />
          )}

          <MetricGuide C={C} lang={lang} />

         
        </>
      )}
    </div>
  )
}

// The roster is written by frequency, so the record of it reads the same way.
const DAY_COLS = ['daily', 'alternate', 'weekly', 'monthly']

// A named part of the page. The heading is the question the block answers —
// four tabs called "Staff", "By day", "Who, which day" and "Not done" made the
// reader open each one to find out which held the answer.
function Section({ C, title, count, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {count != null && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: C.tl,
            background: C.cardAlt, border: `1px solid ${C.border}`,
            borderRadius: 999, padding: '1px 9px',
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// Completions per day, drawn. Bars because the question is "which days were
// quiet", and a column of fourteen numbers answers that only after you have read
// all fourteen and held them in your head.
//
// THE AXIS STOPS AT THE 90th PERCENTILE. Scaled to the peak instead, this
// period put nine of fourteen bars under 12px and one at full height: 10 Aug has
// 70 completions against a median of 8. Everything quiet looked identical, which
// is exactly what the chart is for telling apart. A bar past the ceiling is drawn
// full height with a caret and its count, so the outlier is marked rather than
// allowed to set the scale.
const BAR_H = 84

function Trend({ C, lang, rows }) {
  const hi = lang === 'hi'
  if (!rows.length) return null
  const days = [...rows].sort((a, b) => a.day.localeCompare(b.day))
  const totals = days.map((d) => d.total).sort((a, b) => a - b)
  const at = (q) => totals[Math.min(totals.length - 1, Math.floor(totals.length * q))]
  // the ceiling: high enough that a normal busy day still reaches the top, low
  // enough that a freak day does not own the axis
  const cap = Math.max(1, at(0.9))
  const total = days.reduce((n, d) => n + d.total, 0)
  const busiest = Math.max(...days.map((d) => d.total))
  // Past a dozen bars the dates stop being readable, so every other one is
  // labelled — the shape is what is left, which is the point anyway.
  const step = days.length > 12 ? 2 : 1

  return (
    <Card style={{ padding: 16, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
          {hi ? 'हर दिन कितना दर्ज हुआ' : 'Recorded per day'}
        </span>
        <span style={{ fontSize: 12, color: C.faint }}>
          {hi
            ? `${days.length} दिन · कुल ${total} · सबसे ज़्यादा ${busiest}`
            : `${days.length} days · ${total} in all · busiest ${busiest}`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: BAR_H + 22 }}>
        {days.map((d) => {
          const over = d.total > cap
          const h = d.total === 0 ? 3
            : over ? BAR_H
            : Math.max(6, Math.round((d.total / cap) * BAR_H))
          const onTime = d.total ? Math.round((d.onTime / d.total) * 100) : 0
          return (
            <div key={d.day} style={{ flex: 1, minWidth: 0, display: 'flex',
                                      flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {/* the count, printed only where it adds something: the days that
                  clip the axis, and the quiet days worth noticing */}
              <span style={{
                fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                color: over ? C.text : 'transparent',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {d.total}
              </span>
              <div
                title={`${d.day} · ${d.total} ${hi ? 'दर्ज' : 'recorded'} · ${onTime}% ${hi ? 'समय पर' : 'on time'}`}
                style={{
                  width: '100%', height: h, borderRadius: 4,
                  background: d.total ? rateTone(onTime, C, d.total) : C.border,
                  // a clipped bar is squared off at the top and carries a caret,
                  // so it never reads as simply "the tallest"
                  borderTopLeftRadius: over ? 1 : 4,
                  borderTopRightRadius: over ? 1 : 4,
                  boxShadow: over ? `inset 0 3px 0 0 ${C.text}` : 'none',
                }}
              />
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
        {days.map((d, i) => (
          <span key={d.day} style={{
            flex: 1, minWidth: 0, textAlign: 'center', fontSize: 10,
            color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden',
          }}>
            {i % step === 0 ? `${d.day.slice(8)}/${d.day.slice(5, 7)}` : ''}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 12, lineHeight: 1.55 }}>
        {hi
          ? `पट्टी की लंबाई = उस दिन दर्ज हुआ काम, रंग = कितना समय पर। पैमाना ${cap} पर रुकता है; उससे ऊपर वाले दिन पर ऊपर एक लकीर और उसका आंकड़ा है।`
          : `Bar length is the work recorded that day, colour is how much of it was on time. The scale stops at ${cap}; a day above it is capped, ruled at the top and labelled.`}
      </div>
    </Card>
  )
}

// The columns, named once. Kept beside the row that fills them so the two
// cannot drift — a header that says "Open" above a column of Overdue is worse
// than no header.
export const STAFF_COLS = (hi) => [
  { key: 'completed', label: hi ? 'पूरे' : 'Done' },
  { key: 'onTimeRate', label: hi ? 'समय पर' : 'On time' },
  { key: 'openNow', label: hi ? 'बाकी' : 'Open' },
  { key: 'overdueNow', label: hi ? 'ओवरड्यू' : 'Overdue' },
  { key: 'missed', label: hi ? 'नहीं हुआ' : 'Not done' },
]
const STAFF_GRID = 'minmax(0, 1fr) repeat(5, 68px)'

export function StaffHeader({ C, lang }) {
  // Below 560px the rows carry their own captions, so this would be the same
  // words a second time — and it could not line up with them anyway.
  const roomy = useMediaQuery('(min-width: 560px)')
  if (!roomy) return null
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: STAFF_GRID, gap: 10,
      padding: '0 14px 8px', alignItems: 'end',
    }}>
      <span />
      {STAFF_COLS(lang === 'hi').map((c) => (
        <span key={c.key} style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: C.faint, textAlign: 'right',
        }}>
          {c.label}
        </span>
      ))}
    </div>
  )
}

function StaffRow({ C, lang, s, compact, onOpenMissed }) {
  const hi = lang === 'hi'
  const roomy = useMediaQuery('(min-width: 560px)')
  // Grey unless there is something to judge — a person with nothing recorded is
  // not a person scoring zero.
  const tone = rateTone(s.onTimeRate, C, s.completed)
  const figures = [
    { key: 'completed', label: hi ? 'पूरे' : 'Done', el: <Num C={C} value={s.completed} /> },
    { key: 'onTimeRate', label: hi ? 'समय पर' : 'On time',
      el: <Num C={C} value={s.completed ? `${s.onTimeRate}%` : '—'} tone={tone} muted={!s.completed} /> },
    { key: 'openNow', label: hi ? 'बाकी' : 'Open', el: <Num C={C} value={s.openNow} /> },
    { key: 'overdueNow', label: hi ? 'ओवरड्यू' : 'Overdue',
      el: <Num C={C} value={s.overdueNow} tone={s.overdueNow > 0 ? C.red : undefined} /> },
    { key: 'missed', label: hi ? 'नहीं हुआ' : 'Not done',
      el: <Num C={C} value={s.missed} tone={s.missed > 0 ? TR_ORANGE : undefined}
               onClick={s.missed > 0 && onOpenMissed ? () => onOpenMissed(s) : undefined} /> },
  ]

  const nameBlock = (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{personName(s, lang)}</span>
          {/* an admin doing fieldwork is now in this list; say so */}
          {roleTag(s.role, lang) && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.maroon, background: C.maroonSoft, borderRadius: 999, padding: '2px 7px' }}>
              {roleTag(s.role, lang)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
          {propName(s.property, lang)}
          {s.department ? ` · ${deptName(s.department, lang)}` : ''}
        </div>
      </div>
  )

  // "Avg" is gone with the tile it matched — it averaged the gap between tapping
  // Start and Complete, half of which are under a minute.
  const body = roomy ? (
    <div style={{ display: 'grid', gridTemplateColumns: STAFF_GRID, gap: 10, alignItems: 'center' }}>
      {nameBlock}
      {figures.map((f) => <Fragment key={f.key}>{f.el}</Fragment>)}
    </div>
  ) : (
    <div style={{ display: 'grid', gap: 10 }}>
      {nameBlock}
      {/* Each figure captioned in place. Five to a row still fits a 336px screen
          once the caption is 9.5px and the columns share the width evenly. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4 }}>
        {figures.map((f) => (
          <div key={f.key} style={{ display: 'grid', gap: 1, justifyItems: 'center' }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: '0.03em',
              textTransform: 'uppercase', color: C.faint, textAlign: 'center', lineHeight: 1.15,
            }}>
              {f.label}
            </span>
            {f.el}
          </div>
        ))}
      </div>
    </div>
  )
  return compact
    ? <div style={{ padding: '6px 2px' }}>{body}</div>
    : <Card style={{ padding: 14 }}>{body}</Card>
}

// One figure in the staff table. Right-aligned and tabular so the column reads
// as a column; grey at zero so the eye lands on the rows that have something.
// Underlined when it opens something, because a number that does nothing and a
// number that does look identical otherwise.
function Num({ C, value, tone, muted, onClick }) {
  const dim = muted || value === 0 || value === '0'
  const style = {
    textAlign: 'right', fontSize: 15, fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: dim ? C.faint : (tone || C.text),
  }
  if (!onClick) return <span style={style}>{value}</span>
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        ...style, background: 'transparent', border: 'none', padding: 0,
        cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
        textDecorationThickness: 1.5,
      }}
    >
      {value}
    </button>
  )
}

// What one person was owed and did not deliver. The rows are already computed —
// this only has to say them plainly: the job, how often it came round, and how
// much of it is outstanding.
function PersonMissedModal({ C, lang, t, person, onClose }) {
  const hi = lang === 'hi'
  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={560}
      title={`${personName(person, lang)} — ${hi ? 'नहीं हुआ' : 'Not done'} (${person.missed})`}
      footer={<Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>}
    >
      <div style={{ fontSize: 13, color: C.tl, lineHeight: 1.55, marginBottom: 12 }}>
        {hi
          ? 'हर काम कितनी बार आना था और कितनी बार दर्ज हुआ — फ़र्क़ ही "नहीं हुआ" है।'
          : 'How many times each job came due against how many were recorded. The difference is what is outstanding.'}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {person.missedRows.map(({ task, expected, done, missed }) => (
          <div key={task.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                {hi && task.title_hi ? task.title_hi : task.title}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                fontSize: 11.5, color: C.faint, marginTop: 4,
              }}>
                {/* The band gets its own colour. Buried in the grey run-on, the
                    one word that changes how you read the row looked like the
                    two that do not — and the list is sorted by count, so the
                    bands interleave with nothing to group them by eye. */}
                {(() => {
                  const fk = taskFrequency(task)
                  const f = FREQUENCY_MAP[fk] || {}
                  return (
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                      color: f.ink || C.tl, background: f.tint || C.cardAlt,
                      borderRadius: 999, padding: '2px 8px',
                    }}>
                      {frequencyLabel(fk, lang)}
                    </span>
                  )
                })()}
                <span>
                  {propName(task.property, lang)}
                  {task.department ? ` · ${deptName(task.department, lang)}` : ''}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: TR_ORANGE, fontVariantNumeric: 'tabular-nums' }}>
                {missed}
              </div>
              <div style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                {done}/{expected} {hi ? 'हुआ' : 'done'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// Drill-down behind the "Overdue now" / "Open now" tiles. Those two are live
// snapshots rather than period figures, so this fetches the actual rows on open
// instead of reusing the aggregates.
function TaskListModal({ C, lang, t, mode, scope, person, people, onClose }) {
  const hi = lang === 'hi'
  const overdue = mode === 'overdue'
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const today = todayISO()
    // By the task's venue and department, not by a list of people — see the note
    // on openRows in the parent. Querying a person list dropped whatever was
    // assigned to somebody that list leaves out, while the tile still counted it.
    let q = supabase
      .from('tasks')
      .select('id, title, title_hi, assigned_to, assignee_name, property, department, due_date, status, priority')
      .neq('status', TASK_STATUS.COMPLETED)
      .not('assigned_to', 'is', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(200)
    if (scope?.property) q = q.eq('property', scope.property)
    if (scope?.department) q = q.eq('department', scope.department)
    if (person && person !== 'all') q = q.eq('assigned_to', person)
    if (overdue) q = q.lt('due_date', today)
    q.then(({ data, error }) => { setErr(error?.message || ''); setRows(data || []) })
  }, [scope?.property, scope?.department, person, overdue])

  // resolve the assignee's Hindi name from the people list we already hold
  const nameOf = (r) => {
    const m = people.find((p) => p.id === r.assigned_to)
    return (m && personName(m, lang)) || r.assignee_name || '—'
  }
  const daysLate = (due) => Math.max(0, Math.round((Date.now() - new Date(due).getTime()) / 86400000))

  return (
    <Modal
      open onClose={onClose}
      title={overdue
        ? (hi ? 'अभी ओवरड्यू टास्क' : 'Overdue tasks')
        : (hi ? 'अभी बाकी टास्क' : 'Open tasks')}
      footer={<Button variant="ghost" onClick={onClose} full>{t.close}</Button>}
    >
      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {rows === null ? (
        <Loader label={t.loading} />
      ) : rows.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const sc = statusColors(r.status, C)
            return (
              <div
                key={r.id}
                style={{
                  border: `1px solid ${C.border}`, borderLeft: `3px solid ${overdue ? C.red : sc.color}`,
                  borderRadius: 10, padding: '9px 11px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                      {(hi && r.title_hi) || r.title}
                    </div>
                    <div style={{ fontSize: 12, color: C.tl, marginTop: 2 }}>
                      {nameOf(r)} · {propName(r.property, lang)}
                      {r.department ? ` · ${deptName(r.department, lang)}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {t[sc.key]}
                  </span>
                </div>
                {r.due_date && (
                  <div style={{ fontSize: 11.5, marginTop: 4, color: overdue ? C.red : C.faint, fontWeight: overdue ? 700 : 500 }}>
                    {overdue
                      ? `${hi ? 'ड्यू' : 'Due'} ${fmtDate(r.due_date)} · ${daysLate(r.due_date)} ${hi ? 'दिन देर' : 'days late'}`
                      : `${t.dueDate}: ${fmtDate(r.due_date)}`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
