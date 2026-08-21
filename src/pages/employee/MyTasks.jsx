import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { nowISO, todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import {
  TASK_STATUS, TASK_CATEGORIES, isTaskOverdue,
  taskFrequency, frequencyLabel, FREQUENCY_MAP, notDueToday, scheduleText, staffingLabel,
  propName, PROPERTIES,
} from '../../constants/org'
import { statusColors } from '../../constants/status'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Field, inputStyle, filterStyle, FilterField } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import PhotoCapture from '../../components/common/PhotoCapture'
import AudioPlayer from '../../components/common/AudioPlayer'
import Icon from '../../components/common/Icon'
import PhotoViewer from '../../components/common/PhotoViewer'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const AUTO_REFRESH_MS = 30000
const TR_ORANGE = '#EA580C' // overdue accent (matches the dashboard)
// empty-state wording per category chip, so "nothing here" says WHAT is missing
const EMPTY_KEY = {
  all: 'noTaskYet', daily: 'noDailyTaskYet', alternate: 'noAlternateTaskYet',
  weekly: 'noWeeklyTaskYet', monthly: 'noMonthlyTaskYet',
}

const metaLine = (C) => ({ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: C.tl, marginTop: 2 })

// format a millisecond duration as "1h 4m 12s" (trims leading zero units)
function fmtDur(ms) {
  if (ms == null || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}h ${m}m ${sec}s`
  if (m) return `${m}m ${sec}s`
  return `${sec}s`
}

function tintBg(hex, alpha = 0.12) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Structured status banner: colored icon chip + title + subtitle, soft accent border.
function Notice({ C, tone, bg, icon, title, sub }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: bg,
        border: `1px solid ${tintBg(tone, 0.25)}`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 12,
        padding: '13px 14px',
        marginTop: 12,
      }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 8, background: tintBg(tone, 0.16), color: tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} color={tone} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tone }}>{title}</div>
        {sub && <div style={{ fontSize: 13.5, color: C.text, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function MyTasks() {
  const C = useColors()
  const roomy = useMediaQuery('(min-width: 560px)')
  // Five filter labels with their counts want about 700px on one line; 900 leaves
  // room for the page's own padding without the labels truncating.
  const oneRow = useMediaQuery('(min-width: 900px)')
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  // status filter — may be preset from the dashboard KPI tiles.
  // Task status (pending/in_progress/…) and issue status are independent
  // dimensions, each with its own filter.
  const location = useLocation()
  const [status, setStatus] = useState(location.state?.status || 'all')
  const [issueStatus, setIssueStatus] = useState(location.state?.issueStatus || 'all')
  const [active, setActive] = useState(null) // task open in work modal

  // Somebody based at one venue never needs to be told which venue. Somebody
  // covering two does — otherwise the same round at each reads as one card
  // printed twice, which is what it looked like.
  const showVenue = useMemo(
    () => new Set(tasks.map((x) => x.property)).size > 1,
    [tasks]
  )

  const load = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user.id)
      .order('task_date', { ascending: false })
      // a day is worked in time order; tasks with no time sit after the timed ones
      .order('time_block', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (!error) setTasks(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
    // Auto-refresh, but be a good citizen under load:
    //  - skip polling while the tab is hidden (no point querying a backgrounded app)
    //  - add random jitter so 100s of clients don't all hit the DB on the same second
    //  - refresh immediately when the user returns to the tab
    const interval = AUTO_REFRESH_MS + Math.floor(Math.random() * 10000)
    const tick = () => { if (!document.hidden) load() }
    const id = setInterval(tick, interval)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // apply a status / issue-status preset passed from dashboard tiles or notifications
  useEffect(() => {
    if (location.state?.status) setStatus(location.state.status)
    if (location.state?.issueStatus) setIssueStatus(location.state.issueStatus)
  }, [location.state])

  // deep-link from a notification: open the exact task by id
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
      if (data) setActive(data)
    })()
  }, [location.state])

  const today = todayISO()
  const filtered = useMemo(() => {
    // Not today, not shown. A Mon-Sat job on a Sunday is not merely "late-ish" —
    // it must NOT be done: Sunday is client-visit day, no lawn work, no machines.
    // Leaving it on the list with a label invited someone to do it anyway.
    // Sunday-only work is hidden the rest of the week for the same reason.
    // The roster still lists every job, because that is the plan, not the day.
    const due = tasks.filter((x) => !notDueToday(x))
    let rows = cat === 'all' ? due : due.filter((x) => x.category === cat)
    // task-status filter (lifecycle) and issue-status filter apply independently
    if (status === 'overdue') rows = rows.filter((x) => isTaskOverdue(x, today))
    else if (status !== 'all') rows = rows.filter((x) => x.status === status)
    if (issueStatus !== 'all') rows = rows.filter((x) => x.issue_status === issueStatus)
    return rows
  }, [tasks, cat, status, issueStatus, today])

  // Nothing to show: say whether this category is genuinely empty or whether a
  // status filter is hiding rows that do exist in it.
  const dueToday = tasks.filter((x) => !notDueToday(x))
  // What is still outstanding in each band, shown under its pill. Not narrowed by
  // the status or issue filters: "how much is left in Weekly" does not change
  // because you are looking at Completed — and if it did, every pill would read 0
  // the moment you selected it.
  // One count per status button. From dueToday, the same list the frequency pills
  // count from, so the two rows can never disagree — and like those, not narrowed
  // by the other filters: a count is a fact about the work, not about what else
  // you have selected.
  const statusCounts = useMemo(() => ({
    all: dueToday.length,
    overdue: dueToday.filter((x) => isTaskOverdue(x, today)).length,
    [TASK_STATUS.PENDING]: dueToday.filter((x) => x.status === TASK_STATUS.PENDING).length,
    [TASK_STATUS.IN_PROGRESS]: dueToday.filter((x) => x.status === TASK_STATUS.IN_PROGRESS).length,
    [TASK_STATUS.COMPLETED]: dueToday.filter((x) => x.status === TASK_STATUS.COMPLETED).length,
  }), [dueToday, today])

  const catCounts = useMemo(() => dueToday.reduce(
    (acc, x) => (x.status === TASK_STATUS.PENDING
      ? { ...acc, all: (acc.all || 0) + 1, [x.category]: (acc[x.category] || 0) + 1 }
      : acc),
    {},
  ), [dueToday])

  // Normal task-lifecycle statuses (left dropdown). No "awaiting approval":
  // tasks have had no approval step since markForCompletion started writing
  // COMPLETED directly, so on a task that option could only return an empty list.
  // The queue belongs to repair requests, where an assignee submits and an admin
  // approves. Checked before removing it: zero task rows carry that status.
  const statusChips = [
    { key: 'all', label: t.all },
    { key: 'overdue', label: t.overdue },
    { key: TASK_STATUS.PENDING, label: t.pending },
    { key: TASK_STATUS.IN_PROGRESS, label: t.inProgress },
    { key: TASK_STATUS.COMPLETED, label: t.completed },
  ]
  // issue-tracking statuses (separate "Issue Status" dropdown)
  const issueChips = [
    { key: 'all', label: t.all },
    { key: TASK_STATUS.ISSUE, label: t.issue },
    { key: TASK_STATUS.ISSUE_WORKING, label: t.issueWorking },
    { key: TASK_STATUS.ISSUE_RESOLVED, label: t.issueResolved },
  ]

  // Read back whichever filters are actually set, in their own words — the same
  // labels as the buttons above. "No task matches these filters" is true and
  // useless: there are three of them and it names none, so clearing it is guesswork.
  const emptyState = useMemo(() => {
    const hi = lang === 'hi'
    const labelOf = (list, key) => (list.find((x) => x.key === key) || {}).label
    const parts = []
    if (status !== 'all') parts.push(labelOf(statusChips, status))
    if (cat !== 'all') parts.push(frequencyLabel(cat, hi ? 'hi' : 'en'))

    // Nothing set at all: this band genuinely has no work today, which is a
    // different sentence from "your filters hid it".
    if (!parts.length && issueStatus === 'all') {
      return { title: t[EMPTY_KEY[cat]] || t.noData, hint: undefined }
    }

    const what = parts.filter(Boolean).join(' · ')
    const issueBit = issueStatus === 'all'
      ? ''
      : ` ${hi ? '·' : '·'} ${labelOf(issueChips, issueStatus)}`

    return {
      title: what
        ? (hi ? `${what}${issueBit} — कुछ नहीं मिला` : `Nothing under ${what}${issueBit}`)
        : (hi ? `${labelOf(issueChips, issueStatus)} — कुछ नहीं मिला` : `Nothing with ${labelOf(issueChips, issueStatus)}`),
      // Clear exactly what is set, and say which. Telling somebody to "set the
      // filters back to All" when one of three is on makes them check all three.
      hint: hi
        ? `${[status !== 'all' && 'स्टेटस', cat !== 'all' && 'कितनी बार', issueStatus !== 'all' && 'समस्या'].filter(Boolean).join(' / ')} फ़िल्टर हटाकर देखें`
        : `Clear the ${[status !== 'all' && 'status', cat !== 'all' && 'frequency', issueStatus !== 'all' && 'issue'].filter(Boolean).join(' / ')} filter to see the rest`,
    }
  }, [status, cat, issueStatus, statusChips, issueChips, lang, t])
  // group by lifecycle status for a clean read: active first
  const order = [
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.PENDING,
    TASK_STATUS.COMPLETION_REQUESTED,
    TASK_STATUS.COMPLETED,
  ]
  const sorted = [...filtered].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))

  // Where each row sits BEFORE the status sort. A grouped card takes its position
  // from this, so completing a venue cannot move the card: the status sort shuffles
  // rows, and anything derived from the shuffled order shifts underneath you.
  const stableRank = useMemo(
    () => new Map(filtered.map((task, i) => [task.id, i])),
    [filtered],
  )

  // Split by how often each job runs, in the order the day runs them. Status
  // still leads inside a band — something already started belongs at the top of
  // its group — and after that, by time, with untimed jobs last rather than
  // first, where a blank would push a 9 AM round below them.
  const BANDS = ['daily', 'dailyMS', 'alternate', 'alternateMS', 'weekly', 'sunday', 'monthly']
  // The same job at several venues is one job. Keyed on the fields that make two
  // rows the same work — title, how often, which slot — and deliberately NOT on
  // property, since that is what is being collapsed.
  const groupOf = (task) => [
    (task.title || '').trim().toLowerCase(),
    taskFrequency(task),
    (task.time_block || '').trim().toLowerCase(),
  ].join('|')

  const bands = useMemo(() => {
    const by = new Map()
    for (const task of sorted) {
      const band = taskFrequency(task)
      if (!by.has(band)) by.set(band, [])
      by.get(band).push(task)
    }
    return BANDS.filter((b) => by.has(b)).map((band) => ({
      band,
      tasks: by.get(band).sort((a, b) => (order.indexOf(a.status) - order.indexOf(b.status))
        || (a.time_block || 'zz').localeCompare(b.time_block || 'zz')),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted])

  return (
    <div>
      <SectionTitle>{t.myTasks}</SectionTitle>

      {/* A row each. Side by side the status grid got half the width and its
          labels truncated to "Over... 0" — a button you have to guess at. They are
          two different questions, so reading them one under the other costs
          nothing. */}
      <div style={{
        display: 'grid', gap: 10, marginBottom: 10,
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}>
        <FilterField label={t.taskStatus}>
          <StatusPills
            options={statusChips} value={status} onChange={setStatus}
            counts={statusCounts} wide={oneRow} C={C} hi={lang === 'hi'}
          />
        </FilterField>
        <FilterField label={t.issueStatus}>
          {/* No counts here: these read zero on most days, and a row of zeros is
              noise rather than information. */}
          <StatusPills
            options={issueChips} value={issueStatus} onChange={setIssueStatus}
            wide={oneRow} C={C} hi={lang === 'hi'}
          />
        </FilterField>
      </div>

      {/* One setting with five values, made to fit rather than made to scroll.
          Wrapping to a second row reads as two controls; scrolling left the last
          value off the edge, which is worse — an unseen filter is an unused one.
          So it tightens on narrow and shortens the one long label there, exactly
          as the same row does on Daily Task. */}
      <div className="no-bar" style={{
        display: 'flex', gap: 2, marginBottom: 16, padding: 3,
        background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 11,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {['all', ...TASK_CATEGORIES].map((c) => {
          const on = cat === c
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={on}
              style={{
                flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap',
                display: 'grid', justifyItems: 'center', gap: 1,
                padding: roomy ? '6px 16px' : '5px 6px', borderRadius: 9,
                fontSize: roomy ? 13.5 : 13, fontWeight: on ? 700 : 600,
                background: on ? C.card : 'transparent',
                color: on ? C.maroon : C.tl,
                border: 'none', boxShadow: on ? C.shadow : 'none', cursor: 'pointer',
              }}
            >
              <span>{c === 'all' ? t.all : (!roomy && c === 'alternate' ? t.alternateShort : t[c])}</span>
              {/* A zero is drawn too: an empty band is an answer, and blanking it
                  makes the row shift as the numbers arrive. */}
              <span style={{
                fontSize: roomy ? 11 : 10.5, fontWeight: 700, lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
                color: (catCounts[c] || 0) ? (on ? C.maroon : C.faint) : C.faint,
                opacity: (catCounts[c] || 0) ? 1 : 0.55,
              }}>
                {catCounts[c] || 0}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <Loader label={t.loading} />
      ) : sorted.length === 0 ? (
        <EmptyState icon={null} title={emptyState.title} hint={emptyState.hint} />
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {bands.map(({ band, tasks }) => (
            <div key={band} style={{ display: 'grid', gap: 12 }}>
              {/* Only worth a heading when there is more than one band on
                  screen — under a frequency chip the list is already that one
                  band, and the chip above says so. */}
              {bands.length > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em',
                  textTransform: 'uppercase', color: (FREQUENCY_MAP[band] || {}).ink || C.tl,
                }}>
                  {frequencyLabel(band, lang)}
                  <span style={{ fontWeight: 700, color: C.faint }}>{tasks.length}</span>
                </div>
              )}
              {(() => {
                // Preserve the order the band already sorted into: a group takes
                // the position of its first member.
                const groups = []
                const seen = new Map()
                tasks.forEach((task) => {
                  const k = groupOf(task)
                  if (!seen.has(k)) { seen.set(k, []); groups.push({ key: k, rows: seen.get(k) }) }
                  seen.get(k).push(task)
                })
                // Venue order, not status order. The band sorts by status, which
                // is right for separate cards and wrong inside a group: ticking a
                // venue moved it, so the chip you were aiming at was no longer
                // where you left it. PROPERTIES order is the same on every card
                // and every visit, which is what makes five taps learnable.
                const venueRank = (task) => {
                  const i = PROPERTIES.findIndex((x) => x.code === task.property)
                  return i === -1 ? PROPERTIES.length : i
                }
                groups.forEach((g) => g.rows.sort((a, b) => venueRank(a) - venueRank(b)))

                // A card must not move while you are working through it. Its place
                // used to come from whichever row sorted first by status, so two
                // ticks changed that row and the card slid down the list.
                //
                // Only one thing moves a group now: finishing it. Unfinished cards
                // hold the order they arrived in; a finished one drops to the
                // bottom of the band, which is the move that helps.
                groups.forEach((g) => {
                  // The earliest place any of its rows holds in the pre-sort list.
                  // Taking it from the sorted list is what let two ticks move the
                  // card: those rows went to the back and the "first" row changed.
                  g.base = Math.min(...g.rows.map((r) => stableRank.get(r.id) ?? Number.MAX_SAFE_INTEGER))
                  g.allDone = g.rows.every((r) => r.status === TASK_STATUS.COMPLETED)
                })
                groups.sort((a, b) => (a.allDone === b.allDone ? a.base - b.base : (a.allDone ? 1 : -1)))

                return groups.map(({ key, rows }) => (
                  rows.length === 1
                    // A grouped card for a single job would be a heading and one
                    // row where a card already says it.
                    ? <TaskRow key={rows[0].id} task={rows[0]} C={C} t={t} today={today} hi={lang === 'hi'}
                        showVenue={showVenue} onOpen={() => setActive(rows[0])} />
                    : <TaskGroup key={key} rows={rows} C={C} t={t} today={today} hi={lang === 'hi'}
                        onOpen={setActive} />
                ))
              })()}
            </div>
          ))}
        </div>
      )}

      {active && (
        <WorkModal
          task={active}
          onClose={() => setActive(null)}
          onSaved={() => { setActive(null); load() }}
          user={user}
        />
      )}
    </div>
  )
}

// show the Hindi task title when the app is in Hindi and one exists
const taskTitle = (task, hi) => (hi && task.title_lang === 'hi' ? task.title_hi : task.title)

// A row of filter pills, used by both Task Status and Issue Status. One
// component rather than two copies of a button block — the second copy is how the
// two quietly stop matching.
//
// `wide` puts every option on one line. Five labels with their counts need roughly
// 700px, which is why the caller decides at 900 rather than this guessing.
// `counts` is optional: Task Status has a figure worth showing on each option,
// Issue Status mostly reads zero and a row of zeros is noise.
function StatusPills({ options, value, onChange, counts, wide, C, hi }) {
  return (
    <div style={{
      display: 'grid', gap: 6,
      gridTemplateColumns: wide
        ? `repeat(${options.length}, minmax(0, 1fr))`
        : 'repeat(2, minmax(0, 1fr))',
    }}>
      {options.map((o) => {
        const on = value === o.key
        const n = counts ? (counts[o.key] || 0) : null
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(on && o.key !== 'all' ? 'all' : o.key)}
            aria-pressed={on}
            title={on && o.key !== 'all' ? (hi ? 'फ़िल्टर हटाएँ' : 'clear this filter') : o.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              padding: '7px 11px', borderRadius: 999, minWidth: 0,
              // On one line every option is a peer. Stacked, All spans the row —
              // it is not another subset, it is the set the others divide up.
              gridColumn: !wide && o.key === 'all' ? '1 / -1' : undefined,
              background: on ? C.maroonSoft : 'transparent',
              border: `1px solid ${on ? C.maroon : C.border}`,
              color: on ? C.maroon : C.tl,
              fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: 'pointer',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o.label}
            </span>
            {n != null && (
              <span style={{
                flexShrink: 0, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: on ? C.maroon : (n ? C.text : C.faint),
              }}>
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// One job, several venues. The shared fields are stated once at the top and each
// venue gets a line with its own state and its own way in.
function TaskGroup({ rows, C, t, today, onOpen, hi }) {
  const first = rows[0]
  const fk = taskFrequency(first)
  const freq = FREQUENCY_MAP[fk] || FREQUENCY_MAP.daily
  const sched = scheduleText(first, hi ? 'hi' : 'en')
  const done = rows.filter((r) => r.status === TASK_STATUS.COMPLETED).length
  const late = rows.some((r) => isTaskOverdue(r, today))

  return (
    <Card style={{ borderLeft: `4px solid ${late ? TR_ORANGE : (done === rows.length ? C.green : C.borderStrong)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{taskTitle(first, hi)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, background: freq.tint, color: freq.ink }}>
              {frequencyLabel(fk, hi ? 'hi' : 'en')}
            </span>
            {sched && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.tl }}>{sched}</span>}
            {first.time_block && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.tl }}>
                <Icon name="clock" size={12} color={C.tl} /> {first.time_block}
              </span>
            )}
          </div>
        </div>
        {/* how far through the set you are, before reading the venues */}
        <span style={{
          fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0,
          color: done === rows.length ? C.green : C.tl,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {done}/{rows.length} {hi ? 'जगह' : 'venues'}
        </span>
      </div>

      {/* One line of chips. Five full-width rows for five one-word venue names
          was the same waste as five separate cards, one level down. The hollow
          circle already says "not done", so the status word and the chevron go —
          the whole chip is the target. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
        {rows.map((task) => {
          const isDone = task.status === TASK_STATUS.COMPLETED
          const od = isTaskOverdue(task, today)
          const edge = isDone ? C.green : od ? TR_ORANGE : C.borderStrong
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpen(task)}
              title={`${propName(task.property, hi ? 'hi' : 'en')} · ${t[statusColors(task.status, C).key]}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '5px 12px 5px 7px', borderRadius: 999,
                background: isDone ? `${C.green}14` : 'transparent',
                border: `1.5px solid ${isDone ? C.green : od ? `${TR_ORANGE}88` : C.border}`,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: isDone ? C.green : 'transparent',
                border: `2px solid ${edge}`,
              }}>
                {isDone && <Icon name="check" size={10} color="#fff" />}
              </span>
              <span style={{
                fontSize: 12.5, fontWeight: 700,
                color: isDone ? C.green : od ? TR_ORANGE : C.text,
              }}>
                {propName(task.property, hi ? 'hi' : 'en')}
              </span>
            </button>
          )
        })}
      </div>
      {/* What the chips are for. They look like filter pills, and nothing said
          they are a checklist you work through venue by venue.
          Only while something is left — at 5/5 the row of green ticks says it
          better than a sentence would. */}
      {done < rows.length && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.5,
        }}>
          <Icon name="info" size={13} color={C.faint} style={{ flexShrink: 0 }} />
          {hi
            ? 'जिस प्रॉपर्टी का काम हो जाए, उसे टिक करते रहें — टैप करके फ़ोटो लगाएँ और पूरा करें।'
            : 'Tick each venue as its work is done — tap it to add the photo and finish.'}
        </div>
      )}
    </Card>
  )
}

