import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, DEPARTMENT_MAP, deptName, personName, isDueToday, taskFrequency,
  frequencyLabel, FREQUENCY_MAP,
} from '../../constants/org'
import { Card, ProgressBar, Loader, EmptyState } from '../../components/common/UI'
import Icon from '../../components/common/Icon'

// Where the day stands, person by person.
//
// The task list answers "what is outstanding"; it cannot answer "is Ramu nearly
// done, or has he not started". That is a different shape of question — a count
// per person against their own total — and it belongs on the same screen,
// because the answer usually decides what the admin does next.
//
// The denominator is TODAY'S work, not the whole roster. A gardener with 33 jobs
// in the roster has 8 today; scoring him out of 33 would say he is failing every
// single day.
// `onOpenTask` is what replaced the card list below this table: a job is still
// one tap away, just from inside the person it belongs to.
export default function StaffProgress({ user, members, propFilter, deptFilter, memberFilter, catFilter = 'all', prioFilter = 'all', onOpenTask }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    let q = supabase
      .from('tasks')
      .select('id, title, title_hi, category, week_day, week_days, skip_sunday, month_week, time_block, status, assigned_to, assignee_name, property, department')
      .limit(2000)
    if (propFilter !== 'all') q = q.eq('property', propFilter)
    if (deptFilter !== 'all') q = q.eq('department', deptFilter)
    // every filter above this table narrows it — otherwise the header says
    // "12 / 40" while the filters claim you are looking at one department
    if (catFilter !== 'all') q = q.eq('category', catFilter)
    if (prioFilter !== 'all') q = q.eq('priority', prioFilter)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }, [propFilter, deptFilter, catFilter, prioFilter])

  useEffect(() => { load() }, [load])

  // refresh with the rest of the page — a progress bar that lags is worse than none
  useEffect(() => {
    const id = setInterval(load, 30000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [load])

  const { people, totals } = useMemo(() => {
    const due = rows.filter((r) => isDueToday(r))
    const by = new Map()
    const sum = { total: 0, done: 0, doing: 0, todo: 0 }

    due.forEach((r) => {
      const key = r.assigned_to || '_none'
      if (!by.has(key)) {
        by.set(key, {
          id: key,
          name: r.assigned_to
            ? (personName(members.find((m) => m.id === r.assigned_to) || {}, lang) || r.assignee_name || r.assigned_to)
            : t.unassigned,
          department: r.department,
          unassigned: !r.assigned_to,
          total: 0, done: 0, doing: 0, todo: 0, tasks: [],
        })
      }
      const p = by.get(key)
      p.tasks.push(r)
      p.total += 1; sum.total += 1
      if (r.status === TASK_STATUS.COMPLETED) { p.done += 1; sum.done += 1 }
      else if (r.status === TASK_STATUS.IN_PROGRESS) { p.doing += 1; sum.doing += 1 }
      else { p.todo += 1; sum.todo += 1 }
    })

    const list = [...by.values()].sort((a, b) => {
      if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1   // nobody-yet last
      const ap = a.total ? a.done / a.total : 0
      const bp = b.total ? b.done / b.total : 0
      if (ap !== bp) return ap - bp                                     // furthest behind first
      return a.name.localeCompare(b.name)
    })
    return { people: memberFilter === 'all' ? list : list.filter((p) => p.id === memberFilter), totals: sum }
  }, [rows, members, lang, t, memberFilter])

  // This table IS the page now — silently rendering nothing when a filter
  // matches no work would look like a broken screen, not an empty one.
  if (loading) return <Loader label={t.loading} />
  if (totals.total === 0) {
    return (
      <Card style={{ marginBottom: 14 }}>
        <EmptyState icon={null} title={t.noData} />
      </Card>
    )
  }

  const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0)
  const donePct = pct(totals.done, totals.total)

  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
      {/* the day in one line, before any names */}
      <div style={{ padding: '16px 16px 15px', background: C.cardAlt, borderBottom: `2px solid ${C.borderStrong}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 11 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.maroon }}>
            {t.todayProgress}
          </span>
          <span style={{ fontSize: 14, color: C.tl, fontVariantNumeric: 'tabular-nums' }}>
            <b style={{ color: donePct === 100 ? C.green : C.maroon, fontSize: 20 }}>{totals.done}</b>
            {' / '}{totals.total}{'  ·  '}{donePct}%
          </span>
        </div>
        <ProgressBar value={donePct} tone={donePct === 100 ? C.green : C.maroon} height={9} />
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 12 }}>
          <Tally size="lg" state="done"  label={t.completed}  n={totals.done} />
          <Tally size="lg" state="doing" label={t.inProgress} n={totals.doing} />
          <Tally size="lg" state="todo"  label={t.pending}    n={totals.todo} />
        </div>
      </div>

      {/* one row per person — tap to see exactly which jobs */}
      {people.map((p) => {
        const open = openId === p.id
        const dp = pct(p.done, p.total)
        const tone = dp === 100 ? C.green : (p.unassigned ? C.tl : C.maroon)
        return (
          <div key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(open ? null : p.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : p.id) } }}
              aria-expanded={open}
              style={{
                width: '100%', textAlign: 'left',
                background: open ? C.cardAlt : 'transparent', padding: '13px 16px 14px', cursor: 'pointer',
              }}
            >
              {/* who, and how far along — the line an admin scans down */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.department && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: DEPARTMENT_MAP[p.department]?.color || C.tl }} />
                    )}
                    <span style={{ fontSize: 15, fontWeight: 700, color: p.unassigned ? C.tl : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                  </span>
                  {p.department && (
                    <span style={{ display: 'block', fontSize: 12, color: C.tl, marginTop: 2, paddingLeft: 16 }}>
                      {deptName(p.department, lang)}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {p.done}/{p.total}
                </span>
                <Icon name="chevronRight" size={16} color={C.faint} style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none' }} />
              </div>

              <div style={{ margin: '11px 0 9px' }}>
                <StackedBar C={C} done={p.done} doing={p.doing} todo={p.todo} total={p.total} />
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Leg state="done"  label={t.completed}  n={p.done} />
                <Leg state="doing" label={t.inProgress} n={p.doing} />
                <Leg state="todo"  label={t.pending}    n={p.todo} />
              </div>
            </div>

            {open && (
              <div style={{ padding: '2px 16px 14px', display: 'grid', gap: 8 }}>
                {p.tasks
                  .slice()
                  .sort((a, b) => (a.time_block || 'zz').localeCompare(b.time_block || 'zz'))
                  .map((task) => (
                    <TaskLine key={task.id} C={C} t={t} lang={lang} task={task} onOpen={onOpenTask} />
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

// The three states, as three different WEIGHTS of chip — filled, tinted,
// outlined — each with its own icon. Hue is the last of the three signals here,
// not the only one: green and slate ink are near-identical to a colour-blind eye.
const STATE = {
  done:  { icon: 'check', bg: '#15803D', ink: '#FFFFFF', border: '#15803D' },
  doing: { icon: 'clock', bg: '#FEF3C7', ink: '#B45309', border: '#F5D48A' },
  todo:  { icon: 'inbox', bg: 'transparent', ink: '#475569', border: '#CBD5E1' },
}

// One track, three states, in proportion. A person is behind or not behind at
// a glance, before any number is read.
function StackedBar({ C, done, doing, todo, total }) {
  const seg = (n, bg) => (n > 0 ? { flex: n, background: bg } : null)
  const parts = [
    seg(done, STATE.done.bg),
    seg(doing, '#D97706'),   // the chip's amber ink is for text; a fill needs this one
    seg(todo, '#CBD5E1'),
  ].filter(Boolean)
  if (!total) return null
  // Three hues cannot all clear 3:1 against each other in one light bar — the
  // best possible weakest pair is 1.57:1. So the boundary is not carried by hue:
  // the gap lets the row's own background through as a hard edge between
  // segments, which works whatever the two neighbouring colours are.
  return (
    <div style={{ display: 'flex', height: 9, gap: 3, background: 'transparent' }}>
      {parts.map((st, i) => <div key={i} style={{ ...st, borderRadius: 999 }} />)}
    </div>
  )
}

// The legend under a person's bar. Deliberately NOT the pill used in the
// summary — same information, different object, so the two never blur together.
function Leg({ state, label, n }) {
  const st = STATE[state]
  const muted = n === 0
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: muted ? 0.45 : 1 }}>
      <Icon name={st.icon} size={14} color={st.ink === '#FFFFFF' ? st.bg : st.ink} />
      <b style={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
      <span style={{ fontSize: 12.5, color: '#475569' }}>{label}</span>
    </span>
  )
}

function Tally({ state, label, n, size = 'md' }) {
  const st = STATE[state]
  const big = size === 'lg'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: big ? 7 : 6,
        padding: big ? '6px 12px' : '4px 9px',
        borderRadius: 999,
        background: st.bg,
        color: st.ink,
        border: '1px solid ' + st.border,
        fontSize: big ? 13.5 : 12.5,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={st.icon} size={big ? 15 : 13} color={st.ink} />
      <b style={{ fontSize: big ? 16 : 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{n}</b>
      {label}
    </span>
  )
}

// One job, and whether it is done. A tick beats the word "completed" repeated
// down a list — the eye finds the ones that are NOT ticked.
function TaskLine({ C, t, lang, task, onOpen }) {
  const done = task.status === TASK_STATUS.COMPLETED
  const doing = task.status === TASK_STATUS.IN_PROGRESS
  const tone = done ? C.green : doing ? C.yellow : '#475569'
  const fk = taskFrequency(task)
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(task) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(task) } } : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.45,
        cursor: onOpen ? 'pointer' : 'default',
        // a real tap target on a phone, without a border round every line
        padding: onOpen ? '5px 8px' : 0,
        margin: onOpen ? '0 -8px' : 0,
        borderRadius: 8,
        textAlign: 'left',
      }}
    >
      <span style={{ marginTop: 1, flexShrink: 0 }}>
        <Icon name={done ? 'check' : doing ? 'clock' : 'inbox'} size={16} color={tone} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ color: done ? C.tl : C.text, textDecoration: done ? 'line-through' : 'none' }}>
          {lang === 'hi' && task.title_hi ? task.title_hi : task.title}
        </span>
        <span style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 2, fontSize: 12, color: C.tl }}>
          {task.time_block && <span>{task.time_block}</span>}
          <span style={{ color: (FREQUENCY_MAP[fk] || {}).ink }}>{frequencyLabel(fk, lang)}</span>
          {doing && <span style={{ color: C.yellow, fontWeight: 700 }}>{t.inProgress}</span>}
        </span>
      </span>
      {onOpen && (
        <Icon name="chevronRight" size={15} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0, marginTop: 2 }} />
      )}
    </div>
  )
}
