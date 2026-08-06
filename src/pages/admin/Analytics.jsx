import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { todayISO, fmtDate } from '../../lib/time'
import { statusColors } from '../../constants/status'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  MEASURED_ROLES, roleTag, expectedOccurrences, isAdminRole, canSeeAllProperties, scopedDepartment, DEPARTMENTS,
  PROPERTY_MAP, propName, PROPERTIES, DEPARTMENT_MAP, deptName, personName, TASK_STATUS,
  FREQUENCY_MAP, frequencyLabel, dayName,
} from '../../constants/org'
import { Card, Loader, EmptyState, Button, SectionTitle, Tabs, ProgressBar, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { pct, fmtDur, avgOf, sumBy, rateTone } from './analyticsUtils'
import { Headline, StatusChip, MetricGuide } from './AnalyticsParts'
import MissedWork from './MissedWork'

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

  const [period, setPeriod] = useState('week')
  // custom range; `to` blank means a single day
  const [customFrom, setCustomFrom] = useState(todayISO())
  const [customTo, setCustomTo] = useState('')
  // three levels of narrowing, each one feeding the next
  const [propFilter, setPropFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [tab, setTab] = useState('staff')
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
          .select('id, title, title_hi, category, week_day, week_days, skip_sunday, month_week, property, department, assignee_name')
          .limit(2000),
        supabase.from('task_completions')
          .select('task_id, task_date')
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

  // The same completions, crossed the other way: one row per person, one column
  // per day. Days ascend left to right because a week is read that way; people
  // are ordered by how much they closed, so the grid opens on who is carrying it.
  // Owed vs credited, per recurring job. Anything with a shortfall is a miss —
  // and a job with zero completions and a real expectation is the loudest kind.
  const missedRows = useMemo(() => {
    if (!data?.range) return []
    const from = new Date(data.range.from)
    const to = new Date(data.range.to)
    // `to` is exclusive in periodRange; step back a day so the last day is not
    // counted as owed when it has not happened yet
    to.setDate(to.getDate() - 1)

    const doneBy = new Map()
    ;(data.comps || []).forEach((c) => {
      if (!doneBy.has(c.task_id)) doneBy.set(c.task_id, new Set())
      doneBy.get(c.task_id).add(c.task_date)
    })

    return (data.allTasks || [])
      .filter((task) => inViewScope(task, viewScope))
      .map((task) => {
        const expected = expectedOccurrences(task, from, to)
        // distinct DATES, not rows: a task completed twice on one day was still
        // only owed once that day
        const done = Math.min(doneBy.get(task.id)?.size || 0, expected)
        return { task, expected, done, missed: expected - done }
      })
      .filter((r) => r.expected > 0)
      .sort((a, b) => b.missed - a.missed
        || (a.task.title || '').localeCompare(b.task.title || ''))
  }, [data, viewScope])

  // the tab counts JOBS that fell short, not every recurring row
  const missedCount = useMemo(
    () => missedRows.filter((r) => r.missed > 0).length,
    [missedRows]
  )

  const personGrid = useMemo(() => {
    // The rows come straight from completions, which know an id but not a role —
    // so the same MEASURED_ROLES rule has to be applied here by looking the
    // person up. Without it the super admin would be absent from the Staff tab
    // and present in this grid, and the two would disagree in public.
    const measured = new Set(
      (data?.users || []).filter((u) => MEASURED_ROLES.includes(u.role)).map((u) => u.id)
    )
    const src = (data?.personDay || [])
      .filter((r) => measured.has(r.assigned_to) && inViewScope(r, viewScope))
    const days = [...new Set(src.map((r) => r.day))].sort()
    const by = new Map()
    src.forEach((r) => {
      if (!by.has(r.assigned_to)) {
        by.set(r.assigned_to, { id: r.assigned_to, name: r.assignee_name || r.assigned_to, total: 0, cells: {} })
      }
      const p = by.get(r.assigned_to)
      p.cells[r.day] = (p.cells[r.day] || 0) + r.done
      p.total += r.done
    })
    const people = [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    const perDay = Object.fromEntries(days.map((d) => [d, people.reduce((n, pp) => n + (pp.cells[d] || 0), 0)]))
    return { days, people, perDay, total: people.reduce((n, pp) => n + pp.total, 0) }
  }, [data, viewScope])

  // Staff and admins inside the current property/department selection. Admins
  // are measured because they are given tasks and close repairs; the super admin
  // is not, since this is their own report to read (see MEASURED_ROLES).
  const scopedStaff = useMemo(() => (
    data ? data.users.filter((u) => MEASURED_ROLES.includes(u.role) && inViewScope(u, viewScope)) : []
  ), [data, viewScope])

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

  // ---- per-staff roll-up -----------------------------------------------------
  const staffRows = useMemo(() => {
    if (!data) return []
    return scopedStaff
      .map((s) => {
        const c = data.byAssignee.find((r) => r.assigned_to === s.id)
        const open = data.open.filter((o) => o.assigned_to === s.id)
        const completed = Number(c?.completed || 0)
        return {
          ...s,
          completed,
          onTimeRate: pct(Number(c?.on_time || 0), completed),
          avgWork: avgOf(Number(c?.work_sum || 0), Number(c?.work_n || 0)),
          openNow: sumBy(open, 'open_n'),
          overdueNow: sumBy(open, 'overdue_n'),
        }
      })
      .sort((a, b) => b.completed - a.completed)
  }, [data, scopedStaff])

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
        avgWork: avgOf(sumBy(rows, 'work_sum'), sumBy(rows, 'work_n')),
      }
    }

    // roll up whatever the property/department filters left
    const staffIds = new Set(scopedStaff.map((s) => s.id))
    const comps = data.byAssignee.filter((c) => staffIds.has(c.assigned_to))
    const openRows = data.open.filter((o) => inViewScope(o, viewScope))
    const repairRows = data.repairs.filter((r) => inViewScope(r, viewScope))

    const completed = sumBy(comps, 'completed')
    const prevRepairRows = data.prevRepairs.filter((r) => inViewScope(r, viewScope))
    return {
      prev: { ...prevOf(staffIds), repairs: sumBy(prevRepairRows, 'done') },
      completed,
      onTimeRate: pct(sumBy(comps, 'on_time'), completed),
      avgWork: avgOf(sumBy(comps, 'work_sum'), sumBy(comps, 'work_n')),
      repairs: sumBy(repairRows, 'done'),
      avgRating: avgOf(sumBy(repairRows, 'rating_sum'), sumBy(repairRows, 'rating_n')),
      overdueNow: sumBy(openRows, 'overdue_n'),
      openNow: sumBy(openRows, 'open_n'),
    }
  }, [data, scopedStaff, viewScope])

  const periodLabel = {
    week: lang === 'hi' ? 'इस हफ़्ते' : 'This week',
    month: lang === 'hi' ? 'इस महीने' : 'This month',
    last_month: lang === 'hi' ? 'पिछले महीने' : 'Last month',
    quarter: lang === 'hi' ? 'पिछले 90 दिनों में' : 'Last 90 days',
    custom: customTo && customTo !== customFrom
      ? `${fmtDate(customFrom)} – ${fmtDate(customTo)}`
      : fmtDate(customFrom),
  }[period]

  const scopeLabel = viewScope.property
    ? propName(viewScope.property, lang)
    : (lang === 'hi' ? 'सभी प्रॉपर्टी' : 'all properties')

  const periods = [
    { key: 'week', label: lang === 'hi' ? 'यह हफ़्ता' : 'This Week' },
    { key: 'month', label: lang === 'hi' ? 'यह महीना' : 'This Month' },
    { key: 'last_month', label: lang === 'hi' ? 'पिछला महीना' : 'Last Month' },
    { key: 'quarter', label: lang === 'hi' ? '90 दिन' : 'Last 90 Days' },
    { key: 'custom', label: lang === 'hi' ? 'तारीख़ चुनें' : 'Pick dates' },
  ]

  return (
    <div>
      {/* the subtitle makes it obvious the figures below are scoped to one head */}
      <SectionTitle
        subtitle={lang === 'hi' ? 'स्टाफ़ का प्रदर्शन' : 'Staff performance'}
      >
        {lang === 'hi' ? 'विश्लेषण' : 'Analytics'}
      </SectionTitle>

      {/* period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              flex: '1 1 120px', whiteSpace: 'nowrap', padding: '9px 14px', borderRadius: 999,
              fontSize: 13.5, fontWeight: 600,
              background: period === p.key ? C.maroon : C.card,
              color: period === p.key ? '#fff' : C.tl,
              border: `1px solid ${period === p.key ? C.maroon : C.border}`,
            }}
          >
            {p.label}
          </button>
        ))}
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

      {/* property -> department -> head. Each picker narrows the one below it,
          and all three narrow the summary, the head list and the staff list. */}
      {!loading && !err && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
              <Icon name="pin" size={16} color={C.tl} />
              <select
                style={inputStyle(C)}
                value={propFilter}
                onChange={(e) => { setPropFilter(e.target.value); setExpanded(null) }}
                aria-label={t.properties}
              >
                <option value="all">{t.properties} — {t.all}</option>
                {PROPERTIES.map((pr) => <option key={pr.code} value={pr.code}>{propName(pr.code, lang)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
              <Icon name="tasks" size={16} color={C.tl} />
              <select
                style={inputStyle(C)}
                value={deptFilter}
                onChange={(e) => { setDeptFilter(e.target.value); setExpanded(null) }}
                aria-label={t.department}
              >
                <option value="all">{t.department} — {t.all}</option>
                {deptOptions.map((d) => (
                  <option key={d.code} value={d.code}>{d.name}{d.retired ? ' · ⊖' : ''}</option>
                ))}
              </select>
            </div>
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
          <Headline C={C} lang={lang} totals={totals}
                    periodLabel={periodLabel} scopeLabel={scopeLabel}
                    onOverdueClick={totals.overdueNow ? () => setTaskList('overdue') : undefined} />

          {/* organisation summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Kpi C={C} icon="check" tone={C.green} value={totals.completed}
                 label={lang === 'hi' ? 'टास्क पूरे' : 'Tasks completed'}
                 delta={deltaPct(totals.completed, totals.prev.completed)} upIsGood />
            <Kpi C={C} icon="clock" tone={rateTone(totals.onTimeRate, C)} value={`${totals.onTimeRate}%`}
                 label={lang === 'hi' ? 'समय पर' : 'On time'}
                 delta={deltaPoints(totals.onTimeRate, totals.prev.onTimeRate)} upIsGood suffix="pp" />
            <Kpi C={C} icon="refresh" tone={C.blue} value={fmtDur(totals.avgWork)}
                 label={lang === 'hi' ? 'औसत समय' : 'Avg time per task'}
                 delta={deltaPct(totals.avgWork, totals.prev.avgWork)} />
            <Kpi C={C} icon="taskBoard" tone={C.cyan} value={totals.repairs}
                 label={lang === 'hi' ? 'मरम्मत पूरी' : 'Repairs done'}
                 delta={deltaPct(totals.repairs, totals.prev.repairs)} upIsGood />
            <Kpi C={C} icon="star" tone={C.yellow}
                 value={totals.avgRating ? totals.avgRating.toFixed(1) : '—'}
                 label={lang === 'hi' ? 'औसत रेटिंग' : 'Avg work rating'} />
            <Kpi C={C} icon="warning" tone={C.red} value={totals.overdueNow}
                 label={lang === 'hi' ? 'अभी ओवरड्यू' : 'Overdue now'}
                 onClick={totals.overdueNow ? () => setTaskList('overdue') : undefined} />
            <Kpi C={C} icon="tasks" tone={C.maroon} value={totals.openNow}
                 label={lang === 'hi' ? 'अभी बाकी' : 'Open now'}
                 onClick={totals.openNow ? () => setTaskList('open') : undefined} />
          </div>

          <Tabs
            tabs={[
              { key: 'staff', label: `${lang === 'hi' ? 'स्टाफ़' : 'Staff'} (${staffRows.length})` },
              { key: 'byDay', label: `${lang === 'hi' ? 'दिन-वार' : 'By day'} (${dayRows.length})` },
              { key: 'byPerson', label: `${lang === 'hi' ? 'कौन, किस दिन' : 'Who, which day'} (${personGrid.people.length})` },
              { key: 'missed', label: `${lang === 'hi' ? 'नहीं हुआ' : 'Not done'} (${missedCount})` },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'missed' && (
            missedCount === 0
              ? <EmptyState icon={null} title={lang === 'hi' ? 'सब कुछ समय पर हुआ' : 'Nothing was missed'}
                  hint={lang === 'hi'
                    ? 'इस अवधि में हर दोहराने वाला काम अपनी बार पूरा हुआ।'
                    : 'Every recurring job was completed as often as it was due in this period.'} />
              : <MissedWork lang={lang} t={t} rows={missedRows} periodLabel={periodLabel} />
          )}

          {tab === 'byPerson' && (
            personGrid.people.length === 0
              ? <EmptyState icon={null} title={t.noData} hint={lang === 'hi'
                  ? 'जिस दिन कोई काम पूरा करेगा, वह यहाँ अपने आप आ जाएगा।'
                  : 'A person appears here as soon as they complete work.'} />
              : <PersonDayGrid C={C} lang={lang} grid={personGrid} />
          )}

          {tab === 'byDay' && (
            dayRows.length === 0
              ? <EmptyState icon={null} title={t.noData} hint={lang === 'hi'
                  ? 'जिस दिन कोई काम पूरा होगा, वह यहाँ अपने आप आ जाएगा।'
                  : 'A day appears here as soon as work is completed on it.'} />
              : <DayTable C={C} lang={lang} t={t} rows={dayRows} />
          )}

          {tab === 'staff' && (
            staffRows.length === 0 ? <EmptyState icon={null} title={t.noData} /> : (
              <div style={{ display: 'grid', gap: 10 }}>
                {staffRows.map((s) => <StaffRow key={s.id} C={C} lang={lang} s={s} />)}
              </div>
            )
          )}

          {taskList && (
            <TaskListModal
              C={C} lang={lang} t={t} mode={taskList}
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

// percentage change; null when there is nothing to compare against
// The roster is written by frequency, so the record of it reads the same way.
const DAY_COLS = ['daily', 'alternate', 'weekly', 'monthly']

// Sequential, one hue (the brand maroon), light -> dark. Magnitude, not identity,
// so it is a ramp and not a set of categorical hues. Each step names the text
// colour that clears 4.5:1 on it — verified, not guessed.
const HEAT = [
  { min: 0,  fill: 'transparent', ink: '#94A3B8', label: '0' },
  { min: 1,  fill: '#FBEDF0',     ink: '#0F172A', label: '1-2' },
  { min: 3,  fill: '#F0C3CE',     ink: '#0F172A', label: '3-5' },
  { min: 6,  fill: '#DB8598',     ink: '#0F172A', label: '6-9' },
  { min: 10, fill: '#B84A63',     ink: '#FFFFFF', label: '10-14' },
  { min: 15, fill: '#8A2438',     ink: '#FFFFFF', label: '15+' },
]
const heatFor = (n) => [...HEAT].reverse().find((h) => n >= h.min) || HEAT[0]

// Who closed how much, on which day.
//
// The count is printed in every cell, so the colour is a second reading of the
// same number rather than the only one — which is what keeps it usable in
// greyscale, in print, and for a colour-blind reader.
function PersonDayGrid({ C, lang, grid }) {
  const hi = lang === 'hi'
  const { days, people, perDay, total } = grid
  const NAME_W = 150
  const CELL_W = 46
  const gridCols = `${NAME_W}px repeat(${days.length}, ${CELL_W}px) 64px`
  const head = {
    padding: '8px 4px', fontSize: 9.5, fontWeight: 700, color: C.faint,
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center',
  }
  const cell = { padding: '9px 4px', fontSize: 13, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }
  const pin = (bg) => ({ position: 'sticky', left: 0, zIndex: 1, background: bg })
  const dayNum = (iso) => String(iso).slice(8, 10)
  const dayMon = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1)
    .toLocaleString(hi ? 'hi-IN' : 'en-GB', { month: 'short' })

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {/* Legend — the grid carries two series of meaning (a number and a shade),
          so what the shades mean has to be stated. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.tl, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {hi ? 'उस दिन पूरे हुए काम' : 'Tasks closed that day'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {HEAT.slice(1).map((h) => (
            <span key={h.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: h.fill, border: `1px solid ${C.border}` }} />
              <span style={{ fontSize: 11, color: C.tl, marginRight: 6 }}>{h.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: NAME_W + days.length * CELL_W + 64 }}>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, background: C.card, borderBottom: `1px solid ${C.borderStrong}` }}>
            <span style={{ ...head, ...pin(C.card), textAlign: 'left', paddingLeft: 14 }}>{hi ? 'नाम' : 'Person'}</span>
            {days.map((d, i) => (
              <span key={d} style={head} title={d}>
                {dayNum(d)}
                {/* the month is named once, and again whenever it turns over */}
                {(i === 0 || d.slice(5, 7) !== days[i - 1].slice(5, 7)) && (
                  <span style={{ display: 'block', fontSize: 8, color: C.faint, letterSpacing: 0 }}>{dayMon(d)}</span>
                )}
              </span>
            ))}
            <span style={{ ...head, color: C.maroon }}>{hi ? 'कुल' : 'Total'}</span>
          </div>

          {people.map((p, i) => {
            const rowBg = i % 2 ? C.cardAlt : C.card
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: `1px solid ${C.border}`, background: rowBg }}>
                <span style={{ ...cell, ...pin(rowBg), textAlign: 'left', paddingLeft: 14, fontWeight: 600, color: C.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                {days.map((d) => {
                  const n = p.cells[d] || 0
                  const h = heatFor(n)
                  return (
                    <span
                      key={d}
                      title={`${p.name} · ${d} · ${n} ${hi ? 'काम' : 'tasks'}`}
                      style={{ ...cell, background: h.fill, color: h.ink, fontWeight: n ? 700 : 400 }}
                    >
                      {n || '·'}
                    </span>
                  )
                })}
                <span style={{ ...cell, fontWeight: 800, color: C.maroon, borderLeft: `1px solid ${C.border}` }}>{p.total}</span>
              </div>
            )
          })}

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: `1px solid ${C.borderStrong}`, background: C.cardAlt }}>
            <span style={{ ...cell, ...pin(C.cardAlt), textAlign: 'left', paddingLeft: 14, fontSize: 10, fontWeight: 700, color: C.tl, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {hi ? 'सब मिलाकर' : 'All'}
            </span>
            {days.map((d) => (
              <span key={d} style={{ ...cell, fontWeight: 700, color: perDay[d] ? C.text : C.faint }}>{perDay[d] || '·'}</span>
            ))}
            <span style={{ ...cell, fontWeight: 800, fontSize: 15, color: C.maroon, borderLeft: `1px solid ${C.border}` }}>{total}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function DayTable({ C, lang, t, rows }) {
  const hi = lang === 'hi'
  const GRID = '128px repeat(4, minmax(0,1fr)) 74px 84px'
  const head = {
    padding: '10px 9px', fontSize: 9.5, fontWeight: 700, color: C.faint,
    textTransform: 'uppercase', letterSpacing: '0.11em', textAlign: 'center',
  }
  const cell = { padding: '12px 9px', fontSize: 14, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }
  const total = rows.reduce((a, r) => ({
    total: a.total + r.total, onTime: a.onTime + r.onTime,
    daily: a.daily + r.daily, alternate: a.alternate + r.alternate,
    weekly: a.weekly + r.weekly, monthly: a.monthly + r.monthly,
  }), { total: 0, onTime: 0, daily: 0, alternate: 0, weekly: 0, monthly: 0 })
  const pct = (r) => (r.total ? Math.round((r.onTime / r.total) * 100) : null)

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, background: C.card }}>
            <span style={{ ...head, textAlign: 'left', position: 'sticky', left: 0, background: C.card, zIndex: 1 }}>
              {hi ? 'दिन' : 'Day'}
            </span>
            {DAY_COLS.map((k) => (
              <span key={k} style={{ ...head, color: C.tl, boxShadow: `inset 0 -2px 0 ${FREQUENCY_MAP[k].ink}` }}>
                {frequencyLabel(k, lang)}
              </span>
            ))}
            <span style={{ ...head, boxShadow: `inset 0 -2px 0 ${C.maroon}` }}>{hi ? 'कुल' : 'Total'}</span>
            <span style={head}>{hi ? 'समय पर' : 'On time'}</span>
          </div>

          {rows.map((r, i) => {
            const p = pct(r)
            return (
              <div key={r.day} style={{ display: 'grid', gridTemplateColumns: GRID, borderTop: `1px solid ${C.border}`, background: i % 2 ? C.cardAlt : C.card }}>
                <span style={{ ...cell, textAlign: 'left', position: 'sticky', left: 0, background: i % 2 ? C.cardAlt : C.card, zIndex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: C.text, fontSize: 13.5 }}>{fmtDate(r.day)}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.faint }}>{dayName(isoDow(r.day), lang)}</span>
                </span>
                {DAY_COLS.map((k) => (
                  <span key={k} style={{ ...cell, color: r[k] ? C.text : C.faint, fontWeight: r[k] ? 600 : 400 }}>
                    {r[k] || 0}
                  </span>
                ))}
                <span style={{ ...cell, fontWeight: 700, color: C.maroon, borderLeft: `1px solid ${C.border}` }}>{r.total}</span>
                <span style={{ ...cell, fontWeight: 600, color: p === null ? C.faint : (p >= 90 ? C.green : p >= 70 ? C.yellow : C.red) }}>
                  {p === null ? '—' : `${p}%`}
                </span>
              </div>
            )
          })}

          <div style={{ display: 'grid', gridTemplateColumns: GRID, borderTop: `1px solid ${C.borderStrong}`, background: C.cardAlt }}>
            <span style={{ ...cell, textAlign: 'left', position: 'sticky', left: 0, background: C.cardAlt, zIndex: 1, fontSize: 10, fontWeight: 700, color: C.tl, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {hi ? `${rows.length} दिन` : `${rows.length} days`}
            </span>
            {DAY_COLS.map((k) => <span key={k} style={{ ...cell, fontWeight: 700, color: C.text }}>{total[k]}</span>)}
            <span style={{ ...cell, fontWeight: 800, fontSize: 16, color: C.maroon, borderLeft: `1px solid ${C.border}` }}>{total.total}</span>
            <span style={{ ...cell, fontWeight: 700, color: C.tl }}>
              {total.total ? `${Math.round((total.onTime / total.total) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ISO weekday from a plain 'YYYY-MM-DD' — parsed by parts, because passing the
// bare string to Date() is read as UTC and can land on the day before.
function isoDow(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const js = new Date(y, (m || 1) - 1, d || 1).getDay()
  return js === 0 ? 7 : js
}

function deltaPct(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}
// straight difference, for figures that are already percentages
function deltaPoints(cur, prev) {
  if (cur == null || prev == null) return null
  return Math.round(cur - prev)
}

// Stat tile: label, value, and an optional delta against the previous period.
// `upIsGood` decides the colour — a rise in "avg time" is bad, a rise in
// "completed" is good — and the arrow always shows the actual direction.
function Kpi({ C, icon, value, label, tone, delta, upIsGood = false, suffix = '%', onClick }) {
  const show = delta != null && delta !== 0
  const good = delta > 0 ? upIsGood : !upIsGood
  return (
    <Card onClick={onClick} style={{ padding: 14, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={tone} />
        <span style={{ fontSize: 19, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{value}</span>
        {onClick && <Icon name="chevronRight" size={14} color={C.faint} style={{ marginLeft: 'auto' }} />}
      </div>
      <div style={{ fontSize: 12, color: C.tl, fontWeight: 600, marginTop: 4 }}>{label}</div>
      {show && (
        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: good ? C.green : C.red }}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}{suffix}
          <span style={{ color: C.faint, fontWeight: 600 }}> vs prev</span>
        </div>
      )}
    </Card>
  )
}

function Stat({ C, label, value, tone }) {
  return (
    <div style={{ minWidth: 78 }}>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: tone || C.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: C.tl, fontWeight: 600, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function StaffRow({ C, lang, s, compact }) {
  const hi = lang === 'hi'
  const tone = rateTone(s.onTimeRate, C)
  const body = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 160px' }}>
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
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Stat C={C} label={hi ? 'पूरे' : 'Done'} value={s.completed} />
        <Stat C={C} label={hi ? 'समय पर' : 'On time'} value={`${s.onTimeRate}%`} tone={tone} />
        <Stat C={C} label={hi ? 'औसत' : 'Avg'} value={fmtDur(s.avgWork)} />
        <Stat C={C} label={hi ? 'बाकी' : 'Open'} value={s.openNow} />
        <Stat C={C} label={hi ? 'ओवरड्यू' : 'Overdue'} value={s.overdueNow}
              tone={s.overdueNow > 0 ? C.red : undefined} />
      </div>
    </div>
  )
  return compact
    ? <div style={{ padding: '6px 2px' }}>{body}</div>
    : <Card style={{ padding: 14 }}>{body}</Card>
}

// Drill-down behind the "Overdue now" / "Open now" tiles. Those two are live
// snapshots rather than period figures, so this fetches the actual rows on open
// instead of reusing the aggregates.
function TaskListModal({ C, lang, t, mode, people, onClose }) {
  const hi = lang === 'hi'
  const overdue = mode === 'overdue'
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const ids = people.map((p) => p.id)
    if (!ids.length) { setRows([]); return }
    const today = todayISO()
    let q = supabase
      .from('tasks')
      .select('id, title, title_hi, assigned_to, assignee_name, property, department, due_date, status, priority')
      .neq('status', TASK_STATUS.COMPLETED)
      .in('assigned_to', ids)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(200)
    if (overdue) q = q.lt('due_date', today)
    q.then(({ data, error }) => { setErr(error?.message || ''); setRows(data || []) })
  }, [people, overdue])

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
