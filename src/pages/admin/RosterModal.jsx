import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO } from '../../lib/time'
import { translateToHindi } from '../../lib/translate'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, TASK_CATEGORIES, DEPARTMENTS, DEPARTMENT_MAP, PROPERTIES, propName, deptName,
  memberInProperty, personName,
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
// ISO weekdays, 1 = Monday. Weekly tasks carry one so a week's work spreads
// across the week instead of all landing on Monday morning.
const WEEK_DAYS = [
  { v: 1, en: 'Monday', hi: 'सोमवार' },
  { v: 2, en: 'Tuesday', hi: 'मंगलवार' },
  { v: 3, en: 'Wednesday', hi: 'बुधवार' },
  { v: 4, en: 'Thursday', hi: 'गुरुवार' },
  { v: 5, en: 'Friday', hi: 'शुक्रवार' },
  { v: 6, en: 'Saturday', hi: 'शनिवार' },
  { v: 7, en: 'Sunday', hi: 'रविवार' },
]
const dayName = (v, lang) => {
  const d = WEEK_DAYS.find((x) => x.v === Number(v))
  return d ? (lang === 'hi' ? d.hi : d.en) : ''
}

// roster grid: time | task | photo | who | actions
const COLS = '170px minmax(0,1fr) 74px minmax(0,1fr) 62px'
const HHMM = /(\d{1,2}:\d{2})/g
const parseRange = (block) => {
  const found = String(block || '').match(HHMM) || []
  return { from: found[0] || '', to: found[1] || '' }
}
const fmtRange = (from, to) => (from && to ? `${from} - ${to}` : (from || ''))

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
  const [category, setCategory] = useState('daily')
  const [rows, setRows] = useState([])        // raw task rows for this venue + category
  const [groups, setGroups] = useState([])    // one per distinct job, with its chosen people
  const [drafts, setDrafts] = useState([])    // brand-new tasks typed into the blank rows
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bulk, setBulk] = useState('')        // "assign everything to…" picker
  const [deptTab, setDeptTab] = useState('all')       // which department's round is shown
  const [expandedKey, setExpandedKey] = useState(null) // row whose people picker is open
  const [form, setForm] = useState(null)               // add/edit form, null = closed

  // staff of this venue — the only people a row may be handed to
  // Normally only the venue's own people are offered. Turning this on lists
  // everyone, so a person can be put on another venue's round for a few days —
  // the task belongs to the venue, the person keeps their own posting, and it
  // reverts by simply unticking them when they go back.
  const [anyVenue, setAnyVenue] = useState(false)
  const [coverFrom, setCoverFrom] = useState(todayISO())
  const [coverTo, setCoverTo] = useState('')          // blank = until further notice
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
    const { data } = await supabase
      .from('tasks')
      .select('id, title, title_hi, category, property, department, assigned_to, assignee_name, area, time_block, photo_required, week_day, status, started_at, before_photo, completion_photo')
      .in('property', props)
      .eq('category', category)
      .order('time_block', { ascending: true, nullsFirst: false })
      .order('title')
    setRows(data || [])
    // one entry per distinct job; `people` is the set currently doing it
    const byTitle = new Map()
    ;(data || []).forEach((r) => {
      const key = `${r.property}||${r.title}||${r.area || ''}`
      if (!byTitle.has(key)) byTitle.set(key, {
        key, property: r.property, title: r.title, title_hi: r.title_hi, area: r.area,
        time_block: r.time_block, department: r.department, weekDay: r.week_day || '',
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
  }, [props, category])

  useEffect(() => { load() }, [load])

  // One small form for both adding and editing a row. Inline inputs inside a
  // five-column grid were unusable on anything narrow, and a row being edited
  // looked nothing like a row being read.
  const openAdd = () => setForm({
    mode: 'add', dept: deptTab === 'all' ? '' : deptTab,
    title: '', from: '', to: '', photoRequired: true, people: [], weekDay: '',
  })
  const openEdit = (g) => setForm({
    mode: 'edit', key: g.key, dept: g.department || '',
    title: g.title, from: g.from || '', to: g.to || '',
    photoRequired: g.photoRequired !== false, people: g.people, weekDay: g.weekDay || '',
  })

  function applyForm(v) {
    if (v.mode === 'draft') {
      setDrafts((prev) => prev.map((d) => (d.key !== v.key ? d : {
        ...d, title: v.title, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, dept: v.dept, people: v.people,
      })))
      setForm(null)
      return
    }
    if (v.mode === 'add') {
      setDrafts((prev) => [...prev, {
        key: `d${Date.now()}${prev.length}`,
        title: v.title, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, dept: v.dept, people: v.people,
      }])
    } else {
      setGroups((prev) => prev.map((g) => (g.key !== v.key ? g : {
        ...g, title: v.title, from: v.from, to: v.to, weekDay: v.weekDay,
        photoRequired: v.photoRequired, people: v.people,
      })))
    }
    setForm(null)
  }

  const renameGroup = (key, title) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, title } : g)))

  const setGroupTime = (key, patch) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)))

  // which department's round is on screen; 'all' reads straight down the day
  const shownGroups = useMemo(
    () => (deptTab === 'all' ? groups : groups.filter((g) => g.department === deptTab)),
    [groups, deptTab]
  )

  // On the "All" tab the rows are grouped under a department heading, so the day
  // reads as four rounds rather than one long mixed list.
  const sections = useMemo(() => {
    const order = DEPARTMENTS.map((d) => d.code)
    const by = new Map()
    shownGroups.forEach((g) => {
      const key = g.department || '_'
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(g)
    })
    return [...by.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([dept, rows]) => ({ dept, rows }))
  }, [shownGroups])

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
    const retimed = fmtRange(g.from, g.to) !== (g.rows[0]?.time_block || '')
    const rephotoed = g.photoRequired !== (g.rows[0]?.photo_required !== false)
    const redayed = String(g.weekDay || '') !== String(g.rows[0]?.week_day || '')
    return { g, added, dropped, spare, renamed, retimed, rephotoed, redayed }
  }), [groups])

  const addCount = plan.reduce((n, x) => n + x.added.length, 0)
  const dropCount = plan.reduce((n, x) => n + x.dropped.length, 0)
  const renameCount = plan.filter((x) => x.renamed || x.retimed || x.rephotoed || x.redayed).length
  const filledDrafts = drafts.filter((d) => d.title.trim())
  const nothingToSave = addCount + dropCount + renameCount + filledDrafts.length === 0

  // "assign all to X" — only touches jobs nobody is on, so it can never push a
  // person onto work that is already covered
  function assignAllUnassigned() {
    if (!bulk) return
    setGroups((prev) => prev.map((g) => (g.people.length ? g : { ...g, people: [bulk] })))
    setDrafts((prev) => prev.map((d) => (d.people?.length ? d : { ...d, people: [bulk] })))
  }

  async function save() {
    setBusy(true); setErr('')
    try {
      const hiFor = async (title) => {
        try { return await translateToHindi(title) } catch { return null }
      }

      for (const { g, added, dropped, spare, renamed, retimed, rephotoed, redayed } of plan) {
        // a rename, a new window, a photo rule or a new day applies to every copy
        if (renamed || retimed || rephotoed || redayed) {
          const patch = {}
          if (renamed) {
            patch.title = g.title.trim()
            patch.title_hi = await hiFor(patch.title)
          }
          if (retimed) patch.time_block = fmtRange(g.from, g.to) || null
          if (rephotoed) patch.photo_required = g.photoRequired
          if (redayed) patch.week_day = g.weekDay ? Number(g.weekDay) : null
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
              department: person?.department || user.department || 'k',
              category,
              title: g.title,
              title_hi: g.title_hi || await hiFor(g.title),
              area: g.area || null,
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
          from_date: coverFrom || todayISO(),
          to_date: coverTo || null,
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
        const inserts = combos.map(({ prop, id }) => {
          const person = staff.find((m) => m.id === id)
          return {
            id: newId('t_'),
            property: prop,
            department: person?.department || user.department || 'k',
            category,
            title,
            title_hi,
            time_block: fmtRange(d.from, d.to) || null,
            photo_required: d.photoRequired !== false,
            week_day: category === 'weekly' && d.weekDay ? Number(d.weekDay) : null,
            department: d.dept || user.department || 'k',
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
      open onClose={onClose} maxWidth={1040}
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {TASK_CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>{t[c]}</FilterChip>
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

      {/* assign every unclaimed row in one go */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tl, whiteSpace: 'nowrap' }}>{t.assignAllTo}</span>
        <div style={{ flex: 1, minWidth: 170 }}>
          <select style={{ ...inputStyle(C), padding: '8px 10px', fontSize: 13.5 }} value={bulk} onChange={(e) => setBulk(e.target.value)}>
            <option value="">— {t.unassigned} —</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {personName(m, lang)}{m.department ? ` · ${deptName(m.department, lang)}` : ''}
              </option>
            ))}
          </select>
        </div>
        <Button variant="soft" onClick={assignAllUnassigned} disabled={!bulk} style={{ padding: '8px 14px', fontSize: 13 }}>
          {t.fillEmptyRows}
        </Button>
        <Button variant="primary" onClick={openAdd} style={{ padding: '8px 14px', fontSize: 13 }}>
          <Icon name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />{t.addTaskRow}
        </Button>
      </div>
      {/* Options strip: the cover switch on the left, the escape hatch to the
          full form on the right. They were sitting side by side as bare text,
          which read as one run-on sentence. */}
      <div
        style={{
          border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.tl, cursor: 'pointer' }}>
            <input type="checkbox" checked={anyVenue} onChange={(e) => setAnyVenue(e.target.checked)} />
            {t.recordCover}
          </label>
          {onDetailed && (
            <button
              type="button"
              onClick={onDetailed}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 700, padding: 0, whiteSpace: 'nowrap' }}
            >
              <Icon name="edit" size={13} color={C.maroon} /> {t.detailedTask}
            </button>
          )}
        </div>

        {anyVenue && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tl, marginBottom: 4 }}>{t.coverFrom}</div>
              <input type="date" style={{ ...inputStyle(C), padding: '8px 10px', fontSize: 13 }} value={coverFrom} onChange={(e) => setCoverFrom(e.target.value)} />
            </div>
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tl, marginBottom: 4 }}>{`${t.coverTo} (${t.optional})`}</div>
              <input type="date" style={{ ...inputStyle(C), padding: '8px 10px', fontSize: 13 }} min={coverFrom} value={coverTo} onChange={(e) => setCoverTo(e.target.value)} />
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 180, paddingBottom: 8, lineHeight: 1.45 }}>{t.coverHint}</div>
          </div>
        )}
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
              {drafts.map((d) => (
                <div
                  key={d.key}
                  style={{
                    display: 'grid', gridTemplateColumns: wide ? COLS : '1fr', gap: wide ? 0 : 6,
                    alignItems: 'center', padding: '9px 10px', borderRadius: 10,
                    background: C.card, border: `1px dashed ${C.maroon}`,
                  }}
                >
                  <div style={{ fontSize: 13, color: C.text, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={12} color={C.faint} />
                    {fmtRange(d.from, d.to) || <span style={{ color: C.faint }}>—</span>}
                  </div>
                  <div style={{ minWidth: 0, paddingRight: 10 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{d.title}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: C.tl, marginTop: 2 }}>
                      <span style={{ color: C.maroon, fontWeight: 700 }}>{t.notSavedYet}</span>
                      {d.dept && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: DEPARTMENT_MAP[d.dept]?.color || C.tl }} />
                          {deptName(d.dept, lang)}
                        </span>
                      )}
                      {props.length > 1 && <span>{t.createdInProperties.replace('{n}', props.length)}</span>}
                    </div>
                  </div>
                  <span style={{ justifySelf: wide ? 'start' : 'stretch', display: 'inline-flex', alignItems: 'center', gap: 5, color: d.photoRequired !== false ? C.maroon : C.faint, fontSize: 12, fontWeight: 600 }}>
                    <Icon name={d.photoRequired !== false ? 'camera' : 'close'} size={13} color={d.photoRequired !== false ? C.maroon : C.faint} />
                    {d.photoRequired !== false ? t.yes : t.no}
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: d.people?.length ? C.text : C.faint }}>
                    <Icon name="team" size={13} color={C.tl} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.people?.length
                        ? d.people.map((id) => personName(staff.find((m) => m.id === id) || {}, lang)).filter(Boolean).join(', ')
                        : t.unassigned}
                    </span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'end' }}>
                    <button
                      type="button"
                      onClick={() => setForm({ mode: 'draft', key: d.key, dept: d.dept || '', title: d.title, from: d.from || '', to: d.to || '', photoRequired: d.photoRequired !== false, people: d.people || [] })}
                      title={t.edit} aria-label={t.edit}
                      style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 2 }}
                    >
                      <Icon name="edit" size={14} color={C.tl} />
                    </button>
                    <button type="button" onClick={() => removeDraft(d.key)} title={t.delete} aria-label={t.delete} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 2 }}>
                      <Icon name="close" size={15} color={C.tl} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Table, not cards: a roster is read down columns — who is on at
                  09:00, which rows need a photo — and cards make that a hunt.
                  The people picker opens under the row it belongs to, so the
                  grid stays tight while still allowing several people per job. */}
              {wide && (
                <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '0 10px 6px', fontSize: 11, fontWeight: 700, color: C.tl, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <span>{t.timeBlock}</span>
                  <span>{t.title}</span>
                  <span>{t.photoRequired}</span>
                  <span>{t.members}</span>
                  <span />
                </div>
              )}

              {sections.map(({ dept, rows: deptRows }) => (
                <div key={dept} style={{ display: 'grid', gridTemplateColumns: wide ? '150px minmax(0,1fr)' : '1fr', gap: wide ? 12 : 6, alignItems: 'start' }}>
                  {/* department name down the left, once per round */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: wide ? 12 : 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: DEPARTMENT_MAP[dept]?.color || C.tl }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                      {dept === '_' ? t.unassigned : deptName(dept, lang)}
                    </span>
                    <span style={{ fontSize: 11.5, color: C.faint }}>{deptRows.length}</span>
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
              {deptRows.map((g) => {
                const before = g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to)
                const renamed = g.title.trim() && g.title.trim() !== g.rows[0]?.title
                const edited = renamed || g.people.length !== before.length || g.people.some((id) => !before.includes(id))
                const open = expandedKey === g.key
                const names = g.people
                  .map((id) => staff.find((m) => m.id === id))
                  .filter(Boolean)
                  .map((m) => personName(m, lang))
                return (
                  <div
                    key={g.key}
                    style={{
                      borderRadius: 10,
                      background: edited ? C.maroonSoft : C.card,
                      border: `1px solid ${edited ? C.maroon : C.border}`,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: wide ? COLS : '1fr', gap: wide ? 0 : 6, alignItems: 'center', padding: '9px 10px' }}>
                      <div style={{ fontSize: 13, color: C.text, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <>
                            <Icon name="clock" size={12} color={C.faint} />
                            {fmtRange(g.from, g.to) || <span style={{ color: C.faint }}>—</span>}
                          </>
                      </div>

                      <div style={{ minWidth: 0, paddingRight: 10 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>
                            {lang === 'hi' && g.title_hi ? g.title_hi : g.title}
                          </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: C.tl, marginTop: 2 }}>
                          {category === 'weekly' && (
                            <span style={{ fontWeight: 700, color: C.maroon }}>
                              {dayName(g.weekDay || 1, lang)}
                            </span>
                          )}
                          {props.length > 1 && <span>{propName(g.property, lang)}</span>}
                          {g.area && <span>{g.area}</span>}
                          {deptTab === 'all' && g.department && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DEPARTMENT_MAP[g.department]?.color || C.tl }} />
                              {deptName(g.department, lang)}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setGroupTime(g.key, { photoRequired: !g.photoRequired })}
                        title={t.photoRequiredHint}
                        style={{
                          justifySelf: wide ? 'start' : 'stretch',
                          display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', padding: 0,
                          color: g.photoRequired ? C.maroon : C.faint, fontSize: 12, fontWeight: 600,
                        }}
                      >
                        <Icon name={g.photoRequired ? 'camera' : 'close'} size={13} color={g.photoRequired ? C.maroon : C.faint} />
                        {g.photoRequired ? t.yes : t.no}
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedKey(open ? null : g.key)}
                        style={{
                          textAlign: 'left', background: 'transparent', padding: 0, minWidth: 0,
                          display: 'flex', alignItems: 'center', gap: 5,
                          color: names.length ? C.text : C.faint, fontSize: 12.5, fontWeight: 600,
                        }}
                      >
                        <Icon name="team" size={13} color={C.tl} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {names.length ? names.join(', ') : t.unassigned}
                        </span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'end' }}>
                        <button type="button" onClick={() => openEdit(g)} title={t.edit} aria-label={t.edit} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 2 }}>
                          <Icon name="edit" size={14} color={C.tl} />
                        </button>
                        <button type="button" onClick={() => deleteGroup(g)} title={t.delete} aria-label={t.delete} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 2 }}>
                          <Icon name="trash" size={14} color={C.red} />
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div style={{ padding: '10px', borderTop: `1px solid ${C.border}` }}>
                        <PeoplePicker chosen={g.people} onToggle={(id) => togglePerson(g.key, id)} />
                      </div>
                    )}
                  </div>
                )
              })}
                  </div>
                </div>
              ))}
            </div>
          )}


          {form && (
            <JobForm
              value={form}
              category={category}
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
function JobForm({ value, category, staff, onChange, onCancel, onSubmit }) {
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

      {/* only weekly work has a day to choose; daily is every day and monthly
          resets on the 1st */}
      {category === 'weekly' && (
        <Field label={t.dayOfWeek} hint={t.dayOfWeekHint}>
          <select style={inputStyle(C)} value={value.weekDay || ''} onChange={(e) => set({ weekDay: e.target.value })}>
            <option value="">{dayName(1, lang)} ({t.defaultLabel})</option>
            {WEEK_DAYS.map((d) => <option key={d.v} value={d.v}>{lang === 'hi' ? d.hi : d.en}</option>)}
          </select>
        </Field>
      )}

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
