import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO } from '../../lib/time'
import { translateToHindi } from '../../lib/translate'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import {
  TASK_STATUS, TASK_CATEGORIES, PROPERTIES, propName, deptName,
  memberInProperty, personName,
} from '../../constants/org'
import { Button, Loader, FilterChip, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { useConfirm } from '../../components/common/ConfirmDialog'

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

  const [property, setProperty] = useState(defaultProperty || PROPERTIES[0].code)
  const [category, setCategory] = useState('daily')
  const [rows, setRows] = useState([])        // raw task rows for this venue + category
  const [groups, setGroups] = useState([])    // one per distinct job, with its chosen people
  const [drafts, setDrafts] = useState([])    // brand-new tasks typed into the blank rows
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bulk, setBulk] = useState('')        // "assign everything to…" picker
  const [editingKey, setEditingKey] = useState(null)  // job whose title is being renamed

  // staff of this venue — the only people a row may be handed to
  const staff = useMemo(
    () => members.filter((m) => memberInProperty(m, property)),
    [members, property]
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('id, title, title_hi, category, property, assigned_to, assignee_name, area, status, started_at, before_photo, completion_photo')
      .eq('property', property)
      .eq('category', category)
      .order('title')
    setRows(data || [])
    // one entry per distinct job; `people` is the set currently doing it
    const byTitle = new Map()
    ;(data || []).forEach((r) => {
      const key = `${r.title}||${r.area || ''}`
      if (!byTitle.has(key)) byTitle.set(key, { key, title: r.title, title_hi: r.title_hi, area: r.area, rows: [] })
      byTitle.get(key).rows.push(r)
    })
    setGroups([...byTitle.values()].map((g) => ({
      ...g,
      people: g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to),
    })))
    setDrafts([])
    setLoading(false)
  }, [property, category])

  useEffect(() => { load() }, [load])

  const renameGroup = (key, title) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, title } : g)))

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
    return { g, added, dropped, spare, renamed }
  }), [groups])

  const addCount = plan.reduce((n, x) => n + x.added.length, 0)
  const dropCount = plan.reduce((n, x) => n + x.dropped.length, 0)
  const renameCount = plan.filter((x) => x.renamed).length
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

      for (const { g, added, dropped, spare, renamed } of plan) {
        // a rename applies to every person's copy of the job
        if (renamed) {
          const title = g.title.trim()
          const { error } = await supabase.from('tasks')
            .update({ title, title_hi: await hiFor(title) })
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
              property,
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

      // brand-new jobs typed into the blank rows — one task per chosen person,
      // or a single unassigned row when nobody is picked yet
      for (const d of filledDrafts) {
        const title = d.title.trim()
        const title_hi = await hiFor(title)
        const people = d.people?.length ? d.people : [null]
        const inserts = people.map((id) => {
          const person = staff.find((m) => m.id === id)
          return {
            id: newId('t_'),
            property,
            department: person?.department || user.department || 'k',
            category,
            title,
            title_hi,
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

  const addDraftRow = () => setDrafts((prev) => [...prev, { key: `d${Date.now()}${prev.length}`, title: '', people: [] }])
  const setDraft = (key, patch) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
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
            title={m.department ? deptName(m.department, lang) : undefined}
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
  )

  return (
    <Modal
      open onClose={onClose} maxWidth={840}
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {PROPERTIES.map((p) => (
            <FilterChip key={p.code} active={property === p.code} onClick={() => setProperty(p.code)}>
              {propName(p.code, lang)}
            </FilterChip>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {TASK_CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>{t[c]}</FilterChip>
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
        <Button variant="primary" onClick={addDraftRow} style={{ padding: '8px 14px', fontSize: 13 }}>
          <Icon name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />{t.addTaskRow}
        </Button>
      </div>
      {/* the roster only carries title + people; anything needing a due date,
          priority, description or time block goes through the full form */}
      {onDetailed && (
        <button
          type="button"
          onClick={onDetailed}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 12 }}
        >
          <Icon name="edit" size={13} color={C.maroon} /> {t.detailedTask}
        </button>
      )}
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12, lineHeight: 1.5 }}>{t.rosterNote}</div>

      {loading ? <Loader label={t.loading} /> : (
        <>
          {groups.length === 0 && drafts.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.tl, padding: '14px 2px' }}>{t.rosterEmpty}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {/* blank rows for work that isn't in the list yet */}
              {drafts.map((d) => (
                <div key={d.key} style={{ padding: '10px 12px', borderRadius: 10, background: C.card, border: `1px dashed ${C.borderStrong || C.border}` }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      style={{ ...inputStyle(C), padding: '8px 10px', fontSize: 13.5 }}
                      value={d.title}
                      placeholder={t.newTaskTitle}
                      onChange={(e) => setDraft(d.key, { title: e.target.value })}
                    />
                    <button type="button" onClick={() => removeDraft(d.key)} aria-label={t.delete} style={{ background: 'transparent', color: C.tl, display: 'grid', placeItems: 'center', width: 34, flexShrink: 0 }}>
                      <Icon name="close" size={16} color={C.tl} />
                    </button>
                  </div>
                  <PeoplePicker
                    chosen={d.people || []}
                    onToggle={(id) => setDraft(d.key, {
                      people: (d.people || []).includes(id)
                        ? d.people.filter((x) => x !== id)
                        : [...(d.people || []), id],
                    })}
                  />
                </div>
              ))}

              {groups.map((g) => {
                const before = g.rows.filter((r) => r.assigned_to).map((r) => r.assigned_to)
                const renamed = g.title.trim() && g.title.trim() !== g.rows[0]?.title
                const edited = renamed || g.people.length !== before.length || g.people.some((id) => !before.includes(id))
                return (
                  <div
                    key={g.key}
                    style={{
                      padding: '10px 12px', borderRadius: 10,
                      background: edited ? C.maroonSoft : C.card,
                      border: `1px solid ${edited ? C.maroon : C.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {editingKey === g.key ? (
                          // renaming changes the job for everyone doing it, so it
                          // is applied on Save with the rest, not instantly
                          <input
                            autoFocus
                            style={{ ...inputStyle(C), padding: '7px 10px', fontSize: 13.5 }}
                            value={g.title}
                            onChange={(e) => renameGroup(g.key, e.target.value)}
                            onBlur={() => setEditingKey(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingKey(null) }}
                          />
                        ) : (
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            {lang === 'hi' && g.title_hi ? g.title_hi : g.title}
                          </div>
                        )}
                        {g.area && <div style={{ fontSize: 12, color: C.tl, marginTop: 2 }}>{g.area}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: g.people.length ? C.maroon : C.faint, whiteSpace: 'nowrap' }}>
                          {g.people.length ? `${g.people.length} ${t.people}` : t.unassigned}
                        </span>
                        <button type="button" onClick={() => setEditingKey(g.key)} title={t.edit} aria-label={t.edit} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 2 }}>
                          <Icon name="edit" size={14} color={C.tl} />
                        </button>
                        <button type="button" onClick={() => deleteGroup(g)} title={t.delete} aria-label={t.delete} style={{ background: 'transparent', display: 'grid', placeItems: 'center', padding: 2 }}>
                          <Icon name="trash" size={14} color={C.red} />
                        </button>
                      </div>
                    </div>
                    <PeoplePicker chosen={g.people} onToggle={(id) => togglePerson(g.key, id)} />
                  </div>
                )
              })}
            </div>
          )}


          {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        </>
      )}
    </Modal>
  )
}
