import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO } from '../../lib/time'
import { translateToHindi } from '../../lib/translate'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, DEPARTMENTS, DEPARTMENT_MAP, PROPERTIES, propName, deptName,
  memberInProperty, personName, PRIORITIES,
  FREQUENCY_MAP, taskFrequency, frequencyLabel,
  WEEK_DAYS, dayName, dayShort, staffingLabel, monthlyDate, taskDays,
  SHIFTS, hasShifts, shiftLabel,
} from '../../constants/org'
import { Button, Loader, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Toast from '../../components/common/Toast'
import MultiSelect from '../../components/common/MultiSelect'
import Icon from '../../components/common/Icon'
import HindiInput from '../../components/common/HindiInput'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useMediaQuery } from '../../hooks/useMediaQuery'

// A task's time window lives in the existing `time_block` column as free text.
// Storing "09:00 - 10:00" keeps that column working everywhere it is already
// displayed, while letting the roster edit it as two proper time inputs.

// A draft carries its frequency as one label; scheduleText reads the three
// stored columns, so translate before asking it.
const draftSchedule = (d) => ({
  category: d.freq === 'sunday' ? 'weekly' : String(d.freq || 'daily').replace('MS', ''),
  weekDay: d.freq === 'sunday' ? 7 : d.weekDay,
  monthWeek: d.monthWeek,
  skipSunday: String(d.freq || '').endsWith('MS'),
})

// The duty-roster sheet's own columns, in its own order:
//   # | Frequency | Task | Time | Assigned | SOP / Instructions | (actions)
// The sheet has no photo column; that lives in the actions cell as a toggle, so
// the six columns people read stay exactly the six they are used to.
// no FREQUENCY column: the band strip above each group states it once
const COLS = '38px minmax(0,1.3fr) 116px 136px minmax(0,1.5fr) 96px'
// same tracks with a checkbox in front — used only while picking, so the sheet
// keeps its normal width the rest of the time
const COLS_PICK = '34px 38px minmax(0,1.3fr) 116px 136px minmax(0,1.5fr) 96px'
// Phone: no row number, no frequency column (it moves into the task cell), and
// the task column pins to the left while the rest scrolls.
// last column fits three 34px touch targets plus their gaps (34*3 + 6*2 = 114);
// it was 92px, and the department card clips overflow, so the bin disappeared
// phone: Task (with its SOP beneath) | Time | Assigned | actions
const COLS_NARROW = '190px 104px 128px 118px'
const COLS_NARROW_PICK = '34px 170px 104px 128px 118px'

// The flat sheet, in the order the drawing lays it out. Seven 32px day columns
// is the whole point of the layout, so they are fixed and everything else gives
// way around them; the table scrolls sideways rather than crushing them.
// One list of widths, and BOTH the grid template and the table's minimum width
// are derived from it. They were two hand-kept values before, and adding the
// Shift column made them disagree by 146px — past which neither the header nor
// the rows painted a background, so rows showed through the header. A number
// that has to be updated in sympathy with another number will drift; this one
// cannot.
const COL_W = {
  pick: 34, num: 38, task: 260,
  daily: 208, weekly: 96, monthly: 96, day: 32,
  assigned: 150, venue: 104, shift: 124, time: 116, actions: 104,
}
const TASK_W = COL_W.task

const sheetTracks = ({ picking, showVenue }) => [
  picking && COL_W.pick,
  COL_W.num,
  COL_W.task,
  COL_W.daily,
  COL_W.weekly,
  COL_W.monthly,
  ...Array(7).fill(COL_W.day),
  COL_W.assigned,
  showVenue && COL_W.venue,
  COL_W.shift,
  COL_W.time,
  COL_W.actions,
].filter(Boolean)

// The seven bands and the category/skip_sunday/week_day mapping live in
// constants/org.js — the staff task list and the dashboard label tasks from the
// same source, so a job can never read "Sunday only" here and "Weekly" there.
const FREQ_MAP = FREQUENCY_MAP
const freqOf = taskFrequency
const summaryBucket = (fk) => (fk === 'dailyMS' ? 'daily' : fk === 'alternateMS' ? 'alternate' : fk)
// Filtering wants four buckets, not seven chips. "(Mon-Sat)" is a rule about
// Sundays, not a different kind of work, and Sunday-only work IS weekly work —
// so each of those folds into its parent. The Summary still counts Sunday
// separately, because there the split is the point.
const FILTER_BANDS = ['daily', 'alternate', 'weekly', 'monthly']
const filterBucket = (fk) => (fk === 'sunday' ? 'weekly' : summaryBucket(fk))
const freqLabel = (fk, lang) => frequencyLabel(fk, lang).toUpperCase()


// Summary cells: a spreadsheet reads as a grid, so the cells carry the borders.
// one grid for the head, the rows and the totals — three different template
// strings is how a table quietly stops lining up
// the same five buckets, named short enough to fit a phone column
const SUM_SHORT = {
  daily:     { en: 'DAILY', hi: 'रोज़' },
  sunday:    { en: 'SUN',   hi: 'रवि' },
  alternate: { en: 'ALT',   hi: 'बदल' },
  weekly:    { en: 'WEEK',  hi: 'हफ़्ता' },
  monthly:   { en: 'MON',   hi: 'माह' },
}
// Nothing in a row is pinned any more. The department band above each block
// already says which department you are in, and it stays put on its own, so a
// per-row Department column was the same fact twice — paid for with a sticky
// cell that kept letting the scrolling columns slide out from under it.
const stickyCell = (bg) => ({ position: 'sticky', left: 0, zIndex: 1, background: bg })
// Task is deliberately NOT pinned. With Department it took a third of the
// visible width and sat over the day ticks — the columns you scroll sideways
// to reach were the ones it was covering.
const thCell = {
  padding: '11px 10px', fontSize: 10.5, fontWeight: 700, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.1em',
}
const tdCell = { padding: '9px 10px' }
// inputStyle is built for a form field; inside a 100px sheet cell it needs to
// give back the padding and the font size
const miniInput = (C) => ({
  width: '100%', background: C.white, color: C.text,
  border: `1px solid ${C.border}`, borderRadius: 7,
  padding: '5px 4px', fontSize: 11.5, outline: 'none',
})

// The sheet writes 12-hour times — "4:30-5:00 PM", "9:00 AM-5:00 PM" — while
// <input type="time"> speaks 24-hour. Dropping the meridiem, as this used to,
// turned the evening report into 4:30 in the morning. So: parse to 24-hour,
// display back in 12-hour with AM/PM, which is what an admin reads anyway.
const TIME_PART = /(\d{1,2}):(\d{2})\s*([AaPp][Mm]?)?/g

const to24 = (hh, mm, mer) => {
  let h = Number(hh)
  if (mer) {
    const pm = mer[0].toLowerCase() === 'p'
    if (h === 12) h = pm ? 12 : 0        // 12 AM is midnight, 12 PM is noon
    else if (pm) h += 12
  }
  return `${String(h).padStart(2, '0')}:${mm}`
}

const parseRange = (block) => {
  const parts = [...String(block || '').matchAll(TIME_PART)]
  if (!parts.length) return { from: '', to: '' }
  // one meridiem written at the end governs both halves: "4:30-5:00 PM"
  const trailing = parts.map((m) => m[3]).filter(Boolean).pop() || ''
  const at = (i) => (parts[i] ? to24(parts[i][1], parts[i][2], parts[i][3] || trailing) : '')
  let from = at(0)
  const to = at(1)
  // ...except where that reads backwards. "10:30-12:00 PM" is a morning round
  // ending at noon, not a night one. Two rows in the seed depend on this.
  if (from && to && from > to && !parts[0][3]) {
    const h = Number(from.slice(0, 2))
    from = `${String(h >= 12 ? h - 12 : h + 12).padStart(2, '0')}${from.slice(2)}`
  }
  return { from, to }
}

