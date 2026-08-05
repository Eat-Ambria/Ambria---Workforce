import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO, fmtDate } from '../../lib/time'
import { translateToHindi } from '../../lib/translate'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, DEPARTMENTS, DEPARTMENT_MAP, PROPERTIES, propName, deptName,
  memberInProperty, personName, PRIORITIES,
  TASK_FREQUENCIES, FREQUENCY_MAP, taskFrequency, frequencyLabel,
  WEEK_DAYS, dayName, scheduleText, staffingLabel,
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
const COLS = '38px 132px minmax(0,1.25fr) 104px 112px minmax(0,1.5fr) 92px'
// Phone: no row number, no frequency column (it moves into the task cell), and
// the task column pins to the left while the rest scrolls.
// last column fits three 34px touch targets plus their gaps (34*3 + 6*2 = 114);
// it was 92px, and the department card clips overflow, so the bin disappeared
const COLS_NARROW = '164px 104px 120px minmax(0,1.4fr) 118px'

// The seven bands and the category/skip_sunday/week_day mapping live in
// constants/org.js — the staff task list and the dashboard label tasks from the
// same source, so a job can never read "Sunday only" here and "Weekly" there.
// FREQ keeps the sheet's UPPERCASE wording for the table header.
const FREQ = TASK_FREQUENCIES
const FREQ_MAP = FREQUENCY_MAP
const freqOf = taskFrequency
const SUMMARY_COLS = ['daily', 'sunday', 'alternate', 'weekly', 'monthly']
const summaryBucket = (fk) => (fk === 'dailyMS' ? 'daily' : fk === 'alternateMS' ? 'alternate' : fk)
// Filtering wants four buckets, not seven chips. "(Mon-Sat)" is a rule about
// Sundays, not a different kind of work, and Sunday-only work IS weekly work —
// so each of those folds into its parent. The Summary still counts Sunday
// separately, because there the split is the point.
const FILTER_BANDS = ['daily', 'alternate', 'weekly', 'monthly']
const filterBucket = (fk) => (fk === 'sunday' ? 'weekly' : summaryBucket(fk))
const freqLabel = (fk, lang) => frequencyLabel(fk, lang).toUpperCase()

const MONTH_WEEKS = [
  { v: 1, en: '1st Week', hi: 'पहला हफ़्ता' },
  { v: 2, en: '2nd Week', hi: 'दूसरा हफ़्ता' },
  { v: 3, en: '3rd Week', hi: 'तीसरा हफ़्ता' },
  { v: 4, en: '4th Week', hi: 'चौथा हफ़्ता' },
]
const weekName = (v, lang) => {
  const w = MONTH_WEEKS.find((x) => x.v === Number(v))
  return w ? (lang === 'hi' ? w.hi : w.en) : ''
}

// Summary cells: a spreadsheet reads as a grid, so the cells carry the borders.
const sumHead = {
  padding: '11px 9px 9px', fontSize: 9.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.11em', textAlign: 'center',
}
const sumCell = { padding: '12px 9px', fontSize: 14, textAlign: 'center' }
// one grid for the head, the rows and the totals — three different template
// strings is how a table quietly stops lining up
const SUM_GRID = '138px repeat(5, minmax(0,1fr)) 68px'
// The first column pins itself while the rest scrolls sideways. It needs a solid
// background of its own: a transparent sticky cell lets the scrolling numbers
// slide underneath it.
const stickyCell = (bg) => ({ position: 'sticky', left: 0, zIndex: 1, background: bg })
const thCell = {
  padding: '9px 8px', fontSize: 9.5, fontWeight: 700, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.11em',
}
const tdCell = { padding: '8px' }