function TaskRow({ task, C, t, today, onOpen, hi, showVenue }) {
  const sc = statusColors(task.status, C)
  const isc = task.issue_status ? statusColors(task.issue_status, C) : null
  const od = isTaskOverdue(task, today)
  const fk = taskFrequency(task)
  const freq = FREQUENCY_MAP[fk] || FREQUENCY_MAP.daily
  const sched = scheduleText(task, hi ? 'hi' : 'en')
  return (
    <Card onClick={onOpen} style={{ cursor: 'pointer', borderLeft: `4px solid ${od ? TR_ORANGE : sc.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{taskTitle(task, hi)}</div>
          {/* the roster's own wording for how often this comes back */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {/* Leads the row: two cards identical in every other field are two
                venues, and this is the field that says so. */}
            {showVenue && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 800, padding: '2px 8px 2px 6px', borderRadius: 999, border: `1.5px solid ${C.borderStrong || C.border}`, color: C.text }}>
                <Icon name="pin" size={11} color={C.tl} />
                {propName(task.property, hi ? 'hi' : 'en')}
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, background: freq.tint, color: freq.ink }}>
              {frequencyLabel(fk, hi ? 'hi' : 'en')}
            </span>
            {/* which days it actually comes round on — "Every Monday", "Mon · Wed · Fri" */}
            {sched && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.tl }}>{sched}</span>}
          </div>
          {task.area && <div style={metaLine(C)}><Icon name="pin" size={14} /> {task.area}</div>}
          {task.time_block && <div style={metaLine(C)}><Icon name="clock" size={14} /> {task.time_block}</div>}
          {task.due_date && (
            <div style={{ ...metaLine(C), color: od ? TR_ORANGE : C.tl, fontWeight: od ? 700 : 500 }}>
              <Icon name={od ? 'warning' : 'clock'} size={14} color={od ? TR_ORANGE : C.tl} />
              {od ? `${t.overdue} · ` : `${t.dueDate}: `}{fmtDate(task.due_date)}
            </div>
          )}
          {task.rejection_note && task.status === TASK_STATUS.IN_PROGRESS && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.red, fontWeight: 600, marginTop: 4 }}>
              <Icon name="warning" size={13} /> {t.sentBack}
            </div>
          )}
        </div>
        {/* independent badges: task lifecycle status + issue status (if any) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
          {isc && <Badge color={isc.color} bg={isc.bg}>{t[isc.key]}</Badge>}
        </div>
      </div>
    </Card>
  )
}

// ---- Start Work (before photo) -> work (timer) -> Mark for Completion (after photo) ----
function WorkModal({ task, onClose, onSaved, user }) {
  const [viewing, setViewing] = useState(null)  // { photos, index } in the lightbox
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const [beforePhotos, setBeforePhotos] = useState(Array.isArray(task.before_photo) ? task.before_photo : [])
  const [photos, setPhotos] = useState(Array.isArray(task.completion_photo) ? task.completion_photo : [])
  const [note, setNote] = useState(task.completion_note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [issueMode, setIssueMode] = useState(false)
  const [issueText, setIssueText] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const sc = statusColors(task.status, C)
  const isc = task.issue_status ? statusColors(task.issue_status, C) : null
  const fk = taskFrequency(task)
  const freq = FREQUENCY_MAP[fk] || FREQUENCY_MAP.daily
  const notToday = notDueToday(task)
  const sched = scheduleText(task, lang)
  const isPending = task.status === TASK_STATUS.PENDING
  const isInProgress = task.status === TASK_STATUS.IN_PROGRESS
  const isWaiting = task.status === TASK_STATUS.COMPLETION_REQUESTED
  const isDone = task.status === TASK_STATUS.COMPLETED
  // issue is an independent dimension — it never blocks the task workflow
  const hasActiveIssue = [TASK_STATUS.ISSUE, TASK_STATUS.ISSUE_WORKING].includes(task.issue_status)

  // The roster's camera tick is the whole rule (tasks.photo_required): a
  // supervisory round has nothing to photograph, so it can be switched off per
  // task. It used to be overridden for admins — the photo proves the work TO an
  // admin, so one proving it to themselves seemed like theatre — but that made
  // the tick do nothing on their own rostered work, and an admin on the roster
  // is doing the work like anyone else.
  const showCapture = task.photo_required !== false  // offer the camera
  // Only the "after" one is insisted on. The photo is there to show the work was
  // done, and that is the one that shows it — demanding a "before" as well meant
  // standing at the job unable to start it, which is the worst possible moment
  // to be arguing with a phone. It is still offered, and it is still worth
  // taking on anything where the state beforehand is the point.
  const needsAfter = showCapture
  const canComplete = !needsAfter || photos.length > 0   // "after" photo to submit

  // live timer while working
  useEffect(() => {
    if (!isInProgress) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isInProgress])

  const startMs = task.started_at ? new Date(task.started_at).getTime() : null
  const endMs = task.completion_requested_at ? new Date(task.completion_requested_at).getTime()
    : (task.completed_at ? new Date(task.completed_at).getTime() : null)
  const elapsedMs = startMs == null ? null : (isInProgress ? now - startMs : (endMs != null ? endMs - startMs : null))

  async function update(patch) {
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    setBusy(false)
    if (error) { setErr(error.message); return false }
    return true
  }

  async function startWork() {
    // Whatever has been photographed so far goes with it — usually nothing, and
    // that is fine now. Nobody is held at the job waiting on a camera.
    if (await update({ status: TASK_STATUS.IN_PROGRESS, before_photo: beforePhotos, started_at: nowISO(), started_by: user.id })) onSaved()
  }

  async function saveBefore(next) {
    setBeforePhotos(next)
  }

  async function savePhotos(next) {
    setPhotos(next)
    await update({ completion_photo: next })
  }

  // Marking it done finishes it — there is no approval queue any more. The
  // admin sees the completed work and, if it will not do, sends it back for a
  // redo (which is the honest correction: the task reopens, it is not "rejected
  // pending approval"). completion_requested_at still stamps the moment the work
  // ended, because that is what work_seconds is measured to.
  async function markForCompletion() {
    if (!canComplete) { setErr(t.photoRequired); return }
    const done = nowISO()
    const ok = await update({
      status: TASK_STATUS.COMPLETED,
      completion_photo: photos,
      completion_note: note,
      completion_requested_at: done,
      completed_at: done,
      completed_by: user.id,
      rejection_note: null, // clear the previous send-back reason on a redo
      // NOTE: rejection_voice_url is intentionally kept until the admin clears
      // it, so the recording isn't orphaned in storage. It's hidden from staff
      // once the task is done anyway.
    })
    if (ok) onSaved()
  }

  async function reportIssue() {
    if (!issueText.trim()) return
    // report the issue WITHOUT touching the task's lifecycle status — the task
    // stays Pending/In Progress; only issue_status changes. A DB trigger turns
    // the issue_status change into a 'task_issue' notification for admins.
    if (await update({ issue_status: TASK_STATUS.ISSUE, notes: issueText })) onSaved()
  }

  const beforeLabel = hi ? 'काम से पहले' : 'Before work'
  const afterLabel = hi ? 'काम के बाद' : 'After work'
  const thumbs = (arr) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {(arr || []).length ? arr.map((u, i) => (
        <img
          key={u} src={u} alt=""
          onClick={() => setViewing({ photos: arr, index: i })}
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'zoom-in' }}
        />
      )) : <span style={{ fontSize: 13, color: C.faint }}>—</span>}
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={taskTitle(task, hi)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.close}</Button>
          {isPending && !issueMode && <Button variant="primary" onClick={startWork} disabled={busy} style={{ flex: 2 }}>{t.startWork}</Button>}
          {isInProgress && !issueMode && (
            <Button variant="success" onClick={markForCompletion} disabled={busy || !canComplete} style={{ flex: 2 }}>
              {t.markDone}
            </Button>
          )}
          {issueMode && <Button variant="danger" onClick={reportIssue} disabled={busy} style={{ flex: 2 }}>{t.submit}</Button>}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge color={sc.color} bg={sc.bg}>{t[sc.key]}</Badge>
        {isc && <Badge color={isc.color} bg={isc.bg}>{t[isc.key]}</Badge>}
        {task.category && <Badge color={freq.ink} bg={freq.tint}>{frequencyLabel(fk, lang)}</Badge>}
        {/* how many people the roster puts on this job — "All", "Any 2" */}
        {task.staffing && <Badge>{staffingLabel(task.staffing, lang)}</Badge>}
        {sched && <Badge>{sched}</Badge>}
      </div>

      {/* A Mon-Sat job on a Sunday, or Sunday work on a weekday. Said plainly so
          nobody mows the lawn on client-visit day just because the row is there. */}
      {notToday && (
        <Notice C={C} tone={C.tl} bg={C.cardAlt} icon="clock" title={t.notToday} sub={t.notTodayMsg} />
      )}

      {(task.rejection_note || task.rejection_voice_url) && (isInProgress || isPending) && !issueMode && (
        <div style={{ background: C.rBg, borderRadius: 10, padding: 12, marginBottom: 14, border: `1px solid ${C.red}22` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.red, fontWeight: 700, fontSize: 13.5 }}>
            <Icon name="warning" size={16} /> {t.sentBack}
          </div>
          {task.rejection_note && <div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{task.rejection_note}</div>}
          {task.rejection_voice_url && (
            <div style={{ marginTop: 10 }}>
              <AudioPlayer src={task.rejection_voice_url} label={t.voiceNote} />
            </div>
          )}
        </div>
      )}

      {task.description && <p style={{ fontSize: 14, color: C.tl, marginBottom: 10, lineHeight: 1.45 }}>{task.description}</p>}
      {task.area && <p style={{ ...metaLine(C), fontSize: 13.5, marginBottom: 4 }}><Icon name="pin" size={15} /> {task.area}</p>}
      {task.time_block && <p style={{ ...metaLine(C), fontSize: 13.5, marginBottom: 12 }}><Icon name="clock" size={15} /> {task.time_block}</p>}

      {/* work timer */}
      {elapsedMs != null && !issueMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: isInProgress ? C.bBg : C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', marginBottom: 12 }}>
          <Icon name="clock" size={17} color={isInProgress ? C.blue : C.tl} />
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: isInProgress ? C.blue : C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtDur(elapsedMs)}</div>
            <div style={{ fontSize: 12, color: C.tl }}>{isInProgress ? (hi ? 'काम जारी है…' : 'Working…') : (hi ? 'कुल समय लगा' : 'Total time taken')}</div>
          </div>
        </div>
      )}

      {/* Before / after sit side by side so the whole task fits without
          scrolling; auto-fit drops them back to one column on a narrow phone. */}
      {!issueMode && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 7 }}>
              {beforeLabel} {isPending && showCapture && (
                <span style={{ color: C.faint, fontWeight: 500 }}>({t.optional})</span>
              )}
            </div>
            {isPending && showCapture ? <PhotoCapture folder="tasks" value={beforePhotos} onChange={saveBefore} /> : thumbs(beforePhotos)}
          </div>

          {(isInProgress || isWaiting || isDone) && (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 7 }}>
                {afterLabel} {isInProgress && needsAfter && <span style={{ color: C.red }}>*</span>}
              </div>
              {isInProgress && showCapture ? <PhotoCapture folder="tasks" value={photos} onChange={savePhotos} /> : thumbs(photos)}
            </div>
          )}
        </div>
      )}

      {/* the note spans the full width below both columns */}
      {isInProgress && !issueMode && (
        <Field label={`${t.completionNote} (${t.optional})`}>
          <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}

      {isWaiting && <Notice C={C} tone={C.yellow} bg={C.yBg} icon="clock" title={t.completionRequested} sub={t.awaitingApprovalMsg} />}
      {isDone && <Notice C={C} tone={C.green} bg={C.gBg} icon="check" title={t.completed} sub={t.completedMsg} />}
      {task.issue_status === TASK_STATUS.ISSUE && <Notice C={C} tone={C.red} bg={C.rBg} icon="warning" title={t.issue} sub={task.notes} />}
      {task.issue_status === TASK_STATUS.ISSUE_WORKING && <Notice C={C} tone={C.yellow} bg={C.yBg} icon="clock" title={t.issueWorking} sub={t.issueWorkingMsg} />}
      {task.issue_status === TASK_STATUS.ISSUE_RESOLVED && <Notice C={C} tone={C.green} bg={C.gBg} icon="check" title={t.issueResolved} sub={t.issueResolvedMsg} />}

      {/* report an issue — independent of task status; hidden once one is open/being worked */}
      {!isDone && !isWaiting && !hasActiveIssue && (
        <div style={{ marginTop: 16 }}>
          {!issueMode ? (
            <button onClick={() => setIssueMode(true)} style={{ background: 'transparent', color: C.red, fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="warning" size={16} /> {t.reportIssue}
            </button>
          ) : (
            <Field label={t.reportIssue}>
              <textarea rows={3} style={{ ...inputStyle(C), resize: 'vertical' }} value={issueText} onChange={(e) => setIssueText(e.target.value)} autoFocus />
              <button onClick={() => setIssueMode(false)} style={{ background: 'transparent', color: C.tl, fontSize: 13, marginTop: 6 }}>{t.cancel}</button>
            </Field>
          )}
        </div>
      )}

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{err}</div>}

      {viewing && (
        <PhotoViewer
          photos={viewing.photos}
          index={viewing.index}
          onIndex={(n) => setViewing((v) => ({ ...v, index: n }))}
          onClose={() => setViewing(null)}
        />
      )}
    </Modal>
  )
}
