import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO } from '../../lib/time'
import { translateToHindi } from '../../lib/translate'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, DEPARTMENTS, DEPARTMENT_MAP, PROPERTIES, propName, deptName,
  memberInProperty, personName,
  TASK_FREQUENCIES, FREQUENCY_MAP, taskFrequency, frequencyLabel,
  WEEK_DAYS, dayName, scheduleText, staffingLabel,
} from '../../constants/org'
import { Button, Loader, Field, FilterChip, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import MultiSelect from '../../components/common/MultiSelect'
import Icon from '../../components/common/Icon'
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
const COLS = '38px 132px minmax(0,1.25fr) 104px 112px minmax(0,1.5fr) 66px'

// The seven bands and the category/skip_sunday/week_day mapping live in
// constants/org.js — the staff task list and the dashboard label tasks from the
// same source, so a job can never read "Sunday only" here and "Weekly" there.
// FREQ keeps the sheet's UPPERCASE wording for the table header.
const FREQ = TASK_FREQUENCIES
const FREQ_MAP = FREQUENCY_MAP
const freqOf = taskFrequency
const SUMMARY_COLS = ['daily', 'sunday', 'alternate', 'weekly', 'monthly']
const summaryBucket = (fk) => (fk === 'dailyMS' ? 'daily' : fk === 'alternateMS' ? 'alternate' : fk)
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
  padding: '8px 9px', fontSize: 10, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
}
const sumCell = { padding: '9px', fontSize: 13, fontWeight: 600, textAlign: 'center' }
// one grid for the head, the rows and the totals — three different template
// strings is how a table quietly stops lining up
const SUM_GRID = '138px repeat(5, minmax(0,1fr)) 68px'
const thCell = {
  padding: '6px 8px', fontSize: 10, fontWeight: 800, color: '#fff',
  textTransform: 'uppercase', letterSpacing: '0.04em',
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
export default function RosterModal({ user, members, canSeeAllProps, defaultProperty, onClose, onSaved, onDetailed }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const confirm = useConfirm()
  const wide = useMediaQuery('(min-width: 760px)')

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
      .select('id, title, title_hi, description, category, property, department, assigned_to, assignee_name, area, time_block, photo_required, week_day, month_week, skip_sunday, staffing, status, started_at, before_photo, completion_photo')
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
    title: '', from: '', to: '', photoRequired: true, people: [], weekDay: '',
    // a new row states its own frequency now that the roster shows them all at once
    freq: freqFilter === 'all' ? 'daily' : freqFilter, monthWeek: '', sop: '', staffing: '',
  })
  const openEdit = (g) => setForm({
    mode: 'edit', key: g.key, dept: g.department || '',
    title: g.title, from: g.from || '', to: g.to || '',
    photoRequired: g.photoRequired !== false, people: g.people, weekDay: g.weekDay || '',
    freq: freqOf(g), monthWeek: g.monthWeek || '', sop: g.sop || '', staffing: g.staffing || '',
  })

  function applyForm(v) {
    if (v.mode === 'draft') {
      setDrafts((prev) => prev.map((d) => (d.key !== v.key ? d : {
        ...d, title: v.title, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, dept: v.dept, people: v.people,
        freq: v.freq, monthWeek: v.monthWeek, sop: v.sop, staffing: v.staffing,
      })))
      setForm(null)
      return
    }
    if (v.mode === 'add') {
      setDrafts((prev) => [...prev, {
        key: `d${Date.now()}${prev.length}`,
        title: v.title, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, dept: v.dept, people: v.people,
        freq: v.freq, monthWeek: v.monthWeek, sop: v.sop, staffing: v.staffing,
      }])
    } else {
      setGroups((prev) => prev.map((g) => (g.key !== v.key ? g : {
        ...g, title: v.title, from: v.from, to: v.to,
        photoRequired: v.photoRequired, people: v.people,
        sop: v.sop, staffing: v.staffing, monthWeek: v.monthWeek,
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

  // which department's round is on screen, and which frequency band
  const shownGroups = useMemo(
    () => groups.filter((g) => (deptTab === 'all' || g.department === deptTab)
      && (freqFilter === 'all' || freqOf(g) === freqFilter)),
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
    const retimed = fmtRange(g.from, g.to) !== normRange(g.rows[0]?.time_block)
    const rephotoed = g.photoRequired !== (g.rows[0]?.photo_required !== false)
    const redayed = String(g.weekDay || '') !== String(g.rows[0]?.week_day || '')
    const refreqed = g.category !== g.rows[0]?.category
      || !!g.skipSunday !== !!g.rows[0]?.skip_sunday
      || String(g.monthWeek || '') !== String(g.rows[0]?.month_week || '')
    const resopped = (g.sop || '') !== (g.rows[0]?.description || '')
      || (g.staffing || '') !== (g.rows[0]?.staffing || '')
    return { g, added, dropped, spare, renamed, retimed, rephotoed, redayed, refreqed, resopped }
  }), [groups])

  const addCount = plan.reduce((n, x) => n + x.added.length, 0)
  const dropCount = plan.reduce((n, x) => n + x.dropped.length, 0)
  const renameCount = plan.filter((x) => x.renamed || x.retimed || x.rephotoed || x.redayed || x.refreqed || x.resopped).length
  const filledDrafts = drafts.filter((d) => d.title.trim())
  const nothingToSave = addCount + dropCount + renameCount + filledDrafts.length === 0

  async function save() {
    setBusy(true); setErr('')
    try {
      const hiFor = async (title) => {
        try { return await translateToHindi(title) } catch { return null }
      }

      for (const { g, added, dropped, spare, renamed, retimed, rephotoed, redayed, refreqed, resopped } of plan) {
        // anything about the JOB itself — its wording, window, photo rule, day,
        // frequency or SOP — applies to every copy of it
        if (renamed || retimed || rephotoed || redayed || refreqed || resopped) {
          const patch = {}
          if (renamed) {
            patch.title = g.title.trim()
            patch.title_hi = await hiFor(patch.title)
          }
          if (retimed) patch.time_block = fmtRange(g.from, g.to) || null
          if (rephotoed) patch.photo_required = g.photoRequired
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
              title_hi: g.title_hi || await hiFor(g.title),
              description: g.sop?.trim() || null,
              staffing: g.staffing?.trim() || null,
              area: g.area || null,
              time_block: fmtRange(g.from, g.to) || null,
              week_day: g.category === 'weekly' ? Number(g.weekDay || 1) : null,
              month_week: g.category === 'monthly' && g.monthWeek ? Number(g.monthWeek) : null,
              skip_sunday: !!g.skipSunday,
              photo_required: g.photoRequired !== false,
              priority: 'medium',
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
        const title_hi = await hiFor(title)
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

      onSaved()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeDraft = (key) => setDrafts((prev) => prev.filter((d) => d.key !== key))

  // Person toggles rather than a dropdown: several people per job is the normal
  // case here, and a multi-select <select> is unusable on a phone.
  const PeoplePicker = ({ chosen, onToggle }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {staff.length === 0 && <span style={{ fontSize: 12.5, color: C.tl }}>{t.noStaffInScope}</span>}
      {staff.map((m) => {
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
  )

  return (
    <Modal
      open onClose={onClose} maxWidth={1240}
      title={t.roster}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy || nothingToSave} style={{ flex: 2 }}>
            {nothingToSave ? t.save : `${t.save} (${addCount + dropCount + renameCount + filledDrafts.length})`}
          </Button>
        </>
      )}
    >
      {/* venue + recurrence pickers */}
      {canSeeAllProps && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, maxWidth: 340 }}>
          <Icon name="pin" size={16} color={C.tl} />
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
      {/* The sheet's own masthead. The shift and the Sunday rule are the two
          facts every row is written against, so they sit above every row. */}
      <div style={{ border: `1px solid ${C.borderStrong}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14, boxShadow: C.shadow }}>
        <div style={{ background: `linear-gradient(135deg, ${C.maroon} 0%, ${C.maroonDark} 100%)`, padding: '13px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff', letterSpacing: '0.06em' }}>
            {t.dutyRosterTitle}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#ffffffcc', marginTop: 5, lineHeight: 1.6 }}>
            {t.rosterShift}
            <span style={{ opacity: 0.45, margin: '0 8px' }}>|</span>
            <b style={{ color: '#fff' }}>⊖ {t.noLawnSunday}</b>
            <span style={{ opacity: 0.45, margin: '0 8px' }}>|</span>
            {t.villaAt}
          </div>
        </div>
        {/* Summary: the whole roster's weight per department, per frequency */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ display: 'grid', gridTemplateColumns: SUM_GRID, background: C.cardAlt, borderBottom: `2px solid ${C.borderStrong}` }}>
              <span style={{ ...sumHead, color: C.tl, textAlign: 'left' }}>{t.department}</span>
              {/* each heading wears its band's colour, so the column and the
                  chips and the rows below are visibly the same thing */}
              {SUMMARY_COLS.map((k) => (
                <span key={k} style={{ ...sumHead, color: FREQ_MAP[k].ink, background: FREQ_MAP[k].tint }}>
                  {freqLabel(k, lang)}
                </span>
              ))}
              <span style={{ ...sumHead, color: C.maroon }}>{t.total}</span>
            </div>
            {DEPARTMENTS.map((d) => {
              const r = summary[d.code] || {}
              const tot = SUMMARY_COLS.reduce((n, k) => n + (r[k] || 0), 0)
              return (
                <div key={d.code} style={{ display: 'grid', gridTemplateColumns: SUM_GRID, borderTop: `1px solid ${C.border}` }}>
                  {/* accent bar + the department's own ink: identity without a
                      heavy block of colour fighting the numbers beside it */}
                  <span style={{ ...sumCell, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, color: d.ink || d.color }}>
                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    {deptName(d.code, lang)}
                  </span>
                  {SUMMARY_COLS.map((k) => (
                    <span
                      key={k}
                      style={{
                        ...sumCell,
                        background: FREQ_MAP[k].tint,
                        // A zero should read quieter than a real number, but it is
                        // still information: C.faint manages only 2.1:1 on these
                        // pale tints, so a zero would be a smudge. Slate-600
                        // clears 4.5:1 on all five and still recedes.
                        color: r[k] ? FREQ_MAP[k].ink : '#475569',
                        fontWeight: r[k] ? 800 : 500,
                        fontSize: r[k] ? 14 : 13,
                      }}
                    >
                      {r[k] || 0}
                    </span>
                  ))}
                  <span style={{ ...sumCell, fontWeight: 800, fontSize: 14, color: C.maroon, background: C.maroonSoft }}>{tot}</span>
                </div>
              )
            })}
            {/* Column totals, not five blank cells. "How much daily work does a
                venue carry" is a question this table should answer. */}
            <div style={{ display: 'grid', gridTemplateColumns: SUM_GRID, borderTop: `2px solid ${C.maroon}`, background: C.maroonSoft }}>
              <span style={{ ...sumCell, textAlign: 'left', paddingLeft: 22, fontWeight: 800, color: C.maroon, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
                {t.totalPerProperty}
              </span>
              {SUMMARY_COLS.map((k) => (
                <span key={k} style={{ ...sumCell, fontWeight: 800, fontSize: 14, color: FREQ_MAP[k].ink }}>
                  {Object.values(summary).reduce((n, row) => n + (row[k] || 0), 0)}
                </span>
              ))}
              <span style={{ ...sumCell, fontWeight: 800, fontSize: 15.5, color: '#fff', background: C.maroon }}>{grandTotal}</span>
            </div>
          </div>
        </div>
      </div>

      {/* The Sunday rule, spelled out where it cannot be missed */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: FREQ_MAP.sunday.tint, borderLeft: `4px solid ${FREQ_MAP.sunday.ink}`, borderRadius: 10, padding: '11px 13px', marginBottom: 14, fontSize: 12, fontWeight: 700, color: FREQ_MAP.sunday.ink, lineHeight: 1.55 }}>
        <span style={{ fontSize: 15, lineHeight: 1.1 }}>⊖</span>
        <span>{t.sundayRule}</span>
      </div>

      {/* frequency bands, colour-coded exactly as the sheet legends them */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <FilterChip active={freqFilter === 'all'} onClick={() => setFreqFilter('all')}>{t.all}</FilterChip>
        {FREQ.map((f) => (
          <FilterChip key={f.key} dot={f.ink} active={freqFilter === f.key} onClick={() => setFreqFilter(f.key)}>
            {freqLabel(f.key, lang)}
          </FilterChip>
        ))}
      </div>
      {/* Whose round: a roster is written and read one department at a time.
          Only departments that actually have work here are offered. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <FilterChip active={deptTab === 'all'} onClick={() => setDeptTab('all')}>{t.all}</FilterChip>
        {/* every department, not only those that already have work — a round
            has to be startable for a department with nothing on it yet */}
        {DEPARTMENTS.map((d) => (
          <FilterChip key={d.code} dot={d.color} active={deptTab === d.code} onClick={() => setDeptTab(d.code)}>
            {deptName(d.code, lang)}
          </FilterChip>
        ))}
      </div>

      {/* "Assign all to …" and the cover-dates switch are both gone. Cover has
          its own screen now (Daily Task -> Cover), with the arrangement listed
          and revocable; a checkbox buried in the roster could neither show who
          was covering where nor end it. Lending someone to another venue's round
          still records the cover automatically — see save(). */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        {onDetailed && (
          <button
            type="button"
            onClick={onDetailed}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 700, padding: 0, whiteSpace: 'nowrap' }}
          >
            <Icon name="edit" size={13} color={C.maroon} /> {t.detailedTask}
          </button>
        )}
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
                      marginBottom: 8, overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: wide ? COLS : '1fr', gap: wide ? 0 : 5, alignItems: 'start' }}>
                      <span style={{ ...tdCell, color: C.maroon, fontWeight: 800, textAlign: wide ? 'center' : 'left' }}>+</span>
                      <span style={{ ...tdCell, fontSize: 11, fontWeight: 800, color: f.ink, textTransform: 'uppercase' }}>
                        {freqLabel(d.freq || 'daily', lang)}
                      </span>
                      <div style={{ ...tdCell, minWidth: 0 }}>
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
                      <div style={{ ...tdCell, display: 'flex', alignItems: 'center', gap: 4, justifyContent: wide ? 'flex-end' : 'flex-start' }}>
                        <span title={`${t.photoRequired}: ${d.photoRequired !== false ? t.yes : t.no}`} style={{ display: 'grid', placeItems: 'center', padding: 1 }}>
                          <Icon name={d.photoRequired !== false ? 'camera' : 'cameraOff'} size={14} color={d.photoRequired !== false ? C.maroon : C.faint} />
                        </span>
                        <button
                          type="button"
                          onClick={() => setForm({ mode: 'draft', ...d })}
                          title={t.edit} aria-label={t.edit}
                          style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 1 }}
                        >
                          <Icon name="edit" size={13} color={C.tl} />
                        </button>
                        <button type="button" onClick={() => removeDraft(d.key)} title={t.delete} aria-label={t.delete} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 1 }}>
                          <Icon name="close" size={14} color={C.tl} />
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
              <div style={{ overflowX: wide ? 'auto' : 'visible' }}>
              <div style={{ minWidth: wide ? 960 : 0, display: 'grid', gap: 14 }}>
              {sections.map(({ dept, count, bands }) => (
                <div key={dept} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* department band, the sheet's full-width colour bar */}
                  <div style={{ background: dept === '_' ? C.tl : (DEPARTMENT_MAP[dept]?.color || C.tl), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                      {dept === '_' ? t.unassigned : deptName(dept, lang)}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#ffffffcc' }}>{count}</span>
                  </div>

                  {bands.map(({ fk, rows: bandRows }) => {
                    const f = FREQ_MAP[fk] || FREQ_MAP.daily
                    return (
                      <div key={fk}>
                        {/* the sheet's dark column header, repeated per band */}
                        {wide && (
                          <div style={{ display: 'grid', gridTemplateColumns: COLS, background: '#2F3742' }}>
                            <span style={thCell}>#</span>
                            <span style={thCell}>{t.frequency}</span>
                            <span style={thCell}>{t.task}</span>
                            <span style={thCell}>{t.time}</span>
                            <span style={thCell}>{t.assigned}</span>
                            <span style={thCell}>{t.sopColumn}</span>
                            <span style={thCell} />
                          </div>
                        )}

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
                            <div key={g.key} style={{ borderTop: `1px solid ${C.border}`, background: edited ? C.maroonSoft : f.tint }}>
                              <div style={{ display: 'grid', gridTemplateColumns: wide ? COLS : '1fr', gap: wide ? 0 : 5, alignItems: 'start', padding: wide ? 0 : '9px 10px' }}>
                                <span style={{ ...tdCell, color: C.tl, fontWeight: 700, textAlign: wide ? 'center' : 'left' }}>{i + 1}</span>
                                <span style={{ ...tdCell, fontSize: 11, fontWeight: 800, color: f.ink, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                  {freqLabel(fk, lang)}
                                </span>
                                <div style={{ ...tdCell, minWidth: 0 }}>
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
                                  style={{ ...tdCell, textAlign: 'left', background: 'transparent', minWidth: 0, display: 'block' }}
                                >
                                  {g.staffing && (
                                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: C.text }}>{staffingLabel(g.staffing, lang)}</span>
                                  )}
                                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: names.length ? C.maroon : C.faint, marginTop: g.staffing ? 2 : 0, overflowWrap: 'anywhere' }}>
                                    {names.length ? names.join(', ') : t.unassigned}
                                  </span>
                                </button>
                                <span style={{ ...tdCell, fontSize: 11, color: C.tl, lineHeight: 1.45 }}>
                                  {g.sop || '—'}
                                </span>
                                <div style={{ ...tdCell, display: 'flex', alignItems: 'center', gap: 4, justifyContent: wide ? 'flex-end' : 'flex-start' }}>
                                  <button
                                    type="button"
                                    onClick={() => setGroupTime(g.key, { photoRequired: !g.photoRequired })}
                                    title={`${t.photoRequired}: ${g.photoRequired ? t.yes : t.no}`}
                                    aria-label={`${t.photoRequired}: ${g.photoRequired ? t.yes : t.no}`}
                                    aria-pressed={g.photoRequired}
                                    style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 1 }}
                                  >
                                    {/* the icon carries the whole message: a camera, or a
                                        camera with a line through it. No pill, no border. */}
                                    <Icon name={g.photoRequired ? 'camera' : 'cameraOff'} size={14} color={g.photoRequired ? C.maroon : C.faint} />
                                  </button>
                                  <button type="button" onClick={() => openEdit(g)} title={t.edit} aria-label={t.edit} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 1 }}>
                                    <Icon name="edit" size={13} color={C.tl} />
                                  </button>
                                  <button type="button" onClick={() => deleteGroup(g)} title={t.delete} aria-label={t.delete} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 1 }}>
                                    <Icon name="trash" size={13} color={C.red} />
                                  </button>
                                </div>
                              </div>

                              {open && (
                                <div style={{ padding: '10px', borderTop: `1px solid ${C.border}`, background: C.card }}>
                                  <PeoplePicker chosen={g.people} onToggle={(id) => togglePerson(g.key, id)} />
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
    </Modal>
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

      <Field label={`${t.members} (${t.optional})`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {staff.map((m) => {
            const on = value.people.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => set({
                  people: on ? value.people.filter((x) => x !== m.id) : [...value.people, m.id],
                })}
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
              </button>
            )
          })}
        </div>
      </Field>
    </Modal>
  )
}