const HHMM = /(\d{1,2}:\d{2})/g
const parseRange = (block) => {
  const found = String(block || '').match(HHMM) || []
  return { from: found[0] || '', to: found[1] || '' }
}
const fmtRange = (from, to) => (from && to ? `${from} - ${to}` : (from || ''))
// What the stored text becomes once it has been through the two time inputs.
// The roster sheet writes "9:00-10:00 AM"; the inputs give back "9:00 - 10:00".
// Comparing the new value against the RAW text called every row an edit, so a
// roster nobody had touched offered to save 117 changes.
const normRange = (block) => fmtRange(...Object.values(parseRange(block)))

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
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()
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
  const [drafts, setDrafts] = useState([])    // brand-new tasks typed into the blank rows
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
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
      .select('id, title, title_hi, description, category, property, department, assigned_to, assignee_name, area, time_block, photo_required, week_day, month_week, skip_sunday, staffing, priority, due_date, status, started_at, before_photo, completion_photo')
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
        priority: r.priority || 'medium', dueDate: r.due_date || '',
        photoRequired: r.photo_required !== false, rows: [],
      })
      byTitle.get(key).rows.push(r)
    })
    setGroups([...byTitle.values()].map((g) => ({
      ...g,
      ...parseRange(g.time_block),
      people: g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to),
    })))
    setDrafts([])
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
    priority: 'medium', dueDate: '',
  })
  const openEdit = (g) => setForm({
    mode: 'edit', key: g.key, dept: g.department || '',
    title: g.title, titleHi: g.title_hi || '', from: g.from || '', to: g.to || '',
    photoRequired: g.photoRequired !== false, people: g.people, weekDay: g.weekDay || '',
    freq: freqOf(g), monthWeek: g.monthWeek || '', sop: g.sop || '', staffing: g.staffing || '',
    priority: g.priority || 'medium', dueDate: g.dueDate || '',
  })

  function applyForm(v) {
    if (v.mode === 'draft') {
      setDrafts((prev) => prev.map((d) => (d.key !== v.key ? d : {
        ...d, title: v.title, titleHi: v.titleHi, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, dept: v.dept, people: v.people,
        freq: v.freq, monthWeek: v.monthWeek, sop: v.sop, staffing: v.staffing,
        priority: v.priority, dueDate: v.dueDate,
      })))
      setForm(null)
      return
    }
    if (v.mode === 'add') {
      setDrafts((prev) => [...prev, {
        key: `d${Date.now()}${prev.length}`,
        title: v.title, titleHi: v.titleHi, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, dept: v.dept, people: v.people,
        freq: v.freq, monthWeek: v.monthWeek, sop: v.sop, staffing: v.staffing,
        priority: v.priority, dueDate: v.dueDate,
      }])
    } else {
      setGroups((prev) => prev.map((g) => (g.key !== v.key ? g : {
        ...g, title: v.title, title_hi: v.titleHi, from: v.from, to: v.to,
        photoRequired: v.photoRequired, people: v.people,
        sop: v.sop, staffing: v.staffing, monthWeek: v.monthWeek,
        priority: v.priority, dueDate: v.dueDate,
        ...freqSpec(v.freq, v.weekDay),
      })))
    }
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

  const setGroupTime = (key, patch) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)))

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
  const shownGroups = useMemo(
    () => groups.filter((g) => (deptTab === 'all' || g.department === deptTab)
      && (freqFilter === 'all' || filterBucket(freqOf(g)) === freqFilter)),
    [groups, deptTab, freqFilter]
  )

  // The sheet's own shape: department band, then a block per frequency inside it,
  // each block numbered and time-ordered. Reading it that way is the whole point —
  // "what does housekeeping do every day" is one block, not a filter.
  const sections = useMemo(() => {
    const deptOrder = DEPARTMENTS.map((d) => d.code)
    const freqOrder = FREQ.map((f) => f.key)
    const byDept = new Map()
    shownGroups.forEach((g) => {
      const d = g.department || '_'
      if (!byDept.has(d)) byDept.set(d, new Map())
      const fk = freqOf(g)
      const byFreq = byDept.get(d)
      if (!byFreq.has(fk)) byFreq.set(fk, [])
      byFreq.get(fk).push(g)
    })
    return [...byDept.entries()]
      .sort((a, b) => deptOrder.indexOf(a[0]) - deptOrder.indexOf(b[0]))
      .map(([dept, byFreq]) => ({
        dept,
        count: [...byFreq.values()].reduce((n, r) => n + r.length, 0),
        bands: [...byFreq.entries()]
          .sort((a, b) => freqOrder.indexOf(a[0]) - freqOrder.indexOf(b[0]))
          .map(([fk, rows]) => ({
            fk,
            rows: [...rows].sort((a, b) => (a.time_block || 'zz').localeCompare(b.time_block || 'zz')),
          })),
      }))
  }, [shownGroups])

  // The Summary sheet: how much work each department carries, by frequency.
  // Counted from the whole roster, never from the filtered view — a summary that
  // changes when you click a chip is not a summary.
  const summary = useMemo(() => {
    const blank = () => SUMMARY_COLS.reduce((m, k) => ({ ...m, [k]: 0 }), {})
    const by = DEPARTMENTS.reduce((m, d) => ({ ...m, [d.code]: blank() }), {})
    groups.forEach((g) => {
      const cell = by[g.department]
      if (!cell) return
      cell[summaryBucket(freqOf(g))] += 1
    })
    return by
  }, [groups])
  const grandTotal = useMemo(
    () => Object.values(summary).reduce((n, r) => n + SUMMARY_COLS.reduce((m, k) => m + r[k], 0), 0),
    [summary]
  )

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
    const retimed = fmtRange(g.from, g.to) !== normRange(g.rows[0]?.time_block)
    const rephotoed = g.photoRequired !== (g.rows[0]?.photo_required !== false)
    const redayed = String(g.weekDay || '') !== String(g.rows[0]?.week_day || '')
    const refreqed = g.category !== g.rows[0]?.category
      || !!g.skipSunday !== !!g.rows[0]?.skip_sunday
      || String(g.monthWeek || '') !== String(g.rows[0]?.month_week || '')
    const resopped = (g.sop || '') !== (g.rows[0]?.description || '')
      || (g.staffing || '') !== (g.rows[0]?.staffing || '')
    return { g, added, dropped, spare, renamed, rehindied, retimed, rephotoed, redayed, refreqed, resopped, reprioed, redued }
  }), [groups])

  const addCount = plan.reduce((n, x) => n + x.added.length, 0)
  const dropCount = plan.reduce((n, x) => n + x.dropped.length, 0)
  const renameCount = plan.filter((x) => x.renamed || x.rehindied || x.reprioed || x.redued || x.retimed || x.rephotoed || x.redayed || x.refreqed || x.resopped).length
  const filledDrafts = drafts.filter((d) => d.title.trim())
  const nothingToSave = addCount + dropCount + renameCount + filledDrafts.length === 0

  async function save() {
    setBusy(true); setErr('')
    try {
      const hiFor = async (title) => {
        try { return await translateToHindi(title) } catch { return null }
      }

      for (const { g, added, dropped, spare, renamed, rehindied, retimed, rephotoed, redayed, refreqed, resopped, reprioed, redued } of plan) {
        // anything about the JOB itself — its wording, window, photo rule, day,
        // frequency or SOP — applies to every copy of it
        if (renamed || rehindied || retimed || rephotoed || redayed || refreqed || resopped || reprioed || redued) {
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
        plan.flatMap(({ added }) => added).concat(filledDrafts.flatMap((d) => d.people || []))
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

      // brand-new jobs typed into the blank rows — one task per chosen person,
      // or a single unassigned row when nobody is picked yet
      for (const d of filledDrafts) {
        const title = d.title.trim()
        const title_hi = (d.titleHi || '').trim() || await hiFor(title)
        const people = d.people?.length ? d.people : [null]
        // one row per person PER SELECTED VENUE
        const combos = props.flatMap((prop) => people.map((id) => ({ prop, id })))
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
      }

      // Re-read from the database rather than trusting what is in memory: the
      // save has just rewritten these rows, and a stale count on the button is
      // how you end up saving the same change twice.
      setDrafts([])
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

  const removeDraft = (key) => setDrafts((prev) => prev.filter((d) => d.key !== key))

  // Discarding is not "close" when there is nothing to close: on the tab it
  // means throw away the unsaved edits and re-read the roster.
  const discard = () => { setDrafts([]); setForm(null); setExpandedKey(null); load() }

  const footer = (
    <>
      <Button variant="ghost" onClick={inline ? discard : onClose} disabled={inline && nothingToSave} style={{ flex: 1 }}>
        {inline ? t.discardChanges : t.cancel}
      </Button>
      <Button variant="primary" onClick={save} disabled={busy || nothingToSave} style={{ flex: 2 }}>
        {nothingToSave ? t.save : `${t.save} (${addCount + dropCount + renameCount + filledDrafts.length})`}
      </Button>
    </>
  )

  const body = (
    <>
      {/* The sheet's own masthead. The shift and the Sunday rule are the two
          facts every row is written against, so they sit above every row. */}
      <div style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14, boxShadow: C.shadow }}>
        <div style={{ background: `linear-gradient(160deg, ${C.maroon} 0%, ${C.maroonDark} 100%)`, padding: '16px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>
            {t.dutyRoster}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: '#ffffffa8', marginTop: 6 }}>
            {t.rosterShift}
            <span style={{ opacity: 0.35, margin: '0 10px' }}>·</span>
            <b style={{ color: '#fff', fontWeight: 600 }}>{dayName(todayDow, lang)}</b>
            {', '}{fmtDate(today)}
            {todayDow === 7 && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#ffffff26', borderRadius: 999, padding: '2px 8px' }}>
                {t.clientVisitDay}
              </span>
            )}
          </div>
        </div>
        {/* Summary: the whole roster's weight per department, per frequency */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: wide ? 520 : 430 }}>
            <div style={{ display: 'grid', gridTemplateColumns: SUM_GRID, background: C.card }}>
              <span style={{ ...sumHead, ...stickyCell(C.card), color: C.faint, textAlign: 'left' }}>
                {t.department}
                <span style={{ display: 'block', fontSize: 8.5, letterSpacing: '0.06em', color: C.faint, fontWeight: 600, marginTop: 2 }}>
                  {t.tapToFilter}
                </span>
              </span>
              {/* the band's colour as a 2px rule under its heading. Enough to tie
                  the column to its chips and its rows; not enough to shout. */}
              {SUMMARY_COLS.map((k) => (
                <span key={k} style={{ ...sumHead, color: C.tl, boxShadow: `inset 0 -2px 0 ${FREQ_MAP[k].ink}` }}>
                  {freqLabel(k, lang)}
                </span>
              ))}
              <span style={{ ...sumHead, color: C.faint, boxShadow: `inset 0 -2px 0 ${C.maroon}` }}>{t.total}</span>
            </div>
            {DEPARTMENTS.map((d) => {
              const r = summary[d.code] || {}
              const tot = SUMMARY_COLS.reduce((n, k) => n + (r[k] || 0), 0)
              // the row IS the filter — tap to narrow, tap again to clear
              const on = deptTab === d.code
              const rowBg = on ? C.maroonSoft : C.card
              return (
                <div
                  key={d.code}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  onClick={() => pickDept(on ? 'all' : d.code)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDept(on ? 'all' : d.code) } }}
                  style={{ display: 'grid', gridTemplateColumns: SUM_GRID, borderTop: `1px solid ${C.border}`, background: rowBg, cursor: 'pointer' }}
                >
                  {/* the department's colour as a slim bar; the name itself stays
                      plain dark text, because a coloured bar AND coloured text AND
                      a coloured column is three ways of saying the same thing */}
                  <span style={{ ...sumCell, ...stickyCell(rowBg), textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, fontWeight: on ? 800 : 600, color: on ? C.maroon : C.text }}>
                    <span style={{ width: on ? 4 : 3, alignSelf: on ? 'stretch' : undefined, height: on ? undefined : 16, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    {deptName(d.code, lang)}
                  </span>
                  {SUMMARY_COLS.map((k) => (
                    <span
                      key={k}
                      style={{
                        ...sumCell,
                        fontVariantNumeric: 'tabular-nums',
                        // a zero is absence of work: present, but it should not
                        // compete with a real figure for attention
                        color: r[k] ? C.text : C.faint,
                        fontWeight: r[k] ? 600 : 400,
                      }}
                    >
                      {r[k] || 0}
                    </span>
                  ))}
                  <span style={{ ...sumCell, fontWeight: 700, color: C.maroon, fontVariantNumeric: 'tabular-nums', borderLeft: `1px solid ${C.border}` }}>{tot}</span>
                </div>
              )
            })}
            {/* Column totals, not five blank cells. "How much daily work does a
                venue carry" is a question this table should answer. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => pickDept('all')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDept('all') } }}
              style={{ display: 'grid', gridTemplateColumns: SUM_GRID, borderTop: `1px solid ${C.borderStrong}`, background: deptTab === 'all' ? C.maroonSoft : C.cardAlt, cursor: 'pointer' }}
            >
              <span style={{ ...sumCell, ...stickyCell(deptTab === 'all' ? C.maroonSoft : C.cardAlt), textAlign: 'left', paddingLeft: 23, fontWeight: 700, color: deptTab === 'all' ? C.maroon : C.tl, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>
                {t.totalPerProperty}
              </span>
              {SUMMARY_COLS.map((k) => (
                <span key={k} style={{ ...sumCell, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                  {Object.values(summary).reduce((n, row) => n + (row[k] || 0), 0)}
                </span>
              ))}
              <span style={{ ...sumCell, fontWeight: 800, fontSize: 16, color: C.maroon, fontVariantNumeric: 'tabular-nums', borderLeft: `1px solid ${C.border}` }}>{grandTotal}</span>
            </div>
          </div>
        </div>
      </div>

      {/* The Sunday rule, spelled out where it cannot be missed */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, background: '#FFF7F7', border: `1px solid ${FREQ_MAP.sunday.ink}1f`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, lineHeight: 1.6 }}>
        <span style={{ fontSize: 14, lineHeight: 1.3, color: FREQ_MAP.sunday.ink }}>⊖</span>
        <span style={{ fontSize: 12, color: C.text }}>
          <b style={{ color: FREQ_MAP.sunday.ink, letterSpacing: '0.02em' }}>{t.sundayRuleLead}</b> {t.sundayRuleBody}
        </span>
      </div>

      {/* Venue, frequency and department in one bar that follows the page. They
          used to sit on either side of the summary, so narrowing a 121-row list
          meant scrolling back to the top for every change.
          Each chip row scrolls sideways instead of wrapping: on a phone, wrapping
          turned the bar into a third of the screen. */}
      <div
        ref={barRef}
        style={{
          position: 'sticky', top: headerH, zIndex: 20,
          background: C.bg, paddingTop: 8, paddingBottom: 8, marginBottom: 8,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canSeeAllProps && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '1 1 190px', minWidth: 170 }}>
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
          <div style={{ flex: '1 1 150px', minWidth: 135 }}>
            <MultiSelect
              single
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
          <div style={{ flex: '1 1 150px', minWidth: 135 }}>
            <MultiSelect
              single
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <Button variant="primary" onClick={openAdd} style={{ padding: '8px 14px', fontSize: 13 }}>
          <Icon name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />{t.addTaskRow}
        </Button>
      </div>

      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12, lineHeight: 1.5 }}>{t.rosterNote}</div>

      {loading ? <Loader label={t.loading} /> : (
        <>
          {shownGroups.length === 0 && drafts.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.tl, padding: '14px 2px' }}>{t.rosterEmpty}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {/* blank rows for work that isn't in the list yet */}
              {/* Rows added but not saved yet. Read-only here — the form is where
                  they are edited — so a pending row looks like a real one and the
                  table stays scannable. */}
              {drafts.map((d) => {
                const f = FREQ_MAP[d.freq || 'daily'] || FREQ_MAP.daily
                const dWhen = scheduleText(draftSchedule(d), lang)
                return (
                  <div
                    key={d.key}
                    style={{
                      border: `1px dashed ${C.maroon}`, borderRadius: 10, background: C.card,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: wide ? COLS : COLS_NARROW, alignItems: 'start' }}>
                      {wide && <span style={{ ...tdCell, color: C.maroon, fontWeight: 800, textAlign: 'center' }}>+</span>}
                      {wide && (
                        <span style={{ ...tdCell, fontSize: 11, fontWeight: 800, color: f.ink, textTransform: 'uppercase' }}>
                          {freqLabel(d.freq || 'daily', lang)}
                        </span>
                      )}
                      <div style={{ ...tdCell, minWidth: 0, ...(wide ? null : stickyCell(C.card)) }}>
                        {!wide && (
                          <div style={{ fontSize: 9.5, fontWeight: 800, color: f.ink, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                            {freqLabel(d.freq || 'daily', lang)}
                          </div>
                        )}
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{d.title}</div>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', fontSize: 11, marginTop: 2 }}>
                          <span style={{ color: C.maroon, fontWeight: 700 }}>{t.notSavedYet}</span>
                          {d.dept && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.tl }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DEPARTMENT_MAP[d.dept]?.color || C.tl }} />
                              {deptName(d.dept, lang)}
                            </span>
                          )}
                          {props.length > 1 && <span style={{ color: C.tl }}>{t.createdInProperties.replace('{n}', props.length)}</span>}
                        </div>
                      </div>
                      <span style={{ ...tdCell, fontSize: 11.5, color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>
                        {dWhen && <span style={{ display: 'block', fontWeight: 800, color: f.ink }}>{dWhen}</span>}
                        <span style={{ display: 'block', color: dWhen ? C.tl : C.text }}>{fmtRange(d.from, d.to) || '—'}</span>
                      </span>
                      <div style={{ ...tdCell, minWidth: 0 }}>
                        {d.staffing && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: C.text }}>{staffingLabel(d.staffing, lang)}</span>}
                        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: d.people?.length ? C.maroon : C.faint, overflowWrap: 'anywhere' }}>
                          {d.people?.length
                            ? d.people.map((id) => personName(staff.find((m) => m.id === id) || {}, lang)).filter(Boolean).join(', ')
                            : t.unassigned}
                        </span>
                      </div>
                      <span style={{ ...tdCell, fontSize: 11, color: C.tl, lineHeight: 1.45 }}>{d.sop || '—'}</span>
                      <div style={{ ...tdCell, display: 'flex', alignItems: 'center', gap: wide ? 4 : 6, justifyContent: wide ? 'flex-end' : 'flex-start' }}>
                        <span title={`${t.photoRequired}: ${d.photoRequired !== false ? t.yes : t.no}`} style={tapTarget}>
                          <Icon name={d.photoRequired !== false ? 'camera' : 'cameraOff'} size={iconSize} color={d.photoRequired !== false ? C.maroon : C.faint} />
                        </span>
                        <button
                          type="button"
                          onClick={() => setForm({ mode: 'draft', ...d })}
                          title={t.edit} aria-label={t.edit}
                          style={tapTarget}
                        >
                          <Icon name="edit" size={iconSize} color={C.tl} />
                        </button>
                        <button type="button" onClick={() => removeDraft(d.key)} title={t.delete} aria-label={t.delete} style={tapTarget}>
                          <Icon name="close" size={iconSize + 1} color={C.tl} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* The Master Task List, in the sheet's shape: a coloured band per
                  department, and inside it one numbered block per frequency with
                  its own header row. The six columns are the sheet's six —
                  # / Frequency / Task / Time / Assigned / SOP — and the photo rule
                  sits with the row actions so it does not add a seventh. */}
              <div ref={listRef} style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: wide ? 960 : 620, display: 'grid', gap: 14 }}>
              {sections.map(({ dept, count, bands }) => (
                <div key={dept} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* department band, the sheet's full-width colour bar */}
                  <div style={{ background: C.card, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ width: 3, height: 18, borderRadius: 2, background: dept === '_' ? C.tl : (DEPARTMENT_MAP[dept]?.color || C.tl), flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, letterSpacing: '0.01em' }}>
                      {dept === '_' ? t.unassigned : deptName(dept, lang)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                  </div>

                  {bands.map(({ fk, rows: bandRows }) => {
                    const f = FREQ_MAP[fk] || FREQ_MAP.daily
                    return (
                      <div key={fk}>
                        {/* the sheet's column header, repeated per band. Always
                            shown — on a phone the list is a scrolling table, not a
                            stack of cards, so it needs its headings. */}
                        <div style={{ display: 'grid', gridTemplateColumns: wide ? COLS : COLS_NARROW, background: C.cardAlt, borderBottom: `1px solid ${C.borderStrong}` }}>
                          {wide && <span style={thCell}>#</span>}
                          {wide && <span style={thCell}>{t.frequency}</span>}
                          <span style={{ ...thCell, ...(wide ? null : stickyCell(C.cardAlt)) }}>{t.task}</span>
                          <span style={thCell}>{t.time}</span>
                          <span style={thCell}>{t.assigned}</span>
                          <span style={thCell}>{t.sopColumn}</span>
                          <span style={thCell} />
                        </div>

                        {bandRows.map((g, i) => {
                          const before = g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to)
                          const renamed = g.title.trim() && g.title.trim() !== g.rows[0]?.title
                          const edited = renamed || g.people.length !== before.length || g.people.some((id) => !before.includes(id))
                          const open = expandedKey === g.key
                          const names = g.people
                            .map((id) => staff.find((m) => m.id === id))
                            .filter(Boolean)
                            .map((m) => personName(m, lang))
                          // Two different questions, so two lines: WHICH DAYS it
                          // comes round on, and WHAT TIME on those days.
                          const when = scheduleText(g, lang)
                          const clock = fmtRange(g.from, g.to)
                          return (
                            <div key={g.key} style={{ borderTop: `1px solid ${C.border}`, background: edited ? C.maroonSoft : (i % 2 ? C.cardAlt : C.card), boxShadow: `inset 3px 0 0 ${f.ink}` }}>
                              <div style={{ display: 'grid', gridTemplateColumns: wide ? COLS : COLS_NARROW, alignItems: 'start' }}>
                                {wide && (
                                  <span style={{ ...tdCell, color: C.tl, fontWeight: 700, textAlign: 'center' }}>{i + 1}</span>
                                )}
                                {wide && (
                                  <span style={{ ...tdCell, fontSize: 11, fontWeight: 800, color: f.ink, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                    {freqLabel(fk, lang)}
                                  </span>
                                )}
                                <div style={{ ...tdCell, minWidth: 0, ...(wide ? null : stickyCell(edited ? C.maroonSoft : (i % 2 ? C.cardAlt : C.card))) }}>
                                  {!wide && (
                                    <div style={{ fontSize: 9.5, fontWeight: 800, color: f.ink, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                                      {freqLabel(fk, lang)}
                                    </div>
                                  )}
                                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                                    {lang === 'hi' && g.title_hi ? g.title_hi : g.title}
                                  </div>
                                  {(props.length > 1 || g.area) && (
                                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', fontSize: 11, color: C.tl, marginTop: 2 }}>
                                      {props.length > 1 && <span>{propName(g.property, lang)}</span>}
                                      {g.area && <span>{g.area}</span>}
                                    </div>
                                  )}
                                </div>
                                <span style={{ ...tdCell, fontSize: 11.5, color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>
                                  {when && (
                                    <span style={{ display: 'block', fontWeight: 800, color: f.ink }}>{when}</span>
                                  )}
                                  <span style={{ display: 'block', color: when ? C.tl : C.text }}>{clock || '—'}</span>
                                </span>
                                {/* Assigned: the roster's rule on top, the actual
                                    names under it. The sheet only ever said "Any 2";
                                    the app has to know which two. */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedKey(open ? null : g.key)}
                                  title={t.tapToAssign}
                                  aria-expanded={open}
                                  style={{ ...tdCell, textAlign: 'left', background: 'transparent', minWidth: 0, display: 'block', cursor: 'pointer' }}
                                >
                                  {/* the roster's rule — plain text, not a control */}
                                  {g.staffing && (
                                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: C.text }}>{staffingLabel(g.staffing, lang)}</span>
                                  )}
                                  {/* The names ARE the button. "Unassigned" in grey
                                      text read as a status nobody could act on, so an
                                      empty job now wears an outlined "+ Assign" slot
                                      and a filled one wears its names as a pill you
                                      can see is pressable. */}
                                  {names.length ? (
                                    <span
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: g.staffing ? 3 : 0,
                                        maxWidth: '100%', padding: '3px 8px', borderRadius: 999,
                                        background: open ? C.maroon : C.maroonSoft,
                                        color: open ? '#fff' : C.maroon,
                                        border: `1px solid ${open ? C.maroon : 'transparent'}`,
                                        fontSize: 11.5, fontWeight: 700,
                                      }}
                                    >
                                      <span style={{ overflowWrap: 'anywhere' }}>{names.join(', ')}</span>
                                      <Icon name="edit" size={11} color={open ? '#fff' : C.maroon} />
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: g.staffing ? 3 : 0,
                                        padding: '3px 9px 3px 6px', borderRadius: 999,
                                        border: `1px dashed ${open ? C.maroon : C.borderStrong}`,
                                        background: open ? C.maroonSoft : 'transparent',
                                        color: open ? C.maroon : C.tl, fontSize: 11.5, fontWeight: 700,
                                      }}
                                    >
                                      <Icon name="plus" size={12} color={open ? C.maroon : C.tl} />
                                      {t.assign}
                                    </span>
                                  )}
                                </button>
                                <span style={{ ...tdCell, fontSize: 11, color: C.tl, lineHeight: 1.45 }}>
                                  {g.sop || '—'}
                                </span>
                                <div style={{ ...tdCell, display: 'flex', alignItems: 'center', gap: wide ? 4 : 6, justifyContent: wide ? 'flex-end' : 'flex-start' }}>
                                  <button
                                    type="button"
                                    onClick={() => setGroupTime(g.key, { photoRequired: !g.photoRequired })}
                                    title={`${t.photoRequired}: ${g.photoRequired ? t.yes : t.no}`}
                                    aria-label={`${t.photoRequired}: ${g.photoRequired ? t.yes : t.no}`}
                                    aria-pressed={g.photoRequired}
                                    style={tapTarget}
                                  >
                                    {/* the icon carries the whole message: a camera, or a
                                        camera with a line through it. No pill, no border. */}
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
                                <div
                                  style={{
                                    padding: '10px', borderTop: `1px solid ${C.border}`, background: C.card,
                                    // the row is 620px wide on a phone so the panel would
                                    // sit mostly off-screen; sticky-left keeps it in view
                                    ...(wide ? null : { position: 'sticky', left: 0, width: 'min(100%, 92vw)' }),
                                  }}
                                >
                                  <PeoplePicker
                                    C={C} t={t} lang={lang} staff={staff}
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
                    )
                  })}
                </div>
              ))}
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
          {footer}
        </div>
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} maxWidth={1240} title={t.roster} footer={footer}>
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
function PeoplePicker({ C, t, lang, staff, chosen, onToggle, isVisiting }) {
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
          autoFocus
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

// One row's worth of fields, as a small form. Used for both adding a job and
// editing one — the same shape either way, so there is nothing new to learn the
// second time. Nothing is written here: it hands the values back and the roster's
// Save applies them with everything else.
function JobForm({ value, staff, onChange, onCancel, onSubmit }) {
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
          <Button variant="primary" onClick={() => onSubmit(value)} disabled={!valid} style={{ flex: 2 }}>
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

      {/* Frequency first: it decides whether a day, a week of the month, or
          neither is worth asking for. "(Mon-Sat)" is the Sunday rule; "Sunday
          only" is the light work done while clients walk the property. */}
      <Field label={t.frequency} required hint={t.frequencyHint}>
        <select style={inputStyle(C)} value={value.freq || 'daily'} onChange={(e) => set({ freq: e.target.value })}>
          {FREQ.map((f) => <option key={f.key} value={f.key}>{freqLabel(f.key, lang)}</option>)}
        </select>
      </Field>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <Field label={`${t.fromTime} (${t.optional})`}>
            <input type="time" style={inputStyle(C)} value={value.from} onChange={(e) => set({ from: e.target.value })} />
          </Field>
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <Field label={`${t.toTime} (${t.optional})`}>
            <input type="time" style={inputStyle(C)} min={value.from} value={value.to} onChange={(e) => set({ to: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* a weekly job picks its day; Sunday-only already has one */}
      {value.freq === 'weekly' && (
        <Field label={t.dayOfWeek} hint={t.dayOfWeekHint}>
          <select style={inputStyle(C)} value={value.weekDay || ''} onChange={(e) => set({ weekDay: e.target.value })}>
            <option value="">{dayName(1, lang)} ({t.defaultLabel})</option>
            {WEEK_DAYS.map((d) => <option key={d.v} value={d.v}>{lang === 'hi' ? d.hi : d.en}</option>)}
          </select>
        </Field>
      )}

      {/* a monthly job picks its week, so a month's work is not all on the 1st */}
      {value.freq === 'monthly' && (
        <Field label={t.weekOfMonth} hint={t.weekOfMonthHint}>
          <select style={inputStyle(C)} value={value.monthWeek || ''} onChange={(e) => set({ monthWeek: e.target.value })}>
            <option value="">{weekName(1, lang)} ({t.defaultLabel})</option>
            {MONTH_WEEKS.map((w) => <option key={w.v} value={w.v}>{lang === 'hi' ? w.hi : w.en}</option>)}
          </select>
        </Field>
      )}

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
      <Field label={`${t.assignedTo} (${t.optional})`}>
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
