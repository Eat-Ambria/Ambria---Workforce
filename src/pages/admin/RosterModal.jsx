import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  SHIFTS, shiftLabel,
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
  // Trimmed so the sheet fits a laptop beside the sidebar. Every pixel here is
  // one the last columns do not have to be scrolled to reach.
  pick: 34, num: 34, task: 240,
  weekly: 88, monthly: 88, day: 37,
  assigned: 185, venue: 205, time: 112, actions: 96,
}
const TASK_W = COL_W.task

// Task takes the slack, so the sheet reaches both edges instead of ending in a
// strip of nothing — and long titles stop wrapping to three lines.
const TASK_TRACK = `minmax(${COL_W.task}px, 1fr)`

const sheetTracks = ({ picking }) => [
  picking && COL_W.pick,
  COL_W.num,
  COL_W.task,
  COL_W.weekly,
  COL_W.monthly,
  ...Array(7).fill(COL_W.day),
  COL_W.assigned,
  COL_W.venue,
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
// Task is deliberately NOT pinned. With Department it took a third of the
// visible width and sat over the day ticks — the columns you scroll sideways
// to reach were the ones it was covering.
const thCell = {
  padding: '13px 14px', fontSize: 10.5, fontWeight: 700, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.1em',
}
const tdCell = { padding: '13px 14px' }
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
// Where the assign panel hangs off the cell that opened it. Pure, because it is
// run again on every scroll frame — see the effect that follows the row.
//
// `side` pins the choice of above/below once. Both are measured either way:
// choosing a side is not enough, since a panel flipped upward from a row near
// the top of the window would draw itself over the page header.
const assignGeom = (r, side) => {
  const GAP = 6, EDGE = 10, WANT = 560, MIN = 200
  // Wide enough for a name, five venues and a shift on two lines — and never
  // wider than the window, which is what a narrow laptop would have got.
  const W = Math.max(320, Math.min(620, window.innerWidth - EDGE * 2))
  const below = window.innerHeight - r.bottom - GAP - EDGE
  const above = r.top - GAP - EDGE
  // below by default; upward only when below is too tight AND above is roomier
  const up = side === undefined ? (below < MIN + 60 && above > below) : side
  return {
    up,
    // Upward, the panel is pinned by its BOTTOM edge to just above the row.
    // Deriving a top from maxH positioned it by the space it was allowed rather
    // than the height it needs, so a short panel floated hundreds of pixels
    // clear of the row it belongs to.
    bottom: up ? Math.max(EDGE, window.innerHeight - r.top + GAP) : undefined,
    top: up ? undefined : r.bottom + GAP,
    left: Math.min(Math.max(EDGE, r.left), Math.max(EDGE, window.innerWidth - W - EDGE)),
    width: Math.max(W, r.width),
    maxH: Math.max(MIN, Math.min(WANT, up ? above : below)),
  }
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
// the order frequencies read in, so a department groups the same way every time
const FREQUENCY_KEYS = ['daily', 'dailyMS', 'sunday', 'alternate', 'alternateMS', 'weekly', 'monthly']

const DAY_COLS = [7, 1, 2, 3, 4, 5, 6]

// Two letters, not one. "S M T W T F S" has Sunday and Saturday both as S and
// Tuesday and Thursday both as T — the first six boxes were being ticked for
// Mon-Sat when they are actually Sun-Fri, and the row then correctly refused to
// call itself a range because Saturday was missing from the middle.
const DAY_INITIAL = { 1: 'M', 2: 'Tu', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa', 7: 'Su' }

// 1 -> "1st". Hindi just takes the number — Devanagari ordinals for dates are
// not how anyone writes a monthly rota.
const ordinal = (n, lang) => {
  if (lang === 'hi') return String(n)
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'
  return `${n}${s}`
}

// Which days a row shows as ticked. Weekly means one day; monthly is not a
// weekday pattern at all, so it ticks nothing.
// Which days the row actually runs on — the ticks are the schedule now, so they
// have to be right for every frequency, not just alternate. Daily is spelled out
// as all seven rather than deferred to taskDays(), whose fallback is Mon/Wed/Fri
// and is meant for alternate work only.
const rowDays = (g) => {
  const fk = freqOf(g)
  if (fk === 'monthly') return []
  if (fk === 'weekly' || fk === 'sunday') return [Number(g.weekDay) || 7]
  if (fk === 'daily') return [1, 2, 3, 4, 5, 6, 7]
  if (fk === 'dailyMS') return [1, 2, 3, 4, 5, 6]
  return taskDays(g)
}

// A run of consecutive days — Sat-Sun, Mon-Thu. Sunday is 7, so a set that wraps
// round the end of the week (Sun, Mon) is not a run, which is right: nobody
// reads "Sun-Mon" as a range.
const isRun = (d) => d.length >= 2 && d[d.length - 1] - d[0] === d.length - 1

// The same rule as setDays(), in the shape the form keeps its fields in: it
// stores a frequency KEY and lets freqSpec() turn that into columns at save
// time, where the sheet edits the columns directly.
const daysToForm = (days) => {
  const d = [...new Set(days.map(Number))].sort((a, b) => a - b)
  if (d.length === 7) return { freq: 'daily', weekDays: null, weekDay: '', monthWeek: '' }
  if (d.length === 6 && !d.includes(7)) return { freq: 'dailyMS', weekDays: null, weekDay: '', monthWeek: '' }
  if (d.length === 1) return { freq: 'weekly', weekDays: null, weekDay: d[0], monthWeek: '' }
  return {
    freq: d.includes(7) ? 'alternate' : 'alternateMS',
    weekDays: d, weekDay: '', monthWeek: '',
  }
}

// ...and back, so the chips show what the form currently holds.
const formDays = (v) => {
  if (v.freq === 'monthly') return []
  if (v.freq === 'weekly' || v.freq === 'sunday') return [Number(v.weekDay) || 7]
  if (v.freq === 'daily') return [1, 2, 3, 4, 5, 6, 7]
  if (v.freq === 'dailyMS') return [1, 2, 3, 4, 5, 6]
  return (v.weekDays || []).map(Number).sort((a, b) => a - b)
}

// A row runs on ONE schedule. Each setter therefore clears the other three
// rather than layering on top of them — a sheet that let a job claim both
// "daily" and "every Wednesday" would be lying about what the staff will see.
const BLANK = { weekDays: null, weekDay: '', monthWeek: '', skipSunday: false }
const setWeekly = (d) => ({ ...BLANK, category: 'weekly', weekDay: Number(d) })
const setMonthly = (w) => ({ ...BLANK, category: 'monthly', monthWeek: Number(w) })

// Ticked days in, a schedule out. A run and a gapped set both land on
// `alternate` because that is the one thing the scheduler does with a day list;
// the difference between them is a label, not a mechanism.
const setDays = (days) => {
  const d = [...new Set(days.map(Number))].sort((a, b) => a - b)
  if (d.length === 7) return { ...BLANK, category: 'daily' }
  if (d.length === 6 && !d.includes(7)) return { ...BLANK, category: 'daily', skipSunday: true }
  if (d.length === 1) return { ...BLANK, category: 'weekly', weekDay: d[0] }
  return { ...BLANK, category: 'alternate', weekDays: d, skipSunday: !d.includes(7) }
}
// What the row calls itself, read back off the days. "Alternate" is reserved for
// the case it actually describes — days with gaps between them.
const scheduleChip = (g, t, lang) => {
  const fk = freqOf(g)
  if (fk === 'monthly') return { text: freqLabel('monthly', lang), days: '' }
  if (fk === 'weekly' || fk === 'sunday') {
    return { text: `${freqLabel('weekly', lang)} · ${dayShort(Number(g.weekDay) || 7, lang)}`, days: '' }
  }
  if (fk === 'daily') return { text: t.freqEveryDay, days: '' }
  const d = rowDays(g)
  if (fk === 'dailyMS' || isRun(d)) {
    return { text: `${dayShort(d[0], lang)} – ${dayShort(d[d.length - 1], lang)}`, days: '' }
  }
  return { text: freqLabel(fk, lang), days: d.map((x) => dayShort(x, lang)).join(' · ') }
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
          {/* Each time stays whole and the line may only break at the dash.
              Handed over as one string, a 112px column breaks it wherever it
              likes — "3:00 PM - 4:00" with a lonely "PM" underneath. */}
          {from ? (
            <>
              <span style={{ whiteSpace: 'nowrap' }}>{fmt12(from)}</span>
              {to && <>{' - '}<span style={{ whiteSpace: 'nowrap' }}>{fmt12(to)}</span></>}
            </>
          ) : pick}
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
  // The filter bar's own height, live: the column header sticks below it, and the
  // bar wraps to two or three rows depending on width.
  const [barH, setBarH] = useState(0)
  // Does the sheet fit without a sideways scroll? If it does, the wrapper stops
  // being a scrollport and the column header can stick to the page.
  const sheetRef = useRef(null)
  const [sheetFits, setSheetFits] = useState(false)
  // The column header's own height. Everything sticky above the list adds up to
  // where the list visibly begins, which is where a drag should start scrolling.
  const headRef = useRef(null)
  const [headH, setHeadH] = useState(0)
  const listRef = useRef(null)
  const barRef = useRef(null)
  useEffect(() => {
    // the app header plus the tab row above us — both stick, so both count
    const measure = () => setHeaderH(
      (document.querySelector('header')?.offsetHeight || 0)
      + (document.querySelector('[data-tabs-bar]')?.offsetHeight || 0)
    )
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
  // Which venues the sheet covers. Not a filter and not state: with the venue
  // chips gone there is nothing to change it, and the Roster tab has no other
  // venue control — so it is simply the admin's reach. Everything for an
  // all-venues admin, their own venue for anyone else.
  const props = useMemo(
    () => (canSeeAllProps
      ? PROPERTIES.map((pp) => pp.code)
      : [defaultProperty || (user.property !== 'all' ? user.property : null) || PROPERTIES[0].code]),
    [canSeeAllProps, defaultProperty, user.property]
  )
  const [freqFilter, setFreqFilter] = useState('all')  // which frequency band is shown
  const [rows, setRows] = useState([])        // every task row for these venues
  // Where each job runs across ALL five venues, not just the loaded ones:
  // { 'dept||title': ['pp', 'ex', ...] }. The PROPERTIES ticks read from this.
  const [jobSpread, setJobSpread] = useState({})
  // A person's shift is not a roster row, so it has nowhere in `groups` to live.
  // Pending edits count towards Save; once written they move to the applied map,
  // which is what the picker reads — `members` comes from the page above and is
  // not reloaded by this modal, so without it a saved shift would appear to
  // revert the moment the popover reopened.
  const [shiftEdits, setShiftEdits] = useState({})   // { userId: 'day' | 'night' | '' }
  const [shiftApplied, setShiftApplied] = useState({})
  // Which venue a person does a given job at: { 'groupKey|userId': 'mk' }. Only
  // holds deliberate choices — the default is worked out from the person, so an
  // untouched assignment has no entry here and nothing to save.
  const [personVenue, setPersonVenue] = useState({})
  const [groups, setGroups] = useState([])    // one per distinct job, with its chosen people
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // group keys ticked for bulk deletion; `picking` shows the checkbox column
  const [picking, setPicking] = useState(false)

  const tracks = sheetTracks({ picking })
  // Fixed pixels everywhere except Task. The sum still counts Task's minimum, so
  // gridMin stays the width below which the sheet scrolls rather than squeezes.
  const flatCols = tracks
    .map((n) => (n === COL_W.task ? TASK_TRACK : `${n}px`))
    .join(' ')
  const gridMin = tracks.reduce((a, b) => a + b, 0)

  const [picked, setPicked] = useState(() => new Set())
  const [err, setErr] = useState('')
  const [deptTab, setDeptTab] = useState('all')       // which department's round is shown
  // The row whose people picker is open, and where on screen to draw it. Screen
  // coordinates rather than a nested panel: see the portal below.
  const [assignAt, setAssignAt] = useState(null) // { key, mode, top, left, width, maxH }
  // The cell the open panel hangs off. A ref, not state: it is read during a
  // scroll, where a re-render per frame is exactly what we are avoiding.
  const assignEl = useRef(null)
  // The panel's own node, for the same reason.
  const assignBox = useRef(null)
  const openAssign = (e, key, mode = 'people') => {
    const el = e.currentTarget
    setAssignAt((cur) => {
      if (cur?.key === key && cur?.mode === mode) { assignEl.current = null; return null }
      assignEl.current = el
      return { key, mode, ...assignGeom(el.getBoundingClientRect()) }
    })
  }
  // The panel is fixed to the viewport, so it has to be told where its row has
  // gone. Without this, scrolling the sheet slid the row out from under it and
  // left the panel sitting over a different job entirely.
  useEffect(() => {
    if (!assignAt) return undefined
    const side = assignAt.up
    let frame = 0
    const follow = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = assignEl.current
        const box = assignBox.current
        if (!el || !el.isConnected || !box) return
        // The side it opens on is decided once, at open. Recomputing it
        // mid-scroll makes the panel jump across its row rather than travel
        // with it.
        const g = assignGeom(el.getBoundingClientRect(), side)
        // Written straight to the node. Going through state would re-render the
        // whole sheet — five hundred rows of it — on every frame of a scroll,
        // which is the one thing a panel that merely moves must not cost.
        box.style.left = `${g.left}px`
        box.style.top = g.up ? '' : `${g.top}px`
        box.style.bottom = g.up ? `${g.bottom}px` : ''
        box.style.maxHeight = `${g.maxH}px`
      })
    }
    // Clicking away closes it. This used to be a full-screen catcher, which
    // does the same job and also swallows the wheel — and a panel that cannot
    // let the sheet scroll underneath has nothing to follow.
    const away = (ev) => {
      if (assignBox.current?.contains(ev.target)) return
      // the cell itself toggles; openAssign decides what that means
      if (assignEl.current?.contains(ev.target)) return
      setAssignAt(null)
    }
    // capture, because the sheet has its own scrollport and a scroll inside an
    // element does not bubble
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    document.addEventListener('mousedown', away, true)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
      document.removeEventListener('mousedown', away, true)
    }
  }, [assignAt?.key, assignAt?.mode])
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
  // what a person's shift is right now, pending edits winning over written ones
  const personShift = useCallback(
    (m) => (m ? (shiftEdits[m.id] ?? shiftApplied[m.id] ?? m.shift ?? '') : ''),
    [shiftEdits, shiftApplied]
  )
  const setPersonShift = useCallback((id, next) => {
    setShiftEdits((prev) => ({ ...prev, [id]: next }))
  }, [])

  // Their home venue if the task runs there, otherwise the row you opened. A
  // gardener based at Manaktala doing a job that runs at four venues is doing
  // Manaktala's, unless somebody says otherwise.
  // Where this person already does it, if they already do. Otherwise their home
  // venue when the job runs there, and failing that the first venue it runs at —
  // a group has no single venue of its own to fall back on any more.
  // Every venue where they already do it — a Site Head who covers all five
  // properties does the same round at each, and each is its own row. For
  // somebody new to the job it is one venue, never more: their own if the job
  // runs there, otherwise the first it runs at. A second venue is something an
  // admin ticks on purpose.
  const defaultVenues = useCallback((g, id, venues) => {
    const mine = [...new Set((g.rows || [])
      .filter((r) => r.assigned_to === id && r.property)
      .map((r) => r.property))]
    if (mine.length) return mine
    const home = staffById.get(id)?.property
    if (home && home !== 'all' && venues.includes(home)) return [home]
    return venues.slice(0, 1)
  }, [staffById])
  const venuesForPerson = useCallback(
    (g, id, venues) => personVenue[`${g.key}|${id}`] || defaultVenues(g, id, venues),
    [personVenue, defaultVenues]
  )
  // Ticking a venue gives them that venue's copy of the job, unticking hands it
  // back. Never all of them at once: somebody on a job is doing it somewhere,
  // and taking them off the job entirely is the name chip's business.
  const toggleVenueForPerson = useCallback((gKey, id, code, current) => {
    setPersonVenue((prev) => {
      const now = prev[`${gKey}|${id}`] || current || []
      const next = now.includes(code) ? now.filter((v) => v !== code) : [...now, code]
      if (!next.length) return prev
      return { ...prev, [`${gKey}|${id}`]: next }
    })
  }, [])

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
      .select('id, title, title_hi, description, description_hi, category, property, department, assigned_to, assignee_name, area, time_block, photo_required, week_day, week_days, month_week, skip_sunday, staffing, priority, due_date, shift, sort_order, status, started_at, before_photo, completion_photo')
      .in('property', props)
      .order('time_block', { ascending: true, nullsFirst: false })
      .order('title')
    setRows(data || [])

    // Three columns over every venue — cheap, and the only way the ticks can say
    // where a job runs rather than where the sheet is pointed.
    //
    // In pages, because this one deliberately reads the whole table and the API
    // caps a response at a thousand rows. Silently losing the tail would mean
    // ticks that stop mentioning venues as the roster grows.
    const PAGE = 1000
    const map = {}
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from('tasks')
        .select('property, department, title')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) break
      ;(page || []).forEach((r) => {
        const k = `${r.department}||${r.title}`
        if (!map[k]) map[k] = []
        if (!map[k].includes(r.property)) map[k].push(r.property)
      })
      if (!page || page.length < PAGE) break
    }
    setJobSpread(map)
    // one entry per distinct job; `people` is the set currently doing it
    const byTitle = new Map()
    ;(data || []).forEach((r) => {
      // department belongs in the key: Admin's "Full Safety Audit" and
      // Security's are two different jobs that happen to share a name, and
      // merging them silently dropped rows from the roster and the Summary
      // No property: the same round at four venues is one job with four venues,
      // not four jobs. Department stays, because Admin's "Full Safety Audit" and
      // Security's are two different jobs that happen to share a name.
      //
      // Time does belong in it: the same round at 8 PM and on Thursday morning is
      // two jobs, and without this they merged into one row that showed one time
      // and hid the other. Normalised, so '1:30-2:00 PM' and '1:30 PM - 2:00 PM'
      // stay one job — splitting a row over a space is the same bug reversed.
      // Trimmed: a job is not two jobs because one of its rows carries a
      // trailing space, and two rows that read the same and behave differently
      // are worse than either of the things they could have been.
      const title = (r.title || '').trim()
      const key = `${r.department}||${r.category}||${title}||${r.area || ''}||${normRange(r.time_block)}`
      if (!byTitle.has(key)) byTitle.set(key, {
        key, title, title_hi: r.title_hi, area: r.area,
        category: r.category, sop: r.description || '', sopHi: r.description_hi || '',
        staffing: r.staffing || '',
        time_block: r.time_block, department: r.department, weekDay: r.week_day || '',
        monthWeek: r.month_week || '', skipSunday: !!r.skip_sunday,
        weekDays: Array.isArray(r.week_days) && r.week_days.length ? r.week_days.map(Number) : null,
        priority: r.priority || 'medium', dueDate: r.due_date || '', shift: r.shift || '',
        sortOrder: r.sort_order ?? null,
        photoRequired: r.photo_required !== false, rows: [],
      })
      byTitle.get(key).rows.push(r)
    })
    setGroups([...byTitle.values()].map((g) => ({
      ...g,
      ...parseRange(g.time_block),
      // Where it runs, straight off its own rows — including the venues whose
      // copy nobody is assigned to yet.
      venuesAt: [...new Set(g.rows.map((r) => r.property))],
      people: [...new Set(g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to))],
    })))
    setLoading(false)
  }, [props])

  useEffect(() => { load() }, [load])

  // Both measurements come from the elements themselves. The viewport would be
  // the wrong thing to ask: the same sheet opens inside a 1240px modal, where it
  // does not fit however wide the window is.
  useEffect(() => {
    const bar = barRef.current
    const sheet = sheetRef.current
    if (!bar && !sheet) return
    const measure = () => {
      if (bar) setBarH(bar.offsetHeight || 0)
      if (sheet) setSheetFits(sheet.clientWidth >= gridMin)
      setHeadH(headRef.current?.offsetHeight || 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (bar) ro.observe(bar)
    if (sheet) ro.observe(sheet)
    return () => ro.disconnect()
  }, [gridMin, loading, picking])

  // One small form for both adding and editing a row. Inline inputs inside a
  // five-column grid were unusable on anything narrow, and a row being edited
  // looked nothing like a row being read.
  // A new row is a group with no rows behind it. Same shape as a loaded one, so
  // every cell in the sheet edits it without knowing it is new.
  const addRow = () => {
    const key = `new:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
    setGroups((prev) => [...prev, {
      key,
      isNew: true,
      rows: [],
      title: '',
      title_hi: '',
      department: deptTab === 'all' ? (DEPARTMENTS[0]?.code || '') : deptTab,
      // a new job can go to several venues at once; an existing one lives at
      // exactly one, which is why only new rows get the multi-select
      properties: [...props],
      property: props[0],
      category: 'daily',
      skipSunday: false,
      weekDays: null,
      weekDay: '',
      monthWeek: '',
      from: '',
      to: '',
      shift: '',
      people: [],
      sop: '',
      sopHi: '',
      staffing: '',
      priority: 'medium',
      dueDate: '',
      photoRequired: true,
    }])
    // straight to it — a row appended below the fold looks like nothing happened
    setTimeout(() => {
      // the window, not the wrapper: that box has no height cap, so no vertical
      // overflow, so nothing to scroll. The new row is the first one on the sheet,
      // and goToList already stops clear of everything sticky above it.
      goToList()
    }, 0)
  }

  const openEdit = (g) => setForm({
    mode: 'edit', key: g.key, dept: g.department || '',
    title: g.title, titleHi: g.title_hi || '', from: g.from || '', to: g.to || '',
    photoRequired: g.photoRequired !== false, people: g.people, weekDay: g.weekDay || '',
    freq: freqOf(g), monthWeek: g.monthWeek || '', sop: g.sop || '', sopHi: g.sopHi || '',
    staffing: g.staffing || '',
    priority: g.priority || 'medium', dueDate: g.dueDate || '',
    weekDays: g.weekDays || null,
  })

  // The dialog only edits now — new jobs are typed straight into the sheet — so
  // this just folds the values back into the group and lets Save carry them.
  function applyForm(v) {
    setGroups((prev) => prev.map((g) => (g.key !== v.key ? g : {
      ...g, title: v.title, title_hi: v.titleHi, from: v.from, to: v.to,
      photoRequired: v.photoRequired, people: v.people,
      sop: v.sop, sopHi: v.sopHi, staffing: v.staffing, monthWeek: v.monthWeek,
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
    const freqOrder = FREQUENCY_KEYS
    // Department, then frequency, then whatever order was dragged, then the
    // clock. Frequency is back as a key because without it a department read
    // daily, weekly, alternate, daily — like never sat with like.
    //
    // Sort on the SAVED row, not the edited group: ticking a day changes the
    // frequency, and ranking on live values would slide the row out from under
    // the cursor mid-edit. The sheet settles on the next load.
    const saved = (g) => g.rows[0] || {}
    const deptRank = (g) => {
      const d = saved(g).department ?? g.department
      return deptOrder.indexOf(d) < 0 ? 99 : deptOrder.indexOf(d)
    }
    const freqRank = (g) => {
      const r = saved(g)
      const fk = r.category ? freqOf(r) : freqOf(g)
      const i = freqOrder.indexOf(fk)
      return i < 0 ? 99 : i
    }
    // a row nobody has ordered sits after the ones somebody has
    const orderRank = (g) => (g.sortOrder ?? Number.MAX_SAFE_INTEGER)
    // Sort on the PARSED start, not the raw text. A monthly row's time_block
    // reads "1st Week", and comparing that as a string drops it between 12:15
    // and 2:00 because both begin with a "1". Parsed, it has no clock time at
    // all and sinks to the end of its department, which is where a job with no
    // hour belongs.
    const startOf = (g) => parseRange(saved(g).time_block).from

    // Decorate, sort, undecorate. Every one of these helpers costs something —
    // parsing a time range, two indexOf scans, working out a frequency — and a
    // comparator runs them on both sides of ~5,000 comparisons. Computed once per
    // row instead, which is 538 times rather than 20,000, on every keystroke.
    //
    // An unsaved row sorts to the TOP whatever department it is destined for: you
    // add a task in order to type in it, so it belongs in front of you, and it has
    // no place in the real order until it has been saved into one.
    const keyed = shownGroups.map((g) => {
      const start = startOf(g)
      return {
        g,
        isNew: g.isNew ? 0 : 1,
        dept: deptRank(g),
        freq: freqRank(g),
        order: orderRank(g),
        noTime: start ? 0 : 1,
        start,
        title: g.title || '',
      }
    })
    keyed.sort((a, b) => a.isNew - b.isNew
      || a.dept - b.dept
      || a.freq - b.freq
      || a.order - b.order
      || a.noTime - b.noTime
      || a.start.localeCompare(b.start)
      || a.title.localeCompare(b.title))
    return keyed.map((k) => k.g)
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
    // nothing on the server yet — no confirmation for throwing away a blank
    if (g.isNew) {
      setGroups((prev) => prev.filter((x) => x.key !== g.key))
      return
    }
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
  const plan = useMemo(() => groups.filter((g) => !g.isNew).map((g) => {
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
    // A short list of day numbers, compared as one: JSON.stringify ran twice per
    // row on every keystroke to answer this.
    const savedDays = g.rows[0]?.week_days
    const sameDays = (x, y) => {
      const ax = x || []
      const ay = y || []
      return ax.length === ay.length && ax.every((v, i) => Number(v) === Number(ay[i]))
    }
    const redaysed = !sameDays(g.weekDays, savedDays?.length ? savedDays : null)
    const retimed = fmtRange(g.from, g.to) !== normRange(g.rows[0]?.time_block)
    const rephotoed = g.photoRequired !== (g.rows[0]?.photo_required !== false)
    const redayed = String(g.weekDay || '') !== String(g.rows[0]?.week_day || '')
    const refreqed = g.category !== g.rows[0]?.category
      || !!g.skipSunday !== !!g.rows[0]?.skip_sunday
      || String(g.monthWeek || '') !== String(g.rows[0]?.month_week || '')
    const resopped = (g.sop || '') !== (g.rows[0]?.description || '')
      || (g.sopHi || '') !== (g.rows[0]?.description_hi || '')
      || (g.staffing || '') !== (g.rows[0]?.staffing || '')
    const reshifted = (g.shift || '') !== (g.rows[0]?.shift || '')
    const resorted = (g.sortOrder ?? null) !== (g.rows[0]?.sort_order ?? null)
    return { g, added, dropped, spare, renamed, rehindied, retimed, rephotoed, redayed, refreqed, resopped, reprioed, redued, redaysed, reshifted, resorted }
  }), [groups])

  const addCount = plan.reduce((n, x) => n + x.added.length, 0)
  const dropCount = plan.reduce((n, x) => n + x.dropped.length, 0)
  // The plan already works out what changed on every group; the sheet just
  // needs the yes/no so it can tint the row.
  const editedKeys = useMemo(() => new Set(
    plan.filter((x) => x.added.length || x.dropped.length || x.renamed || x.rehindied
      || x.retimed || x.rephotoed || x.redayed || x.refreqed || x.resopped
      || x.reprioed || x.redued || x.redaysed || x.reshifted || x.resorted).map((x) => x.g.key)
  ), [plan])
  const isEdited = (g) => editedKeys.has(g.key)

  // The same job at three venues is three groups — that is how the key is
  // built. Gathered back up, they answer "where does this run".
  //
  // The loaded groups only cover the venues in the sheet's filter, so the spread
  // read across all of them is folded in: without it a round running everywhere
  // showed one tick, and ticking a venue it already ran at made a second copy.
  // A job's own rows say where it runs. The spread is folded in for the venues
  // this sheet did not load — a single-venue admin sees only theirs, and the tick
  // list should still tell the truth about the rest.
  const jobVenues = useCallback((g) => {
    const here = g.venuesAt || []
    const everywhere = jobSpread[`${g.department}||${g.rows?.[0]?.title || g.title}`] || []
    return [...new Set([...here, ...everywhere])]
  }, [jobSpread])

  // What the tick list currently shows: the pending choice if one has been made
  // on this row, otherwise wherever the job runs today.
  const venuesOf = useCallback(
    (g) => (g.isNew ? (g.properties || []) : (g.venues || jobVenues(g))),
    [jobVenues]
  )

  // a new row counts towards Save the moment it has a title to save
  const newRows = groups.filter((g) => g.isNew && g.title.trim())

  // ...and so does a venue ticked or unticked on an existing one
  const venueEdits = groups.filter((g) => {
    if (g.isNew || !g.venues) return false
    const at = jobVenues(g)
    return g.venues.length !== at.length || g.venues.some((v) => !at.includes(v))
  })

  // Somebody already on this row whose venues have been changed, compared
  // against the venues their own rows name. A set matching where they already
  // are is not a change.
  const venueMoves = useMemo(() => {
    const out = []
    groups.forEach((g) => {
      if (g.isNew) return
      // Venues the job runs at today, and of those, the ones it keeps. A venue
      // ticked ON is written by the fan-out pass, which already carries the
      // people going there; one ticked OFF takes its rows with it. Neither is
      // this pass's business — this is only a person's venues changing among
      // the ones the job already had and is keeping.
      const runsAt = jobVenues(g)
      const keep = (g.venues || runsAt).filter((v) => runsAt.includes(v))
      ;(g.people || []).forEach((id) => {
        const want = personVenue[`${g.key}|${id}`]
        if (!want) return
        const held = (g.rows || []).filter((r) => r.assigned_to === id)
        // No rows of their own yet: they were ticked onto the job in this same
        // edit, and the added-people pass below writes them.
        if (!held.length) return
        const has = held.map((r) => r.property)
        const add = want.filter((v) => !has.includes(v) && keep.includes(v))
        const drop = held.filter((r) => !want.includes(r.property) && keep.includes(r.property))
        if (add.length || drop.length) out.push({ g, id, add, drop })
      })
    })
    return out
  }, [groups, personVenue, jobVenues])

  // A shift edit that matches what is already stored is not a change.
  const shiftCount = Object.entries(shiftEdits)
    .filter(([id, v]) => v !== (shiftApplied[id] ?? staffById.get(id)?.shift ?? '')).length

  const renameCount = plan.filter((x) => x.renamed || x.rehindied || x.reprioed || x.redued || x.redaysed || x.retimed || x.rephotoed || x.redayed || x.refreqed || x.resopped || x.reshifted || x.resorted).length
  const nothingToSave = addCount + dropCount + renameCount + newRows.length + venueEdits.length + shiftCount + venueMoves.length === 0

  // Shared by save() and createJob(): both write a Hindi title, and a title
  // that fails to translate is saved without one rather than lost.
  const hiFor = async (title) => {
    try { return await translateToHindi(title) } catch { return null }
  }

  // One row of a job, for one person, at one venue. Both places that make one —
  // a person newly ticked onto the job, and a person given another venue — build
  // it here so the two cannot drift apart. A second person on the SAME job gets
  // the same everything: frequency, window, SOP, photo rule, or the roster would
  // show one job split across two frequency bands.
  const rowFor = async (g, id, person, prop) => ({
    id: newId('t_'),
    property: prop,
    department: g.department || person?.department || user.department || 'k',
    category: g.category,
    // Trimmed, like createJob has always trimmed it. One pass doing so and the
    // other not is how 'Staff Training ' and 'Staff Training' were written by
    // the same save and then drawn as two identical-looking rows.
    title: g.title.trim(),
    title_hi: (g.title_hi || '').trim() || await hiFor(g.title.trim()),
    description: g.sop?.trim() || null,
    description_hi: (g.sopHi || '').trim()
      || (g.sop?.trim() ? await hiFor(g.sop.trim()) : null),
    staffing: g.staffing?.trim() || null,
    // Trimmed for the same reason as the title: the area is part of what makes
    // this job this job, both to the sheet and to the unique index. A stray
    // space splits one job into two that nothing can tell apart.
    area: g.area?.trim() || null,
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

  async function save() {
    setBusy(true); setErr('')
    // person + venue for every placement this save makes, so cover is recorded
    // against where they actually landed. Keyed, because the same pair can come
    // from a people-tick and a venue-tick in one save.
    const placed = new Set()
    const place = (id, prop) => { if (id && prop) placed.add(`${id}|${prop}`) }
    try {
      for (const { g, added, dropped, spare, renamed, rehindied, retimed, rephotoed, redayed, refreqed, resopped, reprioed, redued, redaysed, reshifted, resorted } of plan) {
        // anything about the JOB itself — its wording, window, photo rule, day,
        // frequency or SOP — applies to every copy of it
        if (renamed || rehindied || retimed || rephotoed || redayed || refreqed || resopped || reprioed || redued || redaysed || reshifted || resorted) {
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
            // typed Hindi wins; otherwise translate the English, and clear it
            // outright when the SOP itself has been emptied
            patch.description_hi = (g.sopHi || '').trim()
              || (g.sop?.trim() ? await hiFor(g.sop.trim()) : null)
            patch.staffing = g.staffing?.trim() || null
          }
          if (reshifted) patch.shift = g.shift || null
          if (resorted) patch.sort_order = g.sortOrder ?? null
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
        const gVenues = venuesOf(g)
        // Only where the job already runs. If they were given a venue ticked on
        // in this same save, the fan-out below writes that one — this pass
        // writing it too is how the same row got created twice.
        const gRunsAt = g.isNew ? gVenues : jobVenues(g)
        for (const id of added) {
          const person = staff.find((m) => m.id === id)
          // Every venue they were given for this job — one for nearly everybody,
          // five for a site head who covers all of them.
          for (const prop of venuesForPerson(g, id, gVenues).filter((v) => gRunsAt.includes(v))) {
            place(id, prop)
            // a spare row sits at one particular venue, so it can only be handed
            // to somebody going to that venue — otherwise it waits for one who is
            if (reuse && reuse.property === prop) {
              const { error } = await supabase.from('tasks')
                .update({ assigned_to: id, assignee_name: person?.name || null }).eq('id', reuse.id)
              if (error) throw error
              reuse = null
            } else {
              const { error } = await supabase.from('tasks')
                .insert(await rowFor(g, id, person, prop))
              if (error) throw error
            }
          }
        }
      }

      // Anyone from outside these venues who has just been given work here is
      // recorded as being on cover, so tomorrow's roster still lists them
      // without the "other venues" switch. Dates are optional: no end date
      // means until further notice.
      const coverRows = [...placed]
        .map((k) => k.split('|'))
        .filter(([id, prop]) => !memberInProperty(staffById.get(id), prop))
        .map(([id, prop]) => ({
          user_id: id,
          property: prop,
          // open-ended from today; the Cover screen is where dates get set
          from_date: todayISO(),
          to_date: null,
          created_by: user.id,
        }))
      if (coverRows.length) {
        // ignore a failure here: the assignment itself already succeeded, and a
        // missing cover record must not undo it
        await supabase.from('staff_deployments')
          .upsert(coverRows, { onConflict: 'user_id,property,from_date' })
      }

      // Rows typed straight into the sheet. createJob does the insert, so a
      // row born on the sheet and one born in the dialog land identically.
      for (const g of groups.filter((x) => x.isNew && x.title.trim())) {
        await createJobRow(g)
        ;(g.properties || []).forEach((v) => (g.people || []).forEach((id) => place(id, v)))
      }

      // Venues ticked or unticked on an existing job. Ticked = the job starts
      // running there; unticked = that venue's copy goes. Both are computed
      // against where it runs NOW, not against what the sheet last loaded.
      for (const g of groups.filter((x) => !x.isNew && x.venues)) {
        // where it runs, including venues outside the sheet's filter
        const at = jobVenues(g)
        // what the row will run at once this save lands — the choices a person's
        // venue is picked from
        const gv = g.venues
        for (const v of g.venues.filter((v2) => !at.includes(v2))) {
          // Only the people whose venue for this job IS this one. Carrying the
          // whole picked list is how somebody ended up on the same round at two
          // properties while their own row named one.
          const going = (g.people || []).filter((id) => venuesForPerson(g, id, gv).includes(v))
          await createJobRow({ ...g, properties: [v], people: going })
          going.forEach((id) => place(id, v))
        }
        for (const v of at.filter((v2) => !g.venues.includes(v2))) {
          // this job's own rows at that venue — one group holds all of them now
          const ids = (g.rows || []).filter((r) => r.property === v).map((r) => r.id)
          if (ids.length) {
            const { error } = await supabase.from('tasks').delete().in('id', ids)
            if (error) throw error
          } else {
            // A venue the sheet never loaded: no ids in memory, so it goes by
            // what identifies the job. The SAVED title — a rename in this same
            // save only touched the copies the sheet is holding.
            const { error } = await supabase.from('tasks').delete()
              .eq('property', v)
              .eq('department', g.department)
              .eq('title', g.rows[0]?.title || g.title)
            if (error) throw error
          }
        }
      }

      // Somebody's venues for this job changed. One dropped and another picked
      // up in the same edit is a move: the row travels rather than being deleted
      // and remade, because the work already recorded against it, and its place
      // in the order, belong to that row.
      for (const { g, id, add, drop } of venueMoves) {
        const person = staff.find((m) => m.id === id)
        const spares = [...drop]
        for (const v of add) {
          const r = spares.shift()
          if (r) {
            const { error } = await supabase.from('tasks').update({ property: v }).eq('id', r.id)
            if (error) throw error
          } else {
            const { error } = await supabase.from('tasks')
              .insert(await rowFor(g, id, person, v))
            if (error) throw error
          }
          place(id, v)
        }
        // Taken away and not replaced. The row is handed back, not deleted: it
        // is that venue's copy of the job, and the job still runs there — an
        // unassigned row is simply one waiting for its next person.
        for (const r of spares) {
          const { error } = await supabase.from('tasks')
            .update({ assigned_to: null, assignee_name: null }).eq('id', r.id)
          if (error) throw error
        }
      }

      // Whose shift changed. A person, not a row — one write each, and it
      // applies to every job they hold, which is the point of it being on them.
      for (const [id, sh] of Object.entries(shiftEdits)) {
        const { error } = await supabase.from('users')
          .update({ shift: sh || null }).eq('id', id)
        if (error) throw error
      }
      if (Object.keys(shiftEdits).length) {
        setShiftApplied((prev) => ({ ...prev, ...shiftEdits }))
        setShiftEdits({})
      }
      // the reload below re-reads every row's property, so the pending choices
      // have nothing left to say
      setPersonVenue({})

      // Re-read from the database rather than trusting what is in memory: the
      // save has just rewritten these rows, and a stale count on the button is
      // how you end up saving the same change twice.
      setForm(null)
      setAssignAt(null)
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
  // The sheet holds category/skipSunday; createJob wants the frequency key the
  // dialog used. One adapter, rather than a second insert path that can drift.
  const createJobRow = (g) => createJob({
    title: g.title, titleHi: g.title_hi, dept: g.department,
    // The area is part of what makes this job this job — the sheet groups on it.
    // A copy written at a new venue without it lands as a second, near-identical
    // row instead of joining the one it was spread from.
    properties: g.properties, area: g.area,
    freq: freqOf(g), weekDay: g.weekDay, weekDays: g.weekDays, monthWeek: g.monthWeek,
    from: g.from, to: g.to, shift: g.shift, sop: g.sop, sopHi: g.sopHi, staffing: g.staffing,
    photoRequired: g.photoRequired, people: g.people,
    batch: true,
  })

  async function createJob(d) {
    setBusy(true); setErr('')
    try {
      const title = d.title.trim()
      const title_hi = (d.titleHi || '').trim() || await hiFor(title)
      const sop = d.sop?.trim() || null
      const sop_hi = (d.sopHi || '').trim() || (sop ? await hiFor(sop) : null)
      // A common task goes everywhere; a normal one follows the sheet's filter.
      // A row added on the sheet names its own venues — several of them, since
      // the same round usually runs everywhere. The old dialog named none and
      // fell back to whatever the filter had selected.
      const venues = d.allProps
        ? PROPERTIES.map((pp) => pp.code)
        : (d.properties?.length ? d.properties : (d.property ? [d.property] : props))
      const chosen = d.people?.length ? d.people : []
      const combos = venues.flatMap((prop) => {
        if (!chosen.length) return [{ prop, id: null }]
        // "Everywhere" named no venues, so a named list of people is filtered by
        // who actually works where — otherwise a Pushpanjali gardener lands on
        // the Restro round. (Someone on 'all' matches every venue, correctly.)
        //
        // Named venues are different: ticking Exotica with Ajay picked names both,
        // and filtering that is answering an instruction by doing nothing. Anyone
        // placed outside their own venue is recorded as cover further down, and
        // the panel says so before you save.
        const here = d.allProps
          ? chosen.filter((id) => memberInProperty(staffById.get(id), prop))
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
          description: sop,
          description_hi: sop_hi,
          staffing: d.staffing?.trim() || null,
          area: d.area?.trim() || null,
          time_block: fmtRange(d.from, d.to) || null,
          photo_required: d.photoRequired !== false,
          week_day: spec.category === 'weekly' ? Number(spec.weekDay || 1) : null,
          week_days: spec.category === 'alternate' && d.weekDays?.length ? d.weekDays : null,
          month_week: spec.category === 'monthly' && d.monthWeek ? Number(d.monthWeek) : null,
          skip_sunday: !!spec.skipSunday,
          shift: d.shift || null,
          priority: 'medium',
          assigned_to: id || null,
          assignee_name: person?.name || null,
          status: TASK_STATUS.PENDING,
          task_date: todayISO(),
        }
      })
      // What is already there. A person on the same job at the same venue is
      // that job, not a second one — inserting them again is how one round came
      // to be listed four times on a guard's phone. Unassigned rows are left
      // alone: two blank rows on a job are two open slots, which is a real thing.
      // Venue, job, window, person. Department and frequency are tags on a job,
      // not part of which job it is — keying on them would let the same round
      // back in because one copy happened to be filed under another department.
      const jobKey = (r) => [r.property, r.title, r.time_block || '', r.assigned_to].join('|')
      const { data: present, error: readErr } = await supabase
        .from('tasks')
        .select('property, title, time_block, assigned_to')
        .in('property', venues)
        .eq('title', title)
      if (readErr) throw readErr
      const already = new Set((present || []).filter((r) => r.assigned_to).map(jobKey))
      const fresh = inserts.filter((r) => !r.assigned_to || !already.has(jobKey(r)))

      if (fresh.length) {
        const { error } = await supabase.from('tasks').insert(fresh)
        if (error) throw error
      }
      // save() reloads and toasts once for the whole batch; doing it per row
      // would reload the sheet out from under the loop
      if (!d.batch) {
        await load()
        setSaved(true)
        onSaved?.()
      }
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
  const discard = () => { setForm(null); setAssignAt(null); load() }

  // Which row is being dragged. Only the key: the sheet re-sorts from
  // sortOrder, so the move is a renumber, not a splice of the rendered list.
  const [dragKey, setDragKey] = useState(null)

  // While dragging, the wheel is dead and rows off-screen are out of reach. Near
  // either edge the page scrolls itself, ramping up as the pointer gets closer.
  useEffect(() => {
    if (!dragKey) return undefined
    const EDGE = 110      // how close to the boundary before it starts moving
    const MAX = 22        // pixels per frame at full tilt
    let speed = 0
    let frame = 0
    const onOver = (e) => {
      const h = window.innerHeight
      // Upward, the boundary is where the list actually starts — under the app
      // header, the tab row, the filter bar and the column header. A fixed offset
      // from the top of the window would sit behind all four.
      const listTop = headerH + barH + headH
      const top = e.clientY - (listTop + EDGE)
      const bottom = e.clientY - (h - EDGE)
      const ramp = (d) => Math.max(-1, Math.min(1, d / EDGE)) * MAX
      speed = top < 0 ? ramp(top) : bottom > 0 ? ramp(bottom) : 0
    }
    // One loop, not one scroll per event: dragover fires at a rate the browser
    // chooses, and scrolling inside it makes the speed depend on that rate.
    const tick = () => {
      if (speed) window.scrollBy(0, speed)
      frame = requestAnimationFrame(tick)
    }
    document.addEventListener('dragover', onOver)
    frame = requestAnimationFrame(tick)
    return () => {
      document.removeEventListener('dragover', onOver)
      cancelAnimationFrame(frame)
    }
  }, [dragKey, headerH, barH, headH])

  // A block is one department + one frequency. Dropping outside your own block
  // would have to change the schedule to keep the sheet honest, and that is not
  // what dragging a row means.
  const blockOf = useCallback((g) => {
    const r = g.rows[0] || {}
    return `${r.department ?? g.department}|${freqOf(r.category ? r : g)}`
  }, [])

  const dropOn = useCallback((target) => {
    const from = dragKey
    setDragKey(null)
    if (!from || from === target.key) return
    setGroups((prev) => {
      const moving = prev.find((x) => x.key === from)
      if (!moving || blockOf(moving) !== blockOf(target)) return prev
      // renumber the whole block in tens, so a later drag has room between rows
      const block = sheetRows.filter((x) => blockOf(x) === blockOf(target) && x.key !== from)
      const at = block.findIndex((x) => x.key === target.key)
      // Below the target when you dragged downward, above it when you dragged up.
      // Splicing at the target's index is always "above", which meant a downward
      // drag onto the next row put the row back where it started.
      const wasAbove = sheetRows.findIndex((x) => x.key === from)
        < sheetRows.findIndex((x) => x.key === target.key)
      block.splice(at < 0 ? block.length : (wasAbove ? at + 1 : at), 0, moving)
      const order = new Map(block.map((x, i) => [x.key, (i + 1) * 10]))
      return prev.map((x) => (order.has(x.key) ? { ...x, sortOrder: order.get(x.key) } : x))
    })
  }, [dragKey, blockOf, sheetRows])

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
        {nothingToSave ? t.save : `${t.save} (${addCount + dropCount + renameCount + newRows.length + venueEdits.length + shiftCount + venueMoves.length})`}
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
          {/* Only while selecting, and only over the rows on screen: with a venue
              or a department filtered, "all" cannot honestly mean rows you are not
              being shown. Tapping it again clears them. */}
          {picking && (
            <button
              type="button"
              onClick={() => setPicked((prev) => {
                const next = new Set(prev)
                if (allShownPicked) shownGroups.forEach((g) => next.delete(g.key))
                else shownGroups.forEach((g) => next.add(g.key))
                return next
              })}
              aria-pressed={allShownPicked}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '8px 13px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                background: allShownPicked ? C.maroon : C.card,
                color: allShownPicked ? '#fff' : C.maroon,
                border: `1px solid ${allShownPicked ? C.maroon : C.borderStrong}`,
                cursor: 'pointer',
              }}
            >
              <Icon name="check" size={14} color={allShownPicked ? '#fff' : C.maroon} />
              {t.all} ({shownGroups.length})
            </button>
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
        <Button variant="primary" onClick={addRow} style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }}>
          <Icon name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />{t.addTaskRow}
        </Button>
      </div>

      {/* Anchored to the cell you clicked and drawn on top of the page.
          A portal because the sheet scrolls sideways: a panel inside that
          container gets clipped at the table's edge, and the names you were
          searching for are the part that disappears. */}
      {assignAt && createPortal(
        <>
          <div
            ref={assignBox}
            style={{
              position: 'fixed', left: assignAt.left,
              ...(assignAt.up ? { bottom: assignAt.bottom } : { top: assignAt.top }),
              width: assignAt.width, maxHeight: assignAt.maxH, overflowY: 'auto', zIndex: 201,
              background: C.card, border: `1px solid ${C.borderStrong}`,
              borderRadius: 12, boxShadow: C.shadowLg, padding: 10,
            }}
          >
            {assignAt.mode === 'people' && (
            <PeoplePicker
              C={C}
              t={t}
              lang={lang}
              staff={staff}
              listMax={assignAt.maxH}
              autoFocus
              chosen={(groups.find((x) => x.key === assignAt.key) || {}).people || []}
              onToggle={(id) => togglePerson(assignAt.key, id)}
              isVisiting={isVisiting}
              shift={(groups.find((x) => x.key === assignAt.key) || {}).shift || ''}
              shiftOf={personShift}
              onSetShift={setPersonShift}
              venues={(() => {
                const ag = groups.find((x) => x.key === assignAt.key)
                return ag ? venuesOf(ag) : []
              })()}
              venuesFor={(id) => {
                const ag = groups.find((x) => x.key === assignAt.key)
                return ag ? venuesForPerson(ag, id, venuesOf(ag)) : []
              }}
              onToggleVenue={(id, code) => {
                const ag = groups.find((x) => x.key === assignAt.key)
                if (!ag) return
                toggleVenueForPerson(ag.key, id, code, venuesForPerson(ag, id, venuesOf(ag)))
              }}
            />
            )}
            {assignAt.mode === 'venues' && (() => {
              const ag = groups.find((x) => x.key === assignAt.key)
              if (!ag) return null
              const at = venuesOf(ag)
              const codes = PROPERTIES.map((pp) => pp.code)
              // A row cannot untick the venue it IS — see the delete button.
              // The last venue cannot be unticked: a job has to run somewhere, and
              // removing it entirely is the delete button's job — that one asks.
              const commit = (next) => {
                if (!next.length) return
                setGroupTime(ag.key, ag.isNew ? { properties: next } : { venues: next })
              }
              const allOn = codes.every((c) => at.includes(c))
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.tl }}>
                      {t.properties}
                    </span>
                    {/* All, and the same button takes it back off */}
                    <button
                      type="button"
                      onClick={() => commit(allOn ? at.slice(0, 1) : codes)}
                      style={{
                        border: `1.5px solid ${allOn ? C.maroon : C.border}`, borderRadius: 999,
                        background: allOn ? C.maroon : 'transparent', color: allOn ? '#fff' : C.maroon,
                        fontSize: 11, fontWeight: 800, padding: '3px 10px', cursor: 'pointer',
                      }}
                    >
                      {t.all}
                    </button>
                  </div>
                  {/* Who this leaves working outside their own venue. The cover
                      record gets written either way; saying it here is the
                      difference between an arrangement and a surprise. */}
                  {(() => {
                    const picked = (ag.people || []).map((id) => staffById.get(id)).filter(Boolean)
                    const vs = at.filter((v) => picked.some((m) => !memberInProperty(m, v)))
                    if (!vs.length) return null
                    return (
                      <div style={{ fontSize: 11.5, color: C.tl, lineHeight: 1.5, marginBottom: 7 }}>
                        {t.willCoverAt} {vs.map((v) => propName(v, lang)).join(', ')}
                      </div>
                    )
                  })()}
                  {/* Pills, wrapping, filled when on — the same reading as the
                      people above. A column of five full-width rows pushed the
                      venues below the fold of their own panel. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PROPERTIES.map((pp) => {
                      const on = at.includes(pp.code)
                      // the only untickable one is the last one left
                      const locked = on && at.length === 1
                      return (
                        <button
                          key={pp.code}
                          type="button"
                          onClick={() => (locked ? null : commit(on ? at.filter((v) => v !== pp.code) : [...at, pp.code]))}
                          title={locked ? `${propName(pp.code, lang)} — ${t.properties}` : propName(pp.code, lang)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '5px 10px', borderRadius: 999,
                            fontSize: 12.5, fontWeight: 600,
                            border: `1.5px solid ${on ? C.maroon : C.border}`,
                            background: on ? C.maroon : C.card,
                            color: on ? '#fff' : C.tl,
                            cursor: locked ? 'default' : 'pointer',
                          }}
                        >
                          {/* Always occupied, so a tick cannot change the width
                              and re-wrap the row under the cursor. */}
                          <span style={{ width: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {on ? <Icon name="check" size={12} color="#fff" /> : null}
                          </span>
                          {propName(pp.code, lang)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        </>,
        document.body
      )}

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
              {/* The page scrolls, not this box — see the height note below. */}
              <div
                ref={listRef}
                style={{
                  // No height cap, ever. With one, the box had vertical overflow
                  // of its own and swallowed the page's scroll whenever the
                  // pointer was over the sheet — which is most of the screen.
                  //
                  // And no sideways scrollport unless the columns are actually
                  // wider than the box. `overflow-x: auto` makes it a scrollport
                  // on both axes, and a sticky header inside a box that never
                  // scrolls vertically pins itself to a line that does not move.
                  // When the sheet fits, this is `visible` and the header sticks
                  // to the page instead.
                  overflowX: sheetFits ? 'visible' : 'auto',
                  border: `1px solid ${C.borderStrong}`,
                  borderRadius: 10,
                }}
                ref={sheetRef}
              >
                <div style={{ minWidth: gridMin }}>

                  <div ref={headRef} style={{
                    display: 'grid', gridTemplateColumns: flatCols,
                    background: C.cardAlt, borderBottom: `1px solid ${C.borderStrong}`,
                    // Sticky only while the wrapper is not a scrollport — see it
                    // above. Below the filter bar, and under it in z-order so the
                    // bar covers it rather than the two fighting.
                    ...(sheetFits
                      ? { position: 'sticky', top: headerH + barH, zIndex: 55 }
                      : null),
                  }}>
                    {picking && <span style={thCell} />}
                    <span style={{ ...thCell, textAlign: 'center' }}>#</span>
                    <span style={thCell}>{t.task}</span>
                    <span style={thCell}>{t.weekly}</span>
                    <span style={thCell}>{t.monthly}</span>
                    {/* The seven day letters, on one line. They carry the
                        alternate ink so the group reads as one column without a
                        word above it — "ALTERNATE" over a 32px cell made the
                        first header two lines tall and knocked the letters out
                        of line with each other. */}
                    {DAY_COLS.map((d) => (
                      <span key={d} style={{ ...thCell, textAlign: 'center', padding: '11px 1px', color: FREQ_MAP.alternate.ink }}>
                        {lang === 'hi' ? dayShort(d, lang) : DAY_INITIAL[d]}
                      </span>
                    ))}
                    <span style={{ ...thCell, textAlign: 'center' }}>{t.assigned}</span>
                    <span style={thCell}>{t.properties}</span>
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
                          // matches the rows: never narrower than the tracks, and
                          // stretches with them. A fixed width ended the band
                          // before the sheet did and left a grey tail.
                          minWidth: gridMin,
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
                    const bg = (g.isNew || edited) ? C.maroonSoft : (i % 2 ? C.cardAlt : C.card)
                    const days = rowDays(g)
                    const chip = scheduleChip(g, t, lang)
                    const names = (g.people || [])
                      .map((id) => staffById.get(id))
                      .filter(Boolean)
                      .map((m) => personName(m, lang))
                    return (
                      <div
                        key={g.key}
                        draggable={!g.isNew}
                        onDragStart={() => setDragKey(g.key)}
                        onDragEnd={() => setDragKey(null)}
                        onDragOver={(e) => { if (dragKey && dragKey !== g.key) e.preventDefault() }}
                        onDrop={(e) => { e.preventDefault(); dropOn(g) }}
                        style={{
                        borderTop: `1px solid ${C.border}`,
                        background: bg,
                        opacity: dragKey === g.key ? 0.45 : 1,
                        cursor: g.isNew ? 'default' : 'grab',
                        boxShadow: `inset 3px 0 0 ${f.ink}`,
                        // dashed while it exists only in the browser
                        outline: g.isNew ? `1px dashed ${C.maroon}` : 'none',
                        outlineOffset: -1,
                      }}>
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
                            {g.isNew ? (
                              <input
                                autoFocus
                                style={{ ...miniInput(C), fontSize: 13, fontWeight: 700, padding: '6px 8px' }}
                                value={g.title}
                                placeholder={t.newTaskTitle}
                                onChange={(e) => setGroupTime(g.key, { title: e.target.value })}
                              />
                            ) : (
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                                {lang === 'hi' && g.title_hi ? g.title_hi : g.title}
                              </div>
                            )}
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
                                {g.isNew ? t.notSavedYet : chip.text}
                              </span>
                              {/* only a gapped set needs its days spelled out —
                                  a run has already named its ends */}
                              {chip.days && (
                                <span style={{ fontSize: 10, color: C.tl, whiteSpace: 'nowrap' }}>
                                  {chip.days}
                                </span>
                              )}
                            </div>
                            {/* the Hindi line when the sheet is in Hindi, falling
                                back to the English until one has been written */}
                            {(lang === 'hi' ? (g.sopHi || g.sop) : g.sop) && (
                              <div style={{ fontSize: 11, color: C.tl, lineHeight: 1.4, marginTop: 3 }}>
                                {lang === 'hi' ? (g.sopHi || g.sop) : g.sop}
                              </div>
                            )}
                          </div>

                          {/* Four controls, one schedule. Picking in any of them
                              clears the other three. */}
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
                                    setGroupTime(g.key, setDays(next))
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
                              onClick={(e) => openAssign(e, g.key)}
                              style={{
                                width: '100%', textAlign: 'center', fontSize: 11.5, lineHeight: 1.35,
                                background: 'transparent', color: names.length ? C.maroon : C.faint,
                                fontWeight: names.length ? 700 : 600, padding: 0,
                              }}
                            >
                              {names.length ? names.join(', ') : `+ ${t.assign}`}
                            </button>
                            {g.staffing && (
                              <span style={{ display: 'block', fontSize: 10.5, color: C.faint, marginTop: 2, textAlign: 'center' }}>
                                {staffingLabel(g.staffing, lang)}
                              </span>
                            )}
                          </span>

                          {/* A new job can be created at several venues in one go —
                              the same round usually runs at all of them. An
                              existing row is one job at one venue, and changing
                              it MOVES that job, so it stays a single choice. */}
                          {/* Text, not a control. Editing happens in the assign
                              panel with the names, because who does a job and
                              where it runs are one decision — and a dropdown in
                              a cell this wide could not show its own answer. */}
                          <span style={tdCell}>
                            <button
                              type="button"
                              onClick={(e) => openAssign(e, g.key, 'venues')}
                              style={{
                                ...miniInput(C), textAlign: 'left', cursor: 'pointer',
                                // wraps rather than truncates: which venues is the
                                // whole question this column answers
                                whiteSpace: 'normal', height: 'auto',
                                fontSize: 11.5, lineHeight: 1.35, padding: '5px 8px',
                              }}
                            >
                              {venuesOf(g).length
                                ? venuesOf(g).map((v) => propName(v, lang)).join(', ')
                                : '—'}
                            </button>
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
              // from the component body — JobForm is module level and cannot
              // reach them on its own
              shiftOf={personShift}
              onSetShift={setPersonShift}
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
function PeoplePicker({ C, t, lang, staff, chosen, onToggle, isVisiting, autoFocus = false, shift, shiftOf, onSetShift, venues, venuesFor, onToggleVenue, listMax }) {
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
  // Any department can run a day/night split, so anyone can be asked.
  const canSetShift = typeof shiftOf === 'function'
  const mineShift = (m) => (canSetShift ? shiftOf(m) : '')
  // Everyone, alphabetically. A roster job often has to go to somebody from another
  // team, so the list is not narrowed to a department — and with all of them on
  // screen, the alphabet is how a reader finds a name they already have in mind.
  //
  // Former staff appear only if they are already on the job: there is a record to
  // show, but nobody would be assigning them.
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
  const suggested = needle ? [] : [...staff]
    .filter((m) => !m.inactive || chosen.includes(m.id))
    .sort(byName)
  // Ticked names keep their place in the alphabet — the list is fully on screen,
  // so a selection cannot scroll out of sight. Under a search it can, which is
  // what that rule was written for, so there they lead.
  const shown = needle ? [...picked, ...[...matches].sort(byName)] : suggested

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

      {/* The names scroll, not the panel: thirty-five people would otherwise push
          the venue pills below the bottom of it. */}
      <div style={{
        ...(canSetShift
          ? { display: 'flex', flexDirection: 'column', gap: 6 }
          : { display: 'flex', flexWrap: 'wrap', gap: 6 }),
        // The names scroll and the search box does not, so the list is given
        // whatever the panel has left after it. A fixed cap here was the
        // binding constraint no matter how tall the panel grew.
        // the search row above it, plus the panel's own padding
        maxHeight: Math.max(180, (listMax || 360) - 70), overflowY: 'auto', paddingRight: 2,
      }}>
        {staff.length === 0 && <span style={{ fontSize: 12.5, color: C.tl }}>{t.noStaffInScope}</span>}
        {staff.length > 0 && !needle && picked.length === 0 && suggested.length === 0 && (
          <span style={{ fontSize: 12.5, color: C.faint }}>{t.typeToFindPerson}</span>
        )}
        {suggested.length > 0 && shift && (
          <span style={{ width: '100%', fontSize: 11, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.tl }}>
            {t.onThisShift} · {shiftLabel(shift, lang)}
          </span>
        )}
        {needle && matches.length === 0 && (
          <span style={{ fontSize: 12.5, color: C.faint }}>{t.noMatch}</span>
        )}
        {shown.map((m) => {
          const on = chosen.includes(m.id)
          const sh = mineShift(m)
          const nameChip = (
            <button
              type="button"
              onClick={() => onToggle(m.id)}
              title={[m.department ? deptName(m.department, lang) : null, propName(m.property, lang)].filter(Boolean).join(' · ')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                border: `1.5px solid ${on ? C.maroon : C.border}`,
                background: on ? C.maroon : C.card,
                color: on ? '#fff' : C.tl,
                // a floor, so the name is never the thing that gives way: the
                // controls beside it wrap to a second line instead
                flex: canSetShift ? '1 1 110px' : undefined,
                minWidth: 0, textAlign: 'left',
              }}
            >
              {on && <Icon name="check" size={12} color="#fff" />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {personName(m, lang)}
              </span>
              {m.inactive && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                  · {t.inactiveStaff}
                </span>
              )}
              {/* Their home venue — but not when the row carries a venue select,
                  which states the venue for this job right beside it. */}
              {!m.inactive && !canSetShift && isVisiting(m) && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, flexShrink: 0 }}>
                  · {propName(m.property, lang)}
                </span>
              )}
              {/* Off a Security row there is no switch, so a mismatch is said in
                  words instead. Doubling a shift is allowed either way. */}
              {!canSetShift && !m.inactive && shift && sh && sh !== shift && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                  · {shiftLabel(sh, lang)} ({t.otherShift})
                </span>
              )}
            </button>
          )
          // Former staff keep a bare name: there is nothing to set for someone
          // who has left, only a record that they were on this job.
          if (!canSetShift || m.inactive) {
            return <span key={m.id} style={{ display: 'inline-flex' }}>{nameChip}</span>
          }
          const askVenue = typeof onToggleVenue === 'function' && (venues || []).length > 1
          const theirs = askVenue ? (venuesFor(m.id) || []) : []
          // Every name carries its venues, so the choice is there before the
          // tick rather than appearing after it. Only a name that is ON the job
          // is drawn as a block — that is what separates a decision already
          // made from a row you are still reading past.
          const showVenues = askVenue
          return (
            <div
              key={m.id}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: askVenue ? '6px 7px 7px' : 0,
                borderRadius: 10,
                // outlined once they are on the job, so the ones that count
                // stand out of a list of thirty-five
                border: `1px solid ${on && askVenue ? C.border : 'transparent'}`,
                background: on && askVenue ? C.cardAlt : 'transparent',
              }}
            >
              {/* The name, and their shift held to the right edge — one line, in
                  the same two places on every row, so the eye can run down it. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {nameChip}
                {/* Set from here. Outside the name button, because a button
                    inside a button is invalid and the inner one stops taking
                    clicks. Tapping the active one clears it. */}
                <span style={{ display: 'inline-flex', flexShrink: 0, border: `1.5px solid ${C.border}`, borderRadius: 999, overflow: 'hidden' }}>
                  {SHIFTS.map((s2) => {
                    const active = sh === s2.key
                    return (
                      <button
                        key={s2.key}
                        type="button"
                        onClick={() => onSetShift(m.id, active ? '' : s2.key)}
                        title={`${t.staffShift}: ${shiftLabel(s2.key, lang)}`}
                        aria-pressed={active}
                        style={{
                          border: 'none', padding: '4px 8px', fontSize: 11, fontWeight: 800,
                          background: active ? C.maroon : 'transparent',
                          color: active ? '#fff' : C.faint, cursor: 'pointer',
                        }}
                      >
                        {shiftLabel(s2.key, lang)}
                      </button>
                    )
                  })}
                </span>
              </div>

              {/* Where this person does it, out of the venues the job runs at.
                  Lit means they do it there. Almost always one — a site head who
                  covers every property gets every one lit, and the job is
                  written once for each. */}
              {showVenues && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                    textTransform: 'uppercase', color: C.faint, marginRight: 1,
                  }}>
                    {t.properties}
                  </span>
                  {venues.map((v) => {
                    const lit = theirs.includes(v)
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onToggleVenue(m.id, v)}
                        aria-pressed={lit}
                        style={{
                          flexShrink: 0, border: `1.5px solid ${lit ? C.maroon : C.border}`,
                          borderRadius: 999, padding: '3px 9px', fontSize: 11,
                          fontWeight: 700, cursor: 'pointer', lineHeight: 1.45,
                          background: lit ? C.maroon : 'transparent',
                          color: lit ? '#fff' : C.tl,
                        }}
                      >
                        {propName(v, lang)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
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
function JobForm({ value, staff, onChange, onCancel, onSubmit, busy, shiftOf, onSetShift }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const set = (patch) => onChange({ ...value, ...patch })
  const valid = value.title.trim() && value.dept
  // the same chip the sheet shows, so the form previews exactly what it creates
  const preview = scheduleChip({
    category: value.freq === 'dailyMS' ? 'daily'
      : value.freq === 'alternateMS' ? 'alternate' : value.freq,
    skipSunday: ['dailyMS', 'alternateMS'].includes(value.freq),
    weekDays: value.weekDays,
    weekDay: value.weekDay,
  }, t, lang)

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
      {/* The sheet's nine controls, in the sheet's order. Tick the days the job
          runs on and the frequency follows; Weekly and Monthly are for the two
          schedules a weekday pattern cannot express. */}
      <Field label={t.frequency} required hint={t.frequencyHint}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {DAY_COLS.map((d) => {
            const chosen = formDays(value)
            const on = chosen.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const next = on ? chosen.filter((x) => x !== d) : [...chosen, d]
                  // a job with no days never comes round again
                  if (!next.length) return
                  set(daysToForm(next))
                }}
                aria-pressed={on}
                aria-label={dayName(d, lang)}
                style={{
                  minWidth: 44, padding: '8px 6px', borderRadius: 9,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${on ? FREQ_MAP.alternate.ink : C.border}`,
                  background: on ? FREQ_MAP.alternate.ink : C.card,
                  color: on ? '#fff' : C.tl,
                }}
              >
                {lang === 'hi' ? dayShort(d, lang) : DAY_INITIAL[d]}
              </button>
            )
          })}
        </div>
        {/* what those ticks add up to, in the sheet's words, before you save */}
        <div style={{ fontSize: 12, fontWeight: 700, color: FREQ_MAP.alternate.ink, marginTop: 7 }}>
          {preview.text}
          {preview.days && <span style={{ fontWeight: 500, color: C.tl }}>{`  ${preview.days}`}</span>}
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

      {/* Same arrangement as the Hindi title: left blank it is written from the
          English on save, and anything typed here wins over that. */}
      <HindiInput
        label={`${t.sopColumn} — ${t.hindiTitle}`}
        hint={t.hindiForStaffHint}
        source={value.sop || ''}
        value={value.sopHi || ''}
        onChange={(v) => set({ sopHi: v })}
      />

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
          shift={value.shift || ''}
          shiftOf={shiftOf}
          onSetShift={onSetShift}
        />
      </Field>
    </Modal>
  )
}