const fmt12 = (hhmm) => {
  const h = Number(hhmm.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3)} ${h >= 12 ? 'PM' : 'AM'}`
}
const fmtRange = (from, to) => (from && to ? `${fmt12(from)} - ${fmt12(to)}` : (from ? fmt12(from) : ''))

// Quarter hours from 5am to 11pm. Every real time in the roster falls on one,
// and the range covers a security shift at either end of the day.
const TIME_SLOTS = (() => {
  const out = []
  for (let h = 5; h <= 23; h++) for (let m = 0; m < 60; m += 15) out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  return out
})()

// Built once. The labels carry no language — a clock face reads the same either
// way — which is what lets the cell below sit behind memo().
const TIME_OPTIONS = TIME_SLOTS.map((v) => ({ v, label: fmt12(v) }))

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const spanLabel = (from, to, t) => {
  if (!from || !to) return ''
  const n = minutesOf(to) - minutesOf(from)
  if (n <= 0) return ''
  const h = Math.floor(n / 60)
  const m = n % 60
  return [h ? `${h} ${t.hourShort}` : null, m ? `${m} ${t.minuteShort}` : null].filter(Boolean).join(' ')
}
// What the stored text becomes once it has been through the two time inputs.
// The roster sheet writes "9:00-10:00 AM"; the inputs give back "9:00 - 10:00".
// Comparing the new value against the RAW text called every row an edit, so a
// roster nobody had touched offered to save 117 changes.
const normRange = (block) => fmtRange(...Object.values(parseRange(block)))

// The seven day columns, Sunday first as the sheet draws them (WEEK_DAYS is
// Monday-first because that is how the database numbers them).
const DAY_COLS = [7, 1, 2, 3, 4, 5, 6]

// 1 -> "1st". Hindi just takes the number — Devanagari ordinals for dates are
// not how anyone writes a monthly rota.
const ordinal = (n, lang) => {
  if (lang === 'hi') return String(n)
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'
  return `${n}${s}`
}

// Which days a row shows as ticked. Weekly means one day; monthly is not a
// weekday pattern at all, so it ticks nothing.
// The ticks belong to Alternate and to nothing else. A daily row shows none:
// asking "which days" of a job that runs every day is the question that made a
// plain daily task draw three ticks, because taskDays() falls back to
// alternateDays() — Mon/Wed/Fri — when a row has no day list of its own.
const altDays = (g) => (['alternate', 'alternateMS'].includes(freqOf(g)) ? taskDays(g) : [])

// A row runs on ONE schedule. Each setter therefore clears the other three
// rather than layering on top of them — a sheet that let a job claim both
// "daily" and "every Wednesday" would be lying about what the staff will see.
const BLANK = { weekDays: null, weekDay: '', monthWeek: '', skipSunday: false }
const setDaily = (v) => (v === 'dailyMS'
  ? { ...BLANK, category: 'daily', skipSunday: true }
  : { ...BLANK, category: 'daily' })
const setWeekly = (d) => ({ ...BLANK, category: 'weekly', weekDay: Number(d) })
const setMonthly = (w) => ({ ...BLANK, category: 'monthly', monthWeek: Number(w) })
// Saturday and Sunday, and nothing else — the shortcut's "on" state. Reading it
// off the days rather than a category keeps it honest: tick Sat and Sun by hand
// and the button lights up too, because that is the same schedule.
const isWeekendOnly = (g) => {
  const d = ['alternate', 'alternateMS'].includes(freqOf(g)) ? taskDays(g) : []
  return d.length === 2 && d.includes(6) && d.includes(7)
}

const setAlternate = (days) => {
  const d = [...new Set(days.map(Number))].sort((a, b) => a - b)
  return { ...BLANK, category: 'alternate', weekDays: d, skipSunday: !d.includes(7) }
}

// Start and end, stacked. Behind memo() and deliberately given no `lang`:
// these 152 options are the most expensive thing on the sheet and the language
// toggle has no business rebuilding them.
// Start and end. Text until you click it.
//
// Two selects of 76 options each is 152 elements per row; on a 125-row sheet
// that is 19,000 of them, ~90% of everything the table renders, and it is what
// made the roster slow to open and slow to re-language. A cell nobody is editing
// does not need a picker — so it is a line of text, and the selects appear on
// the one cell being edited.
//
// Behind memo() with no `lang` prop: a clock face reads the same in both
// languages, so switching cannot invalidate these.
const TimeCell = memo(function TimeCell({ C, gKey, from, to, pick, onPatch }) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <span style={tdCell}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            width: '100%', textAlign: 'left', background: 'transparent',
            padding: 0, fontSize: 11.5, fontWeight: 600,
            color: from ? C.text : C.faint, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtRange(from, to) || pick}
        </button>
      </span>
    )
  }

  return (
    <span style={{ ...tdCell, display: 'grid', gap: 3 }}>
      <select
        autoFocus
        style={miniInput(C)}
        value={from || ''}
        // a start past the end would leave a negative block
        onChange={(e) => onPatch(gKey, { from: e.target.value, to: to && e.target.value && e.target.value >= to ? '' : to })}
      >
        <option value="">{pick}</option>
        {TIME_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <select
        style={miniInput(C)}
        value={to || ''}
        onChange={(e) => onPatch(gKey, { to: e.target.value })}
        onBlur={() => setEditing(false)}
      >
        <option value="">{pick}</option>
        {TIME_OPTIONS.filter((o) => !from || o.v > from).map((o) => (
          <option key={o.v} value={o.v}>{o.label}</option>
        ))}
      </select>
    </span>
  )
})

// Roster: one screen to hand out a venue's recurring work.
//
// A task row carries exactly ONE assignee, so "three people water the lawn" is
// three rows with the same title — which is why the task list shows apparent
// duplicates. The roster hides that: it groups rows by title and lets you pick
// several people per job. On save it reconciles the group — a person added gets
// a new row, a person removed loses theirs.
//
// Removing someone DELETES their row only while it is untouched (still pending,
// no photos, never started). Once there is work recorded against it the row is
// merely unassigned, because deleting would throw away that history.
export default function RosterModal({ user, members, canSeeAllProps, defaultProperty, inline, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const confirm = useConfirm()
  const wide = useMediaQuery('(min-width: 760px)')
  // A 13px icon with 1px of padding is a mouse target. A finger needs ~34px, so
  // the row actions grow on a phone instead of asking for a precise tap.
  const iconSize = wide ? 17 : 18
  const sumLabel = (k) => (wide ? freqLabel(k, lang) : (lang === 'hi' ? SUM_SHORT[k].hi : SUM_SHORT[k].en))
  const today = todayISO()
  // How far down the sticky filter bar has to sit. The app header is sticky at
  // top: 0, so anything else pinned to 0 disappears behind it — and its height
  // differs between phone and desktop, so it is measured, not assumed.
  const [headerH, setHeaderH] = useState(0)
  const listRef = useRef(null)
  const barRef = useRef(null)
  useEffect(() => {
    const measure = () => setHeaderH(document.querySelector('header')?.offsetHeight || 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const tapTarget = {
    background: 'transparent', display: 'grid', placeItems: 'center',
    width: wide ? 26 : 34, height: wide ? 26 : 34,
    borderRadius: 8, flexShrink: 0,
  }

  // several venues at once: the same daily round usually applies to more than
  // one, and setting it up venue by venue is how they drift apart
  const [props, setProps] = useState([defaultProperty || PROPERTIES[0].code])
  const [freqFilter, setFreqFilter] = useState('all')  // which frequency band is shown
  const [rows, setRows] = useState([])        // every task row for these venues
  const [groups, setGroups] = useState([])    // one per distinct job, with its chosen people
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // group keys ticked for bulk deletion; `picking` shows the checkbox column
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [err, setErr] = useState('')
  const [deptTab, setDeptTab] = useState('all')       // which department's round is shown
  const [expandedKey, setExpandedKey] = useState(null) // row whose people picker is open
  const [form, setForm] = useState(null)               // add/edit form, null = closed
  const [saved, setSaved] = useState(false)            // the 'changes saved' toast

  const [deployed, setDeployed] = useState([])        // user ids on cover here today

  // People already lent to these venues show up without ticking anything — the
  // cover was arranged once and should hold until its end date passes.
  useEffect(() => {
    let alive = true
    const today = todayISO()
    supabase.from('staff_deployments')
      .select('user_id, property, from_date, to_date')
      .in('property', props)
      .lte('from_date', today)
      .then(({ data }) => {
        if (!alive) return
        setDeployed((data || [])
          .filter((d) => !d.to_date || d.to_date >= today)
          .map((d) => d.user_id))
      })
    return () => { alive = false }
  }, [props])
  // Anyone who ALREADY has work here is always listed, whichever venue they are
  // based at. Without this their chip is missing while the head count still
  // includes them: the job reads "1 people" with nothing ticked, and "Fill empty
  // rows" skips it as already covered.
  const assignedHere = useMemo(
    () => new Set(rows.filter((r) => r.assigned_to).map((r) => r.assigned_to)),
    [rows]
  )
  // Someone holding work here who is no longer in the assignable list at all —
  // deactivated, or moved out of an assignable role. They cannot be looked up, so
  // the chip is rebuilt from the name stored on the task itself. Without this the
  // head count includes a person no chip can show, and the two disagree forever.
  const formerStaff = useMemo(() => {
    const known = new Set(members.map((m) => m.id))
    const out = new Map()
    rows.forEach((r) => {
      if (r.assigned_to && !known.has(r.assigned_to) && !out.has(r.assigned_to)) {
        out.set(r.assigned_to, { id: r.assigned_to, name: r.assignee_name || '—', inactive: true })
      }
    })
    return [...out.values()]
  }, [rows, members])

  // Everyone is listed, whichever venue they are based at — a job at one venue
  // often has to go to someone from another, and hunting for a switch first was
  // the slow part. Those from elsewhere are labelled with their own venue, and
  // the cover dates below record the arrangement.
  const staff = useMemo(() => [...members, ...formerStaff], [members, formerStaff])
  // find() inside a map is a scan per person per row; the sheet asks this
  // question a few hundred times on every render
  const staffById = useMemo(() => new Map(staff.map((m) => [m.id, m])), [staff])

  // someone on this roster who is not based at any of the selected venues
  const isVisiting = useCallback(
    (m) => !!m && !props.some((code) => memberInProperty(m, code)),
    [props]
  )

  const load = useCallback(async () => {
    setLoading(true)
    // The whole roster at once, like the sheet: every frequency, grouped by
    // department. Loading one category at a time made the Summary impossible and
    // meant four separate reads of what is one document.
    const { data } = await supabase
      .from('tasks')
      .select('id, title, title_hi, description, category, property, department, assigned_to, assignee_name, area, time_block, photo_required, week_day, week_days, month_week, skip_sunday, staffing, priority, due_date, shift, status, started_at, before_photo, completion_photo')
      .in('property', props)
      .order('time_block', { ascending: true, nullsFirst: false })
      .order('title')
    setRows(data || [])
    // one entry per distinct job; `people` is the set currently doing it
    const byTitle = new Map()
    ;(data || []).forEach((r) => {
      // department belongs in the key: Admin's "Full Safety Audit" and
      // Security's are two different jobs that happen to share a name, and
      // merging them silently dropped rows from the roster and the Summary
      const key = `${r.property}||${r.department}||${r.category}||${r.title}||${r.area || ''}`
      if (!byTitle.has(key)) byTitle.set(key, {
        key, property: r.property, title: r.title, title_hi: r.title_hi, area: r.area,
        category: r.category, sop: r.description || '', staffing: r.staffing || '',
        time_block: r.time_block, department: r.department, weekDay: r.week_day || '',
        monthWeek: r.month_week || '', skipSunday: !!r.skip_sunday,
        weekDays: Array.isArray(r.week_days) && r.week_days.length ? r.week_days.map(Number) : null,
        priority: r.priority || 'medium', dueDate: r.due_date || '', shift: r.shift || '',
        photoRequired: r.photo_required !== false, rows: [],
      })
      byTitle.get(key).rows.push(r)
    })
    setGroups([...byTitle.values()].map((g) => ({
      ...g,
      ...parseRange(g.time_block),
      people: g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to),
    })))
    setLoading(false)
  }, [props])

  useEffect(() => { load() }, [load])

  // One small form for both adding and editing a row. Inline inputs inside a
  // five-column grid were unusable on anything narrow, and a row being edited
  // looked nothing like a row being read.
  const openAdd = () => setForm({
    mode: 'add', dept: deptTab === 'all' ? '' : deptTab,
    title: '', titleHi: '', from: '', to: '', photoRequired: true, people: [], weekDay: '',
    // a new row states its own frequency now that the roster shows them all at once
    freq: freqFilter === 'all' ? 'daily' : freqFilter, monthWeek: '', sop: '', staffing: '',
    priority: 'medium', dueDate: '', weekDays: null,
    // a common task ignores the property filter and lands at every venue
    allProps: false,
  })
  const openEdit = (g) => setForm({
    mode: 'edit', key: g.key, dept: g.department || '',
    title: g.title, titleHi: g.title_hi || '', from: g.from || '', to: g.to || '',
    photoRequired: g.photoRequired !== false, people: g.people, weekDay: g.weekDay || '',
    freq: freqOf(g), monthWeek: g.monthWeek || '', sop: g.sop || '', staffing: g.staffing || '',
    priority: g.priority || 'medium', dueDate: g.dueDate || '',
    weekDays: g.weekDays || null,
  })

  // A new job is written now; an edit to an existing one still goes through the
  // roster's Save with the rest of the pending changes. Different actions: one
  // creates a thing, the other amends a sheet you are part-way through editing.
  async function applyForm(v) {
    if (v.mode === 'add') {
      // the dialog stays open on failure, so nothing typed is lost
      if (await createJob(v)) setForm(null)
      return
    }
    setGroups((prev) => prev.map((g) => (g.key !== v.key ? g : {
      ...g, title: v.title, title_hi: v.titleHi, from: v.from, to: v.to,
      photoRequired: v.photoRequired, people: v.people,
      sop: v.sop, staffing: v.staffing, monthWeek: v.monthWeek,
      priority: v.priority, dueDate: v.dueDate, weekDays: v.weekDays,
      ...freqSpec(v.freq, v.weekDay),
    })))
    setForm(null)
  }

  // One frequency label -> the three columns that actually store it. Sunday-only
  // work IS a weekly task on day 7; "(Mon-Sat)" is the skip_sunday flag. week_day
  // is only meaningful for weekly, so it is cleared for everything else rather
  // than left behind to confuse the nightly reset.
  const freqSpec = (fk, weekDay) => {
    const category = fk === 'sunday' ? 'weekly'
      : fk === 'dailyMS' ? 'daily'
      : fk === 'alternateMS' ? 'alternate' : fk
    return {
      category,
      skipSunday: fk === 'dailyMS' || fk === 'alternateMS',
      weekDay: fk === 'sunday' ? 7 : (category === 'weekly' ? (weekDay || 1) : ''),
    }
  }

  const renameGroup = (key, title) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, title } : g)))

  // useCallback with no deps: setGroups is stable, so this identity never
  // changes — which is what lets memo() on TimeCell actually hold.
  const setGroupTime = useCallback((key, patch) => {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  }, [])

  // Narrowing the list is only half the job: if the screen still shows the
  // summary afterwards, nothing appears to have happened. Scroll to the work,
  // stopping clear of the app header and the filter bar that sit over it.
  const goToList = () => {
    const el = listRef.current
    if (!el) return
    const offset = headerH + (barRef.current?.offsetHeight || 0) + 8
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
  }
  const pickDept = (code) => { setDeptTab(code); requestAnimationFrame(goToList) }

  // which department's round is on screen, and which frequency band
  // Filter on the SAVED row, not the edited group — the same reason the sort
  // does. With a frequency filter on, ticking a day changed the category and
  // the row failed its own filter mid-edit and vanished from under the cursor.
  // The filter re-applies on the next load, once the change has been saved.
  const shownGroups = useMemo(
    () => groups.filter((g) => {
      const r = g.rows[0] || {}
      const dept = r.department ?? g.department
      const fk = r.category ? freqOf(r) : freqOf(g)
      return (deptTab === 'all' || dept === deptTab)
        && (freqFilter === 'all' || filterBucket(fk) === freqFilter)
    }),
    [groups, deptTab, freqFilter]
  )

  // The sheet's own shape: department band, then a block per frequency inside it,
  // each block numbered and time-ordered. Reading it that way is the whole point —
  // "what does housekeeping do every day" is one block, not a filter.
  // Department, then frequency, then time — and the bands that say so. Sorting
  // alone was not enough at 459 rows: nothing marked where one department ended.
  const sheetRows = useMemo(() => {
    const deptOrder = DEPARTMENTS.map((d) => d.code)
    // Department, then the clock. Frequency used to be the second key, which
    // grouped the block into runs of daily / alternate / weekly — the sub-blocks
    // the bands used to label. A department now reads as one shift from morning
    // to evening, which is how the printed roster is worked through, and each
    // row says its own frequency on its chip.
    //
    // Sort on the SAVED row, not the edited group: ticking a day changes the
    // frequency, and ranking on live values would slide the row out from under
    // the cursor mid-edit. The sheet settles on the next load.
    const saved = (g) => g.rows[0] || {}
    const deptRank = (g) => {
      const d = saved(g).department ?? g.department
      return deptOrder.indexOf(d) < 0 ? 99 : deptOrder.indexOf(d)
    }
    // Sort on the PARSED start, not the raw text. A monthly row's time_block
    // reads "1st Week", and comparing that as a string drops it between 12:15
    // and 2:00 because both begin with a "1". Parsed, it has no clock time at
    // all and sinks to the end of its department, which is where a job with no
    // hour belongs.
    const startOf = (g) => parseRange(saved(g).time_block).from
    return [...shownGroups].sort((a, b) => {
      const sa = startOf(a)
      const sb = startOf(b)
      return deptRank(a) - deptRank(b)
        || (sa ? 0 : 1) - (sb ? 0 : 1)
        || sa.localeCompare(sb)
        || (a.title || '').localeCompare(b.title || '')
    })
  }, [shownGroups])

  // The same rows, cut into department blocks and frequency blocks inside them.
  // Derived from sheetRows so the bands and the order can never disagree.
  //
  // The numbering runs straight down the department, not restarting inside each
  // frequency block — that is how the printed sheet numbers it, and a second "1"
  // a few rows below the first reads as a mistake.
  const sections = useMemo(() => {
    const out = []
    let dept = null
    let nInDept = 0
    let dRef = null
    sheetRows.forEach((g) => {
      const d = (g.rows[0] || {}).department ?? g.department ?? '_'
      if (d !== dept) {
        dept = d; nInDept = 0
        dRef = { kind: 'dept', key: 'd:' + d, dept: d, n: 0 }
        out.push(dRef)
      }
      nInDept += 1
      dRef.n += 1
      out.push({ kind: 'row', key: g.key, g, no: nInDept })
    })
    return out
  }, [sheetRows])

  // The Summary sheet: how much work each department carries, by frequency.
  // Counted from the whole roster, never from the filtered view — a summary that
  // changes when you click a chip is not a summary.

  // removes the job from EVERY person at this venue, not just one of them
  async function deleteGroup(g) {
    const ok = await confirm({
      message: t.deleteJobConfirm.replace('{n}', g.rows.length),
      detail: g.title,
      confirmLabel: t.delete,
    })
    if (!ok) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('tasks').delete().in('id', g.rows.map((r) => r.id))
    setBusy(false)
    if (error) { setErr(error.message); return }
    load()
  }

  const togglePick = (key) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Ticks are kept across filter changes, and resolved against the WHOLE roster:
  // tick four rows, switch department, tick two more, delete six. Scoping this to
  // shownGroups instead would silently drop the first four when the filter moved,
  // and a selection that shrinks on its own is worse than one that persists.
  // ("Select all" below is a different matter — that one only ever takes what is
  // on screen.)
  const pickedGroups = useMemo(
    () => groups.filter((g) => picked.has(g.key)),
    [groups, picked]
  )
  const pickedTaskCount = useMemo(
    () => pickedGroups.reduce((n, g) => n + g.rows.length, 0),
    [pickedGroups]
  )
  const allShownPicked = shownGroups.length > 0 && shownGroups.every((g) => picked.has(g.key))

  // leaving selection mode must not leave a hidden selection armed
  const stopPicking = () => { setPicking(false); setPicked(new Set()) }

  async function deletePicked() {
    if (!pickedGroups.length) return
    const ok = await confirm({
      message: t.deleteJobsConfirm.replace('{n}', pickedGroups.length).replace('{r}', pickedTaskCount),
      detail: pickedGroups.slice(0, 6).map((g) => g.title).join(', ')
        + (pickedGroups.length > 6 ? ` +${pickedGroups.length - 6}` : ''),
      confirmLabel: t.delete,
    })
    if (!ok) return
    setBusy(true); setErr('')
    const ids = pickedGroups.flatMap((g) => g.rows.map((r) => r.id))
    const { error } = await supabase.from('tasks').delete().in('id', ids)
    setBusy(false)
    if (error) { setErr(error.message); return }
    stopPicking()
    load()
  }

  const togglePerson = (key, id) =>
    setGroups((prev) => prev.map((g) => (g.key !== key ? g : {
      ...g,
      people: g.people.includes(id) ? g.people.filter((x) => x !== id) : [...g.people, id],
    })))

  // a row is safe to delete only while nothing has happened on it yet
  const untouched = (r) =>
    r.status === TASK_STATUS.PENDING && !r.started_at
    && !(r.before_photo?.length) && !(r.completion_photo?.length)

  // what each group needs on save: people to add, rows to drop
  const plan = useMemo(() => groups.map((g) => {
    const before = g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to)
    const added = g.people.filter((id) => !before.includes(id))
    const dropped = g.rows.filter((r) => r.assigned_to && !g.people.includes(r.assigned_to))
    // a job nobody is on keeps one spare row rather than vanishing entirely
    const spare = g.rows.find((r) => !r.assigned_to)
    const renamed = g.title.trim() && g.title.trim() !== g.rows[0]?.title
    // the Hindi can change on its own — a correction to the machine's guess
    const rehindied = (g.title_hi || '') !== (g.rows[0]?.title_hi || '')
    const reprioed = (g.priority || 'medium') !== (g.rows[0]?.priority || 'medium')
    const redued = (g.dueDate || '') !== (g.rows[0]?.due_date || '')
    const redaysed = JSON.stringify(g.weekDays || null)
      !== JSON.stringify(g.rows[0]?.week_days?.length ? g.rows[0].week_days.map(Number) : null)
    const retimed = fmtRange(g.from, g.to) !== normRange(g.rows[0]?.time_block)
    const rephotoed = g.photoRequired !== (g.rows[0]?.photo_required !== false)
    const redayed = String(g.weekDay || '') !== String(g.rows[0]?.week_day || '')
    const refreqed = g.category !== g.rows[0]?.category
      || !!g.skipSunday !== !!g.rows[0]?.skip_sunday
      || String(g.monthWeek || '') !== String(g.rows[0]?.month_week || '')
    const resopped = (g.sop || '') !== (g.rows[0]?.description || '')
      || (g.staffing || '') !== (g.rows[0]?.staffing || '')
    // Moving a job to another venue rewrites property on every copy of it.
    const removed = (g.property || '') !== (g.rows[0]?.property || '')
    const reshifted = (g.shift || '') !== (g.rows[0]?.shift || '')
    return { g, added, dropped, spare, renamed, rehindied, retimed, rephotoed, redayed, refreqed, resopped, reprioed, redued, redaysed, removed, reshifted }
  }), [groups])

  const addCount = plan.reduce((n, x) => n + x.added.length, 0)
  const dropCount = plan.reduce((n, x) => n + x.dropped.length, 0)
  // The plan already works out what changed on every group; the sheet just
  // needs the yes/no so it can tint the row.
  const editedKeys = useMemo(() => new Set(
    plan.filter((x) => x.added.length || x.dropped.length || x.renamed || x.rehindied
      || x.retimed || x.rephotoed || x.redayed || x.refreqed || x.resopped
      || x.reprioed || x.redued || x.redaysed || x.removed || x.reshifted).map((x) => x.g.key)
  ), [plan])
  const isEdited = (g) => editedKeys.has(g.key)

  const renameCount = plan.filter((x) => x.renamed || x.rehindied || x.reprioed || x.redued || x.redaysed || x.retimed || x.rephotoed || x.redayed || x.refreqed || x.resopped || x.removed || x.reshifted).length
  const nothingToSave = addCount + dropCount + renameCount === 0

  async function save() {
    setBusy(true); setErr('')
    try {
      const hiFor = async (title) => {
        try { return await translateToHindi(title) } catch { return null }
      }

      for (const { g, added, dropped, spare, renamed, rehindied, retimed, rephotoed, redayed, refreqed, resopped, reprioed, redued, redaysed, removed, reshifted } of plan) {
        // anything about the JOB itself — its wording, window, photo rule, day,
        // frequency or SOP — applies to every copy of it
        if (renamed || rehindied || retimed || rephotoed || redayed || refreqed || resopped || reprioed || redued || redaysed || removed || reshifted) {
          const patch = {}
          if (renamed) patch.title = g.title.trim()
          // What is in the box is what gets saved. Only fall back to translating
          // here if the box is empty — otherwise a hand-corrected Hindi title
          // would be overwritten by the machine on every rename.
          if (renamed || rehindied) {
            patch.title_hi = (g.title_hi || '').trim() || await hiFor(g.title.trim())
          }
          if (retimed) patch.time_block = fmtRange(g.from, g.to) || null
          if (rephotoed) patch.photo_required = g.photoRequired
          if (reprioed) patch.priority = g.priority || 'medium'
          if (redued) patch.due_date = g.dueDate || null
          if (redaysed) patch.week_days = g.weekDays?.length ? g.weekDays : null
          if (redayed) patch.week_day = g.weekDay ? Number(g.weekDay) : null
          if (refreqed) {
            patch.category = g.category
            patch.skip_sunday = !!g.skipSunday
            patch.month_week = g.category === 'monthly' && g.monthWeek ? Number(g.monthWeek) : null
            patch.week_day = g.category === 'weekly' ? Number(g.weekDay || 1) : null
          }
          if (resopped) {
            patch.description = g.sop?.trim() || null
            patch.staffing = g.staffing?.trim() || null
          }
          if (removed) patch.property = g.property
          if (reshifted) patch.shift = g.shift || null
          const { error } = await supabase.from('tasks')
            .update(patch)
            .in('id', g.rows.map((r) => r.id))
          if (error) throw error
        }
        // people removed: reuse an untouched row by unassigning nothing —
        // delete it outright; keep it (unassigned) once work exists on it
        for (const r of dropped) {
          if (untouched(r)) {
            const { error } = await supabase.from('tasks').delete().eq('id', r.id)
            if (error) throw error
          } else {
            const { error } = await supabase.from('tasks')
              .update({ assigned_to: null, assignee_name: null }).eq('id', r.id)
            if (error) throw error
          }
        }
        // people added: the spare unassigned row takes the first one, the rest
        // become new rows — so a job never accumulates empty duplicates
        let reuse = spare && !dropped.includes(spare) ? spare : null
        for (const id of added) {
          const person = staff.find((m) => m.id === id)
          if (reuse) {
            const { error } = await supabase.from('tasks')
              .update({ assigned_to: id, assignee_name: person?.name || null }).eq('id', reuse.id)
            if (error) throw error
            reuse = null
          } else {
            const { error } = await supabase.from('tasks').insert({
              id: newId('t_'),
              property: g.property,
              department: g.department || person?.department || user.department || 'k',
              // a second person on the SAME job gets the same everything —
              // frequency, window, SOP, photo rule — or the roster would show one
              // job split across two frequency bands
              category: g.category,
              title: g.title,
              title_hi: (g.title_hi || '').trim() || await hiFor(g.title),
              description: g.sop?.trim() || null,
              staffing: g.staffing?.trim() || null,
              area: g.area || null,
              time_block: fmtRange(g.from, g.to) || null,
              week_day: g.category === 'weekly' ? Number(g.weekDay || 1) : null,
              month_week: g.category === 'monthly' && g.monthWeek ? Number(g.monthWeek) : null,
              skip_sunday: !!g.skipSunday,
              photo_required: g.photoRequired !== false,
              priority: g.priority || 'medium',
              due_date: g.dueDate || null,
              week_days: g.weekDays?.length ? g.weekDays : null,
              assigned_to: id,
              assignee_name: person?.name || null,
              status: TASK_STATUS.PENDING,
              task_date: todayISO(),
            })
            if (error) throw error
          }
        }
      }

      // Anyone from outside these venues who has just been given work here is
      // recorded as being on cover, so tomorrow's roster still lists them
      // without the "other venues" switch. Dates are optional: no end date
      // means until further notice.
      const visitors = [...new Set(
        plan.flatMap(({ added }) => added)
      )].filter((id) => isVisiting(staff.find((m) => m.id === id)))
      if (visitors.length) {
        const rows = visitors.flatMap((id) => props.map((prop) => ({
          user_id: id,
          property: prop,
          // open-ended from today; the Cover screen is where dates get set
          from_date: todayISO(),
          to_date: null,
          created_by: user.id,
        })))
        // ignore a failure here: the assignment itself already succeeded, and a
        // missing cover record must not undo it
        await supabase.from('staff_deployments')
          .upsert(rows, { onConflict: 'user_id,property,from_date' })
      }

      // Re-read from the database rather than trusting what is in memory: the
      // save has just rewritten these rows, and a stale count on the button is
      // how you end up saving the same change twice.
      setForm(null)
      setExpandedKey(null)
      await load()
      setSaved(true)
      onSaved?.()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  // Writes one new job straight to the database — called from the Add dialog,
  // not from save(). Creating is a complete action on its own; leaving it half
  // done in a pending row is what made it look like it had failed.
  async function createJob(d) {
    setBusy(true); setErr('')
    try {
      const title = d.title.trim()
      const title_hi = (d.titleHi || '').trim() || await hiFor(title)
      // A common task goes everywhere; a normal one follows the sheet's filter.
      const venues = d.allProps ? PROPERTIES.map((pp) => pp.code) : props
      const chosen = d.people?.length ? d.people : []
      const combos = venues.flatMap((prop) => {
        if (!chosen.length) return [{ prop, id: null }]
        // People belong to venues. Copying the whole picked list to all five
        // would put a Pushpanjali gardener on the Restro round; each person
        // only lands where they actually work. (Someone on 'all' — Sandeep —
        // matches every venue, which is correct.)
        const here = d.allProps
          ? chosen.filter((id) => memberInProperty(staff.find((m) => m.id === id), prop))
          : chosen
        // no one picked for this venue: leave a row for its admin to fill,
        // rather than skipping the venue and calling it common
        return here.length ? here.map((id) => ({ prop, id })) : [{ prop, id: null }]
      })
      // the row states its own frequency; sunday-only becomes weekly on day 7
      const spec = freqSpec(d.freq || 'daily', d.weekDay)
      const inserts = combos.map(({ prop, id }) => {
        const person = staff.find((m) => m.id === id)
        return {
          id: newId('t_'),
          property: prop,
          // the department the WORK belongs to, which is not always the
          // department of whoever happens to be covering it
          department: d.dept || person?.department || user.department || 'k',
          category: spec.category,
          title,
          title_hi,
          description: d.sop?.trim() || null,
          staffing: d.staffing?.trim() || null,
          time_block: fmtRange(d.from, d.to) || null,
          photo_required: d.photoRequired !== false,
          week_day: spec.category === 'weekly' ? Number(spec.weekDay || 1) : null,
          week_days: spec.category === 'alternate' && d.weekDays?.length ? d.weekDays : null,
          month_week: spec.category === 'monthly' && d.monthWeek ? Number(d.monthWeek) : null,
          skip_sunday: !!spec.skipSunday,
          priority: 'medium',
          assigned_to: id || null,
          assignee_name: person?.name || null,
          status: TASK_STATUS.PENDING,
          task_date: todayISO(),
        }
      })
      const { error } = await supabase.from('tasks').insert(inserts)
      if (error) throw error
      await load()
      setSaved(true)
      onSaved?.()
      return true
    } catch (e) {
      setErr(e.message || String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  // Discarding is not "close" when there is nothing to close: on the tab it
  // means throw away the unsaved edits and re-read the roster.
  const discard = () => { setForm(null); setExpandedKey(null); load() }

  // With one venue selected every row would repeat its name — the filter at the
  // top already said it once. The column returns the moment there are two.
  const showVenue = props.length > 1
  const tracks = sheetTracks({ picking, showVenue })
  const flatCols = tracks.map((n) => `${n}px`).join(' ')
  const gridMin = tracks.reduce((a, b) => a + b, 0)

  // one source of truth for the row tracks, so a checkbox column can never
  // appear in the header and not in the rows
  const gridCols = picking
    ? (wide ? COLS_PICK : COLS_NARROW_PICK)
    : (wide ? COLS : COLS_NARROW)

  // Replaces the save footer while picking. Two bars stacked would put Save and
  // "Delete selected" side by side, and they are not the same kind of action.
  const pickBar = (
    <>
      <Button variant="ghost" onClick={stopPicking} style={{ flex: 1 }}>{t.cancel}</Button>
      <Button
        variant="danger"
        onClick={deletePicked}
        disabled={busy || pickedGroups.length === 0}
        style={{ flex: 2 }}
      >
        <Icon name="trash" size={15} color="#fff" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
        {pickedGroups.length === 0
          ? t.deleteSelected
          : `${t.deleteSelected} (${pickedGroups.length})`}
      </Button>
    </>
  )

  const footer = (
    <>
      <Button variant="ghost" onClick={inline ? discard : onClose} disabled={inline && nothingToSave} style={{ flex: 1 }}>
        {inline ? t.discardChanges : t.cancel}
      </Button>
      <Button variant="primary" onClick={save} disabled={busy || nothingToSave} style={{ flex: 2 }}>
        {nothingToSave ? t.save : `${t.save} (${addCount + dropCount + renameCount})`}
      </Button>
    </>
  )

  const body = (
    <>
      {/* Venue, frequency and department in one bar that follows the page. They
          used to sit on either side of the summary, so narrowing a 121-row list
          meant scrolling back to the top for every change.
          Each chip row scrolls sideways instead of wrapping: on a phone, wrapping
          turned the bar into a third of the screen. */}
      <div
        ref={barRef}
        style={{
          position: 'sticky', top: headerH, zIndex: 60,
          // opaque, not the page tint: rows scroll underneath this and any
          // translucency reads as a rendering fault
          background: C.card,
          padding: '10px 12px',
          margin: '0 -12px 10px',
          borderBottom: `1px solid ${C.borderStrong}`,
          boxShadow: '0 6px 12px -8px rgba(15,23,42,0.18)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Off by default: this sheet is read far more than it is pruned, and a
              standing column of checkboxes beside a delete icon invites a slip. */}
          <button
            type="button"
            onClick={() => (picking ? stopPicking() : setPicking(true))}
            aria-pressed={picking}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '8px 13px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              background: picking ? C.maroon : C.card,
              color: picking ? '#fff' : C.tl,
              border: `1px solid ${picking ? C.maroon : C.borderStrong}`,
              cursor: 'pointer',
            }}
          >
            <Icon name={picking ? 'close' : 'check'} size={14} color={picking ? '#fff' : C.tl} />
            {picking ? t.cancel : t.selectRows}
          </button>
          {canSeeAllProps && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: wide ? '1 1 190px' : '1 1 100%', minWidth: 0 }}>
              <Icon name="pin" size={15} color={C.tl} />
              <MultiSelect
                C={C}
                placeholder={t.properties}
                options={PROPERTIES.map((p) => ({ value: p.code, label: propName(p.code, lang) }))}
                selected={props}
                // never leave the roster with nothing selected — it would show an
                // empty table with no way to tell why
                onChange={(next) => setProps(next.length ? next : props)}
              />
            </div>
          )}

          {/* Selects, not chips: ten chips over two sideways-scrolling rows took a
              third of a phone screen and still hid half of themselves. */}
          <div style={{ flex: wide ? '1 1 150px' : '1 1 calc(50% - 4px)', minWidth: 0 }}>
            <MultiSelect
              single
              minWidth={wide ? 150 : 0}
              C={C}
              placeholder={t.allFrequencies}
              options={[{ value: 'all', label: t.allFrequencies }, ...FILTER_BANDS.map((k) => ({ value: k, label: freqLabel(k, lang) }))]}
              selected={[freqFilter]}
              onChange={([v]) => setFreqFilter(v || 'all')}
            />
          </div>

          {/* The summary above narrows by department in one tap; this is where the
              active one stays visible once the summary has scrolled away — which
              is exactly when you need to know what is filtered. */}
          <div style={{ flex: wide ? '1 1 150px' : '1 1 calc(50% - 4px)', minWidth: 0 }}>
            <MultiSelect
              single
              minWidth={wide ? 150 : 0}
              C={C}
              placeholder={t.allDepts}
              options={[{ value: 'all', label: t.allDepts }, ...DEPARTMENTS.map((d) => ({ value: d.code, label: deptName(d.code, lang) }))]}
              selected={[deptTab]}
              onChange={([v]) => pickDept(v || 'all')}
            />
          </div>
        </div>
      </div>

      {/* "Assign all to …" and the cover-dates switch are both gone. Cover has
          its own screen now (Daily Task -> Cover), with the arrangement listed
          and revocable; a checkbox buried in the roster could neither show who
          was covering where nor end it. Lending someone to another venue's round
          still records the cover automatically — see save(). */}
      {/* The note explains what the sheet below does and the button acts on it,
          so they share a line: the note reads left, the button sits at the right
          edge of the sheet it adds to. Stacked, the button floated alone above a
          full-width paragraph and belonged to neither. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <span style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, flex: '1 1 320px', minWidth: 0 }}>
          {t.rosterNote}
        </span>
        <Button variant="primary" onClick={openAdd} style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }}>
          <Icon name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />{t.addTaskRow}
        </Button>
      </div>

      {loading ? <Loader label={t.loading} /> : (
        <>
          {shownGroups.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.tl, padding: '14px 2px' }}>{t.rosterEmpty}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {/* One flat sheet. Every column the roster is read by is a column:
                  department, task, the seven days, weekly, monthly, who, where,
                  when. The department bands and frequency headers are gone —
                  they repeated on every block what each row already says. */}
              {/* The sheet scrolls inside itself, both ways. It has to: a sticky
                  header cannot stick to the page from inside an overflow
                  container — setting overflow-x also makes the box a vertical
                  scrollport, and sticky then anchors to that box. Giving the box
                  a height turns that from a bug into the behaviour we want, and
                  the header parks at its top edge. */}
              <div
                ref={listRef}
                style={{
                  // Horizontal only, and no height cap. With one, the box had
                  // vertical overflow of its own and swallowed the page's scroll
                  // whenever the pointer was over the sheet — which is most of
                  // the screen. Without it there is nothing to scroll vertically
                  // inside the box, so the wheel goes to the page where it
                  // belongs. The cost is the header, which can no longer stick:
                  // sticky resolves against the nearest scrollport, and that is
                  // this box, not the page.
                  overflowX: 'auto',
                  border: `1px solid ${C.borderStrong}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ minWidth: gridMin }}>

                  <div style={{
                    display: 'grid', gridTemplateColumns: flatCols,
                    background: C.cardAlt, borderBottom: `1px solid ${C.borderStrong}`,
                    // no sticky: see the wrapper — the box is the scrollport,
                    // so sticking to its top would pin the header to a line that
                    // does not move
                    zIndex: 30,
                  }}>
                    {picking && <span style={thCell} />}
                    <span style={{ ...thCell, textAlign: 'center' }}>#</span>
                    <span style={thCell}>{t.task}</span>
                    <span style={thCell}>{t.frequency}</span>
                    <span style={thCell}>{t.weekly}</span>
                    <span style={thCell}>{t.monthly}</span>
                    {/* The seven day letters, on one line. They carry the
                        alternate ink so the group reads as one column without a
                        word above it — "ALTERNATE" over a 32px cell made the
                        first header two lines tall and knocked the letters out
                        of line with each other. */}
                    {DAY_COLS.map((d) => (
                      <span key={d} style={{ ...thCell, textAlign: 'center', padding: '11px 2px', color: FREQ_MAP.alternate.ink }}>
                        {dayShort(d, lang).slice(0, lang === 'hi' ? 2 : 1)}
                      </span>
                    ))}
                    <span style={thCell}>{t.assigned}</span>
                    {showVenue && <span style={thCell}>{t.properties}</span>}
                    <span style={thCell}>{t.shiftColumn}</span>
                    <span style={thCell}>{t.time}</span>
                    <span style={thCell} />
                  </div>

                  {sections.map((item, i) => {
                    if (item.kind === 'dept') {
                      const dc = item.dept === '_' ? C.tl : (DEPARTMENT_MAP[item.dept]?.color || C.tl)
                      return (
                        <div key={item.key} style={{
                          padding: '11px 14px', background: C.card,
                          borderTop: `1px solid ${C.borderStrong}`,
                          width: gridMin,
                        }}>
                          {/* The band spans the sheet, but its label rides at the
                              left edge. A full-width sticky band showed you its
                              empty middle once you scrolled right, with the name
                              clipped off the side. */}
                          <span style={{ position: 'sticky', left: 14, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 3, height: 16, borderRadius: 2, background: dc, flexShrink: 0 }} />
                            <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
                              {item.dept === '_' ? t.unassigned : deptName(item.dept, lang)}
                            </span>
                            <span style={{ fontSize: 12, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{item.n}</span>
                          </span>
                        </div>
                      )
                    }
                    const g = item.g
                    const f = FREQ_MAP[freqOf(g)] || FREQ_MAP.daily
                    const edited = isEdited(g)
                    const bg = edited ? C.maroonSoft : (i % 2 ? C.cardAlt : C.card)
                    const days = altDays(g)
                    const weekendOnly = isWeekendOnly(g)
                    const open = expandedKey === g.key
                    const names = (g.people || [])
                      .map((id) => staffById.get(id))
                      .filter(Boolean)
                      .map((m) => personName(m, lang))
                    return (
                      <div key={g.key} style={{ borderTop: `1px solid ${C.border}`, background: bg, boxShadow: `inset 3px 0 0 ${f.ink}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: flatCols, alignItems: 'center' }}>
                          {picking && (
                            <span style={{ ...tdCell, display: 'grid', placeItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={picked.has(g.key)}
                                onChange={() => togglePick(g.key)}
                                aria-label={g.title}
                                style={{ width: 16, height: 16, accentColor: C.maroon, cursor: 'pointer' }}
                              />
                            </span>
                          )}

                          <span style={{ ...tdCell, textAlign: 'center', fontSize: 12, fontWeight: 600, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                            {item.no}
                          </span>

                          <div style={{ ...tdCell, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                              {lang === 'hi' && g.title_hi ? g.title_hi : g.title}
                            </div>
                            {/* What the ticks add up to. Weekly and Monthly have
                                their own columns to announce themselves; daily
                                and alternate had nothing, so ticking three days
                                looked like it had done nothing at all. It reads
                                back live, which is also how you learn the rule. */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                              {/* Sat-Sun stores as alternate [Sat, Sun] because that
                                  is what the scheduler understands, but the chip
                                  should say what was chosen. Pressing "Sat-Sun"
                                  and being told "ALTERNATE DAYS" reads as the
                                  button having done something else. */}
                              <span style={{
                                fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em',
                                color: f.ink, background: f.tint,
                                borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap',
                              }}>
                                {weekendOnly ? t.freqSatSun.toUpperCase() : freqLabel(freqOf(g), lang)}
                              </span>
                              {/* the days themselves, for the patterns a label
                                  cannot name — "Alternate" does not say which three.
                                  Sat-Sun names its own two, so it needs no list. */}
                              {!weekendOnly && ['alternate', 'alternateMS'].includes(freqOf(g)) && (
                                <span style={{ fontSize: 10, color: C.tl, whiteSpace: 'nowrap' }}>
                                  {days.map((d) => dayShort(d, lang)).join(' · ')}
                                </span>
                              )}
                            </div>
                            {g.sop && (
                              <div style={{ fontSize: 11, color: C.tl, lineHeight: 1.4, marginTop: 3 }}>{g.sop}</div>
                            )}
                          </div>

                          {/* Four controls, one schedule. Picking in any of them
                              clears the other three. */}
                          {/* Two buttons rather than a dropdown: there are exactly
                              two answers, and a closed select shows neither of
                              them until you open it. Here both are on the sheet
                              and the live one is filled in. */}
                          <span style={{ ...tdCell, display: 'flex', gap: 4 }}>
                            {/* Sat-Sun is not a third kind of "daily" — it is two
                                days, which the model already calls alternate. The
                                button is a shortcut for ticking Sat and Sun, and
                                it lights up only when those two are exactly what
                                is ticked. */}
                            {[
                              { k: 'dailyMS', label: t.freqDailyMonSat },
                              { k: 'daily', label: t.freqDailyMonSun },
                              { k: 'weekend', label: t.freqSatSun },
                            ].map((opt) => {
                              const on = opt.k === 'weekend' ? weekendOnly : freqOf(g) === opt.k
                              return (
                                <button
                                  key={opt.k}
                                  type="button"
                                  onClick={() => setGroupTime(g.key, opt.k === 'weekend' ? setAlternate([6, 7]) : setDaily(opt.k))}
                                  aria-pressed={on}
                                  style={{
                                    flex: 1, padding: '5px 2px', borderRadius: 7,
                                    fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
                                    background: on ? FREQ_MAP.daily.ink : C.white,
                                    color: on ? '#fff' : C.tl,
                                    border: `1px solid ${on ? FREQ_MAP.daily.ink : C.border}`,
                                  }}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </span>

                          <span style={tdCell}>
                            <select
                              style={miniInput(C)}
                              value={['weekly', 'sunday'].includes(freqOf(g)) ? (g.weekDay || 7) : ''}
                              onChange={(e) => e.target.value && setGroupTime(g.key, setWeekly(e.target.value))}
                              aria-label={t.weekly}
                            >
                              <option value="">—</option>
                              {WEEK_DAYS.map((d) => <option key={d.v} value={d.v}>{dayShort(d.v, lang)}</option>)}
                            </select>
                          </span>

                          <span style={tdCell}>
                            <select
                              style={miniInput(C)}
                              value={freqOf(g) === 'monthly' ? (g.monthWeek || 1) : ''}
                              onChange={(e) => e.target.value && setGroupTime(g.key, setMonthly(e.target.value))}
                              aria-label={t.monthly}
                            >
                              <option value="">—</option>
                              {/* "8" alone reads as a count; the date says which
                                  day of the month the job lands on. */}
                              {[1, 2, 3, 4].map((w) => (
                                <option key={w} value={w}>{ordinal(monthlyDate(w), lang)}</option>
                              ))}
                            </select>
                          </span>

                          {DAY_COLS.map((d) => {
                            const on = days.includes(d)
                            return (
                              <span key={d} style={{ ...tdCell, padding: '10px 2px', display: 'grid', placeItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  aria-label={`${t.freqAlternate} — ${dayName(d, lang)}`}
                                  onChange={() => {
                                    const next = on ? days.filter((x) => x !== d) : [...days, d]
                                    // unticking the last day would leave a
                                    // schedule of no days at all
                                    if (!next.length) return
                                    setGroupTime(g.key, setAlternate(next))
                                  }}
                                  style={{ width: 15, height: 15, accentColor: FREQ_MAP.alternate.ink, cursor: 'pointer' }}
                                />
                              </span>
                            )
                          })}

                          {/* Several people can share a job, which a single select
                              cannot say, so the cell opens the picker instead. */}
                          <span style={tdCell}>
                            <button
                              type="button"
                              onClick={() => setExpandedKey(open ? null : g.key)}
                              style={{
                                width: '100%', textAlign: 'left', fontSize: 11.5, lineHeight: 1.35,
                                background: 'transparent', color: names.length ? C.maroon : C.faint,
                                fontWeight: names.length ? 700 : 600, padding: 0,
                              }}
                            >
                              {names.length ? names.join(', ') : `+ ${t.assign}`}
                            </button>
                            {g.staffing && (
                              <span style={{ display: 'block', fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                                {staffingLabel(g.staffing, lang)}
                              </span>
                            )}
                          </span>

                          {showVenue && (
                            <span style={tdCell}>
                              <select
                                style={miniInput(C)}
                                value={g.property || ''}
                                onChange={(e) => setGroupTime(g.key, { property: e.target.value })}
                                aria-label={t.properties}
                              >
                                {PROPERTIES.map((pp) => (
                                  <option key={pp.code} value={pp.code}>{propName(pp.code, lang)}</option>
                                ))}
                              </select>
                            </span>
                          )}

                          {/* A dropdown with one option is furniture. Only
                              security has two shifts to pick between; for
                              everyone else this states the 9-to-5 and stops. */}
                          <span style={tdCell}>
                            {hasShifts(g.department) ? (
                              <select
                                style={miniInput(C)}
                                value={g.shift || 'day'}
                                onChange={(e) => setGroupTime(g.key, { shift: e.target.value })}
                                aria-label={t.shiftColumn}
                              >
                                {SHIFTS.map((sh) => (
                                  <option key={sh.key} value={sh.key}>{shiftLabel(sh.key, lang)}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, color: C.faint }}>{shiftLabel(null, lang)}</span>
                            )}
                          </span>

                          <TimeCell
                            C={C}
                            gKey={g.key}
                            from={g.from}
                            to={g.to}
                            pick={t.pickTime}
                            onPatch={setGroupTime}
                          />

                          <div style={{ ...tdCell, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => setGroupTime(g.key, { photoRequired: !g.photoRequired })}
                              title={`${t.photoRequired}: ${g.photoRequired ? t.yes : t.no}`}
                              aria-label={`${t.photoRequired}: ${g.photoRequired ? t.yes : t.no}`}
                              aria-pressed={g.photoRequired}
                              style={tapTarget}
                            >
                              <Icon name={g.photoRequired ? 'camera' : 'cameraOff'} size={iconSize} color={g.photoRequired ? C.maroon : C.faint} />
                            </button>
                            <button type="button" onClick={() => openEdit(g)} title={t.edit} aria-label={t.edit} style={tapTarget}>
                              <Icon name="edit" size={iconSize} color={C.tl} />
                            </button>
                            <button type="button" onClick={() => deleteGroup(g)} title={t.delete} aria-label={t.delete} style={tapTarget}>
                              <Icon name="trash" size={iconSize} color={C.red} />
                            </button>
                          </div>
                        </div>

                        {open && (
                          <div style={{ padding: '10px', borderTop: `1px solid ${C.border}`, background: C.card }}>
                            <PeoplePicker
                              C={C}
                              t={t}
                              lang={lang}
                              staff={staff}
                              chosen={g.people}
                              onToggle={(id) => togglePerson(g.key, id)}
                              isVisiting={isVisiting}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}


          {form && (
            <JobForm
              value={form}
              staff={staff}
              onChange={setForm}
              onCancel={() => setForm(null)}
              onSubmit={applyForm}
              busy={busy}
            />
          )}

          {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        </>
      )}
    </>
  )

  // On the tab the actions follow the page instead of being pinned to a dialog,
  // and they stick to the bottom of the viewport so Save is reachable without
  // scrolling past 121 rows to find it.
  if (inline) {
    return (
      <div>
        {body}
        {saved && <Toast message={t.changesSaved} onDone={() => setSaved(false)} />}
        <div
          style={{
            position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', gap: 10,
            padding: '12px 0', marginTop: 16,
            background: C.bg, borderTop: `1px solid ${C.border}`,
          }}
        >
          {picking ? pickBar : footer}
        </div>
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} maxWidth={1240} title={t.roster} footer={picking ? pickBar : footer}>
      {body}
      {saved && <Toast message={t.changesSaved} onDone={() => setSaved(false)} />}
    </Modal>
  )
}

// Person toggles rather than a dropdown: several people per job is the normal
// case here, and a multi-select <select> is unusable on a phone. Past a couple of
// dozen names the chips stop being a choice and become a scan, so there is a
// search box — and anyone already ticked stays visible while you type, or you
// could not see what you had picked.
//
// Module level on purpose: defined inside the parent's body, its identity changed
// every render, React remounted it, and the search text died on each keystroke.
function PeoplePicker({ C, t, lang, staff, chosen, onToggle, isVisiting, autoFocus = false }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  // Nothing is listed until something is typed. Forty names on screen is a wall
  // to read past; the people already picked stay, because that is the one thing
  // you must be able to see without searching for it.
  const matches = needle
    ? staff.filter((m) => !chosen.includes(m.id)
        && `${m.name || ''} ${m.name_hi || ''} ${deptName(m.department, 'en')} ${propName(m.property, 'en')}`
          .toLowerCase().includes(needle))
    : []
  const picked = staff.filter((m) => chosen.includes(m.id))
  const shown = [...picked, ...matches]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Icon name="search" size={15} color={C.faint} />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPerson}
          style={{ ...inputStyle(C), padding: '8px 11px', fontSize: 13 }}
        />
        {chosen.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: C.maroon, whiteSpace: 'nowrap' }}>
            {chosen.length}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {staff.length === 0 && <span style={{ fontSize: 12.5, color: C.tl }}>{t.noStaffInScope}</span>}
        {staff.length > 0 && !needle && picked.length === 0 && (
          <span style={{ fontSize: 12.5, color: C.faint }}>{t.typeToFindPerson}</span>
        )}
        {needle && matches.length === 0 && (
          <span style={{ fontSize: 12.5, color: C.faint }}>{t.noMatch}</span>
        )}
        {shown.map((m) => {
          const on = chosen.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              title={[m.department ? deptName(m.department, lang) : null, propName(m.property, lang)].filter(Boolean).join(' · ')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                border: `1.5px solid ${on ? C.maroon : C.border}`,
                background: on ? C.maroon : C.card,
                color: on ? '#fff' : C.tl,
              }}
            >
              {on && <Icon name="check" size={12} color="#fff" />}
              {personName(m, lang)}
              {m.inactive && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                  · {t.inactiveStaff}
                </span>
              )}
              {!m.inactive && isVisiting(m) && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                  · {propName(m.property, lang)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// A time as one tap. `after` drops everything at or before the start, so an end
// time can never land before its beginning — the old inputs let you type one.
function TimeSelect({ C, t, value, after, onChange }) {
  const slots = useMemo(() => {
    const list = after ? TIME_SLOTS.filter((x) => x > after) : TIME_SLOTS
    // A row saved with the old free-typed picker can hold 09:34, which is on no
    // quarter hour. Keep it in the list or opening the form would silently
    // change the time to blank.
    return value && !list.includes(value) ? [...list, value].sort() : list
  }, [value, after])

  return (
    <select style={inputStyle(C)} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t.pickTime}</option>
      {slots.map((x) => <option key={x} value={x}>{fmt12(x)}</option>)}
    </select>
  )
}

// One row's worth of fields, as a small form. Used for both adding a job and
// editing one — the same shape either way, so there is nothing new to learn the
// second time. Nothing is written here: it hands the values back and the roster's
// Save applies them with everything else.
function JobForm({ value, staff, onChange, onCancel, onSubmit, busy }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const set = (patch) => onChange({ ...value, ...patch })
  const valid = value.title.trim() && value.dept

  return (
    <Modal
      open
      onClose={onCancel}
      maxWidth={520}
      title={value.mode === 'add' ? t.addTaskRow : t.edit}
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={() => onSubmit(value)} disabled={!valid || busy} style={{ flex: 2 }}>
            {value.mode === 'add' ? t.addTaskRow : t.save}
          </Button>
        </>
      )}
    >
      <Field label={t.title} required>
        <input
          autoFocus
          style={inputStyle(C)}
          value={value.title}
          placeholder={t.newTaskTitle}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>

      {/* The staff who do this work read Hindi. It was already being translated
          at save time, invisibly — this is the same translation, shown while
          there is still a chance to correct it. */}
      <HindiInput
        label={t.hindiTitle}
        hint={t.hindiForStaffHint}
        source={value.title}
        value={value.titleHi}
        onChange={(v) => set({ titleHi: v })}
      />

      <Field label={t.department} required>
        <select style={inputStyle(C)} value={value.dept} onChange={(e) => set({ dept: e.target.value })}>
          <option value="">— {t.department} —</option>
          {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>)}
        </select>
      </Field>

      {/* Only on a new job. Editing one changes the rows that already exist;
          it cannot retro-fit copies at venues that never had it, and a switch
          that silently does nothing is worse than no switch. */}
      {value.mode === 'add' && (
        <Field label={t.commonTask} hint={t.commonTaskHint.replace('{n}', PROPERTIES.length)}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { on: false, label: t.thisVenueOnly },
              { on: true, label: t.commonTaskOn },
            ].map((opt) => {
              const active = !!value.allProps === opt.on
              return (
                <button
                  key={String(opt.on)}
                  type="button"
                  onClick={() => set({ allProps: opt.on })}
                  aria-pressed={active}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 13.5, fontWeight: 700,
                    background: active ? C.maroonSoft : C.card,
                    color: active ? C.maroon : C.tl,
                    border: `1.5px solid ${active ? C.maroon : C.border}`,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {/* Frequency first: it decides whether a day, a week of the month, or
          neither is worth asking for. "(Mon-Sat)" is the Sunday rule; "Sunday
          only" is the light work done while clients walk the property. */}
      {/* The same four choices the sheet offers, in the same order, obeying
          the same rule: one of them is the schedule and picking it clears the
          rest. A form that spoke a different vocabulary from the sheet it adds
          to would teach the wrong thing twice. */}
      <Field label={t.frequency} required hint={t.frequencyHint}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { k: 'dailyMS', label: t.freqDailyMonSat },
            { k: 'daily', label: t.freqDailyMonSun },
            { k: 'weekend', label: t.freqSatSun },
          ].map((opt) => {
            const on = opt.k === 'weekend'
              ? (value.freq === 'alternate' && (value.weekDays || []).length === 2
                 && value.weekDays.includes(6) && value.weekDays.includes(7))
              : value.freq === opt.k
            return (
              <button
                key={opt.k}
                type="button"
                onClick={() => set(opt.k === 'weekend'
                  ? { freq: 'alternate', weekDays: [6, 7], weekDay: '', monthWeek: '' }
                  : { freq: opt.k, weekDays: null, weekDay: '', monthWeek: '' })}
                aria-pressed={on}
                style={{
                  flex: '1 1 90px', padding: '9px 8px', borderRadius: 9,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${on ? FREQ_MAP.daily.ink : C.border}`,
                  background: on ? FREQ_MAP.daily.ink : C.card,
                  color: on ? '#fff' : C.tl,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px' }}>
          <Field label={t.weekly} hint={t.dayOfWeekHint}>
            <select
              style={inputStyle(C)}
              value={['weekly', 'sunday'].includes(value.freq) ? (value.weekDay || 7) : ''}
              onChange={(e) => e.target.value && set({
                freq: 'weekly', weekDay: Number(e.target.value), weekDays: null, monthWeek: '',
              })}
            >
              <option value="">—</option>
              {WEEK_DAYS.map((d) => <option key={d.v} value={d.v}>{lang === 'hi' ? d.hi : d.en}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <Field label={t.monthly} hint={t.weekOfMonthHint}>
            <select
              style={inputStyle(C)}
              value={value.freq === 'monthly' ? (value.monthWeek || 1) : ''}
              onChange={(e) => e.target.value && set({
                freq: 'monthly', monthWeek: Number(e.target.value), weekDays: null, weekDay: '',
              })}
            >
              <option value="">—</option>
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>{ordinal(monthlyDate(w), lang)}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Alternate is set by ticking days, here as it is on the sheet. Ticking
          anything makes the job alternate; it is the only control that does. */}
      <Field label={t.freqAlternate} hint={t.repeatOnDaysHint}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {WEEK_DAYS.map((d) => {
            const chosen = value.freq === 'alternate' ? (value.weekDays || []) : []
            const on = chosen.includes(d.v)
            return (
              <button
                key={d.v}
                type="button"
                onClick={() => {
                  const next = on ? chosen.filter((x) => x !== d.v) : [...chosen, d.v].sort((a, b) => a - b)
                  // a job with no days never comes back; nobody means to make one
                  if (!next.length) return
                  set({ freq: 'alternate', weekDays: next, weekDay: '', monthWeek: '' })
                }}
                aria-pressed={on}
                style={{
                  minWidth: 46, padding: '7px 6px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                  border: `1.5px solid ${on ? FREQ_MAP.alternate.ink : C.border}`,
                  background: on ? FREQ_MAP.alternate.ink : C.card,
                  color: on ? '#fff' : C.tl,
                }}
              >
                {dayShort(d.v, lang)}
              </button>
            )
          })}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <Field label={`${t.fromTime} (${t.optional})`}>
            <TimeSelect
              C={C} t={t}
              value={value.from}
              // moving the start past the end would leave a negative block
              onChange={(v) => set({ from: v, to: value.to && v && v >= value.to ? '' : value.to })}
            />
          </Field>
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <Field
            label={`${t.toTime} (${t.optional})`}
            hint={spanLabel(value.from, value.to, t) ? `${t.blockLength}: ${spanLabel(value.from, value.to, t)}` : undefined}
          >
            <TimeSelect C={C} t={t} value={value.to} after={value.from} onChange={(v) => set({ to: v })} />
          </Field>
        </div>
      </div>

      {/* how many and which kind, in the roster's own words. The names are ticked
          below; this is the rule they are ticked against. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <Field label={t.priority}>
            <select style={inputStyle(C)} value={value.priority || 'medium'} onChange={(e) => set({ priority: e.target.value })}>
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>{t[`priority${pr[0].toUpperCase()}${pr.slice(1)}`] || pr}</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: '1 1 140px' }}>
          {/* Recurring work rarely has one — it comes back on its own schedule.
              It is here for the odd job that must be finished by a date. */}
          <Field label={`${t.dueDate} (${t.optional})`} hint={t.dueDateRosterHint}>
            <input type="date" style={inputStyle(C)} value={value.dueDate || ''} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
        </div>
      </div>

      <Field label={`${t.assigned} (${t.optional})`} hint={t.staffingHint}>
        <input
          style={inputStyle(C)}
          value={value.staffing || ''}
          placeholder={t.staffingPlaceholder}
          onChange={(e) => set({ staffing: e.target.value })}
        />
      </Field>

      <Field label={`${t.sopColumn} (${t.optional})`} hint={t.sopHint}>
        <textarea
          rows={3}
          style={{ ...inputStyle(C), resize: 'vertical' }}
          value={value.sop || ''}
          placeholder={t.sopPlaceholder}
          onChange={(e) => set({ sop: e.target.value })}
        />
      </Field>

      <Field label={t.photoRequired} hint={t.photoRequiredHint}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.text, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.photoRequired !== false}
            onChange={(e) => set({ photoRequired: e.target.checked })}
          />
          {value.photoRequired !== false ? t.yes : t.no}
        </label>
      </Field>

      {/* the same searchable picker as the table rows — one list, one behaviour */}
      <Field label={`${t.assignedTo} (${t.optional})`} hint={value.allProps ? t.commonTaskAssignHint : undefined}>
        <PeoplePicker
          C={C} t={t} lang={lang} staff={staff}
          chosen={value.people}
          onToggle={(id) => set({
            people: value.people.includes(id)
              ? value.people.filter((x) => x !== id)
              : [...value.people, id],
          })}
          isVisiting={() => false}
        />
      </Field>
    </Modal>
  )
}
