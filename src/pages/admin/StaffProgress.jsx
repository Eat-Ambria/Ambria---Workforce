import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, DEPARTMENTS, DEPARTMENT_MAP, deptName, personName, isDueToday, taskFrequency,
  frequencyLabel, FREQUENCY_MAP, PROPERTIES, propName,
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

    // Department first, then who is furthest behind inside it.
    //
    // The list used to be one flat run ordered only by how far behind somebody
    // was, so Security, Housekeeping and Horticulture were interleaved and the
    // reader had to check the small grey line under each name to know whose team
    // they were reading. Grouped, the teams read as blocks.
    //
    // The order is DEPARTMENTS' own — Admin, Horticulture, Housekeeping,
    // Security, Kitchen, then the trades — rather than a second list here that
    // would drift from it. Admin comes first because it already does there.
    //
    // Furthest-behind is not lost, only scoped: it still decides the order
    // WITHIN a team, which is the comparison that means something. Two people on
    // different teams with different job counts were never really ranked against
    // each other anyway.
    //
    // A department filter makes this a no-op — everyone left is in one team — so
    // it needs no condition of its own.
    const deptRank = (code) => {
      const i = DEPARTMENTS.findIndex((d) => d.code === code)
      return i === -1 ? DEPARTMENTS.length : i   // retired or blank codes last
    }

    const list = [...by.values()].sort((a, b) => {
      if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1   // nobody-yet last
      const ad = deptRank(a.department)
      const bd = deptRank(b.department)
      if (ad !== bd) return ad - bd                                     // Admin, then the rest
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
      {people.map((p, i) => {
        const open = openId === p.id
        const dp = pct(p.done, p.total)
        const tone = dp === 100 ? C.green : (p.unassigned ? C.tl : C.maroon)
        // A band at the top of each team. The rows were already grouped by the
        // sort, but the only thing naming the team was the small grey line under
        // each person — so the grouping was there and had to be worked out.
        //
        // Keyed on `unassigned` as well as the department: that bucket sorts
        // last whatever department its tasks carry, so keying on the code alone
        // would file it under whichever team happened to come before it.
        const prev = people[i - 1]
        const groupKey = p.unassigned ? '_none' : (p.department || '_blank')
        const prevKey = !prev ? null : (prev.unassigned ? '_none' : (prev.department || '_blank'))
        const newGroup = groupKey !== prevKey
        const dept = DEPARTMENT_MAP[p.department]
        return (
          <div key={p.id}>
            {/* No label on the unassigned bucket — the row underneath is already
                called Unassigned, and repeating it would be the same word twice.
                It still gets the band, so it does not read as part of the team
                above it. */}
            {newGroup && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px 7px',
                background: C.cardAlt,
                borderTop: `1px solid ${C.borderStrong}`,
                borderBottom: `1px solid ${C.border}`,
              }}>
                {/* A filled chip in the department's own colour, white text on
                    it. This was `ink` as plain text, which is MEASURED wrong in
                    dark: ink is chosen to read on a PALE TINT of itself, and on
                    the dark cardAlt every department fell under 4.5:1 — Admin
                    1.54, Horticulture 2.20, Carpenter 1.07, which is invisible.
                    White on `color` clears 4.5 for all nine in both themes (5.02
                    at worst, Horticulture), and org.js says that is what `color`
                    is for. The chip also carries the dot's job, so the separate
                    dot is gone. */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 9px', borderRadius: 6,
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.07em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                  ...(p.unassigned
                    // No department, so no colour to claim. A bordered chip keeps
                    // it the same kind of element without inventing an identity.
                    ? { color: C.tl, background: 'transparent', border: `1px solid ${C.borderStrong}` }
                    : { color: '#fff', background: dept?.color || C.tl }),
                }}>
                  {p.unassigned ? t.unassigned : deptName(p.department, lang)}
                </span>
                {/* how many people are in this team today, so a one-person team
                    is visibly a one-person team */}
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                  {people.filter((x) => (x.unassigned ? '_none' : (x.department || '_blank')) === groupKey).length}
                </span>
              </div>
            )}
          <div style={{ borderTop: newGroup ? 'none' : `1px solid ${C.border}` }}>
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
              <div style={{ padding: '2px 16px 14px', display: 'grid', gap: 14 }}>
                {groupByBand(p.tasks).map(({ band, tasks }) => (
                  <div key={band} style={{ display: 'grid', gap: 8 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
                      textTransform: 'uppercase', color: (FREQUENCY_MAP[band] || {}).ink || C.tl,
                    }}>
                      {frequencyLabel(band, lang)}
                      <span style={{ fontWeight: 700, color: C.faint }}>{tasks.length}</span>
                    </div>
                    {groupByJob(tasks).map(({ key, rows }) => (
                      rows.length === 1
                        // A grouped line for a job that exists once would be a
                        // heading and one chip where a line already says it.
                        ? <TaskLine key={rows[0].id} C={C} t={t} lang={lang} task={rows[0]} onOpen={onOpenTask} />
                        : <TaskLineGroup key={key} C={C} t={t} lang={lang} rows={rows} onOpen={onOpenTask} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        )
      })}
    </Card>
  )
}

// The three states, as three different WEIGHTS of chip — filled, tinted,
// outlined — each with its own icon. Hue is the last of the three signals here,
// not the only one: green and slate ink are near-identical to a colour-blind eye.
const stateStyles = (C) => ({
  done:  { icon: 'check', bg: C.successBg, ink: '#FFFFFF', border: C.successBg },
  doing: { icon: 'clock', bg: C.yBg, ink: C.yellow, border: `${C.yellow}55` },
  todo:  { icon: 'inbox', bg: 'transparent', ink: C.tl, border: C.borderStrong },
})

// One track, three states, in proportion. A person is behind or not behind at
// a glance, before any number is read.
function StackedBar({ C, done, doing, todo, total }) {
  const seg = (n, bg) => (n > 0 ? { flex: n, background: bg } : null)
  const parts = [
    seg(done, C.successBg),
    // the chip's amber is an ink meant for text; a 9px band of it reads muddy
    seg(doing, C.yellow),
    seg(todo, C.borderStrong),
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
  const C = useColors()
  const st = stateStyles(C)[state]
  const muted = n === 0
  return (
    // 0.5 rather than 0.45: a muted zero should still be readable, and the same
    // fraction bites harder on light text over a dark ground than the other way.
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: muted ? 0.5 : 1 }}>
      <Icon name={st.icon} size={14} color={st.ink === '#FFFFFF' ? st.bg : st.ink} />
      <b style={{ fontSize: 14.5, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{n}</b>
      <span style={{ fontSize: 12.5, color: C.tl }}>{label}</span>
    </span>
  )
}

function Tally({ state, label, n, size = 'md' }) {
  const C = useColors()
  const st = stateStyles(C)[state]
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

// A person's jobs, split by how often each one runs and kept in the band order
// the rest of the app uses — daily first, the monthly audit last, which is the
// order the work arrives in. Bands nobody has work in are left out.
//
// Within a band, by time. Jobs with no window sort after the timed ones rather
// than to the top, where a blank would push a 6 AM round down the list.
const BANDS = ['daily', 'dailyMS', 'alternate', 'alternateMS', 'weekly', 'sunday', 'monthly']
function groupByBand(tasks) {
  const by = new Map()
  for (const task of tasks || []) {
    const band = taskFrequency(task)
    if (!by.has(band)) by.set(band, [])
    by.get(band).push(task)
  }
  return BANDS
    .filter((band) => by.has(band))
    .map((band) => ({
      band,
      tasks: by.get(band).sort((a, b) => (a.time_block || 'zz').localeCompare(b.time_block || 'zz')),
    }))
}

// The same job at several venues is one job. Vipul's fourteen lines are six
// pieces of work: two of them exist at all five venues, and the list repeated
// each one five times with only the venue differing — which the line did not
// even show, so the five reads as the same row printed five times.
//
// Keyed on title and time window. Frequency is not in the key because the band
// above already IS the frequency, and property is deliberately out of it —
// that is the thing being collapsed.
//
// PROPERTIES order rather than the order they arrive in, so a venue turning
// green never moves the chips around under the reader.
const propRank = (code) => {
  const i = PROPERTIES.findIndex((p) => p.code === code)
  return i === -1 ? PROPERTIES.length : i
}
// time_block is free text, and not all of it is a time. "As needed" means the
// job has no window — the same thing an empty one means — so the two must key
// alike. They did not, and it split Vicky Arya's "Villa Guest/Booking
// Coordination" into two entries on the same screen: two venues in one, the
// third on its own line, one job appearing twice.
//
// A window has digits in it. Every one of the twenty in this database does, and
// "As needed" is the only value that does not.
const windowKey = (tb) => {
  const s = (tb || '').trim().toLowerCase()
  return /\d/.test(s) ? s : ''
}

function groupByJob(tasks) {
  const by = new Map()
  const order = []
  for (const task of tasks || []) {
    const key = `${(task.title || '').trim().toLowerCase()}|${windowKey(task.time_block)}`
    if (!by.has(key)) { by.set(key, []); order.push(key) }
    by.get(key).push(task)
  }
  return order
    .map((key, seq) => {
      const rows = by.get(key).sort((a, b) => propRank(a.property) - propRank(b.property))
      return {
        key,
        rows,
        // A group is finished only when every venue is. A 3/5 still has work in
        // it and belongs with the work.
        finished: rows.every((r) => r.status === TASK_STATUS.COMPLETED),
        seq,
      }
    })
    // Done at the bottom. What is left is what the reader is here for, and a
    // struck-through line in the middle of the list is something the eye has to
    // step over on the way to the next real one.
    //
    // `seq` breaks the tie, so within each half the band's existing sort by time
    // survives — a group holds the position of its first member.
    .sort((a, b) => (Number(a.finished) - Number(b.finished)) || (a.seq - b.seq))
}

const timeOf = (rows) => (rows.find((r) => (r.time_block || '').trim()) || {}).time_block || ''

// One job, several venues: the title and its time stated once, then a chip per
// venue carrying that venue's own state and its own way in.
function TaskLineGroup({ C, t, lang, rows, onOpen }) {
  const first = rows[0]
  const done = rows.filter((r) => r.status === TASK_STATUS.COMPLETED).length
  const doing = rows.some((r) => r.status === TASK_STATUS.IN_PROGRESS)
  const allDone = done === rows.length
  const tone = allDone ? C.green : doing ? C.yellow : C.tl

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.45 }}>
      {/* The same three icons a single line uses, read across the set: every
          venue done, someone mid-job, or nothing started. */}
      <span style={{ marginTop: 1, flexShrink: 0 }}>
        <Icon name={allDone ? 'check' : doing ? 'clock' : 'inbox'} size={16} color={tone} />
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: allDone ? C.tl : C.text, textDecoration: allDone ? 'line-through' : 'none' }}>
            {lang === 'hi' && first.title_hi ? first.title_hi : first.title}
          </span>
          {/* How far through the set, before reading which venues. */}
          <span style={{
            fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
            color: allDone ? C.green : C.tl, fontVariantNumeric: 'tabular-nums',
          }}>
            {done}/{rows.length}
          </span>
        </span>

        {/* Not first.time_block: the rows are ordered by venue, so the first one
            may be the one with no window while another says "As needed" — which
            is worth keeping rather than dropping because of chip order. Two
            different real windows cannot be here; that would be two groups. */}
        {timeOf(rows) && (
          <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: C.tl }}>
            {timeOf(rows)}
          </span>
        )}

        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
          {rows.map((task) => {
            const isDone = task.status === TASK_STATUS.COMPLETED
            const isDoing = task.status === TASK_STATUS.IN_PROGRESS
            const ink = isDone ? C.green : isDoing ? C.yellow : C.tl
            return (
              <button
                key={task.id}
                type="button"
                onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(task) } : undefined}
                disabled={!onOpen}
                title={`${propName(task.property, lang)} · ${isDone ? t.completed : isDoing ? t.inProgress : t.pending}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px 3px 5px', borderRadius: 999,
                  background: isDone ? `${C.green}14` : 'transparent',
                  border: `1px solid ${isDone ? C.green : isDoing ? `${C.yellow}88` : C.border}`,
                  cursor: onOpen ? 'pointer' : 'default', whiteSpace: 'nowrap',
                }}
              >
                {/* Filled once that venue is done, hollow while it is not —
                    the eye finds the ones that are NOT ticked. */}
                <span style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  background: isDone ? C.green : 'transparent',
                  border: `1.5px solid ${isDone ? C.green : isDoing ? C.yellow : C.borderStrong}`,
                }}>
                  {isDone && <Icon name="check" size={9} color="#fff" />}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: ink }}>
                  {propName(task.property, lang)}
                </span>
              </button>
            )
          })}
        </span>
      </span>
    </div>
  )
}

// One job, and whether it is done. A tick beats the word "completed" repeated
// down a list — the eye finds the ones that are NOT ticked.
function TaskLine({ C, t, lang, task, onOpen }) {
  const done = task.status === TASK_STATUS.COMPLETED
  const doing = task.status === TASK_STATUS.IN_PROGRESS
  const tone = done ? C.green : doing ? C.yellow : C.tl
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
        {/* No frequency here any more — the heading above the group says it,
            and repeating it on every line was the only thing on most of them. */}
        {(task.time_block || doing) && (
          <span style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 2, fontSize: 12, color: C.tl }}>
            {task.time_block && <span>{task.time_block}</span>}
            {doing && <span style={{ color: C.yellow, fontWeight: 700 }}>{t.inProgress}</span>}
          </span>
        )}
      </span>
      {onOpen && (
        <Icon name="chevronRight" size={15} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0, marginTop: 2 }} />
      )}
    </div>
  )
}
