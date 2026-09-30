import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useLang } from '../../context/LangContext'
import {
  personName, propName, memberInProperty, scopedProperty, scopedDepartment,
  WORK_ASSIGNEE_ROLES,
} from '../../constants/org'
import { Button, Field, Loader, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'

// Everything one person holds, handed to another in one go.
//
// Built for somebody leaving. Do it BEFORE switching their account off:
// deactivating unassigns their roster work (Users.jsx), and after that there is
// nothing left here with their name on it to move.
//
// What moves: their roster jobs, and their repair requests that are still open.
// What does not: their history. task_completions keeps the name of whoever
// actually did each job, so Analytics goes on crediting them for work they did.
//
// Two kinds of job are left where they are, and the preview names them before
// anything is saved:
//   - one the new person already holds at that venue. Moving it would give them
//     the same job twice, which is the duplicate the roster has already had to
//     be cleaned of once (SUPABASE-MIGRATION-ONE-VENUE-PER-PERSON.sql).
//   - one at a venue the new person does not work at. It would land in their
//     list for a site they are never at.
// Both are rare, both need a person to decide, and neither should be guessed.

// Same job = same title at the same venue in the same frequency, ignoring case
// and stray spaces. The time window is not in it: two copies of one round at
// the same site for the same person is the duplicate whatever the hour says.
const jobKey = (r) => `${(r.title || '').trim().toLowerCase()}|${r.property}|${r.category}`

const OPEN_REPAIR = (s) => s !== 'approved' && s !== 'completed'

/**
 * Which of `fromId`'s work can go to `to`, and which has to stay.
 *
 * `tasks` and `repairs` are everything in scope, anybody's — the new person's
 * own rows are needed to spot a job they already hold.
 */
export function planTransfer({ tasks, repairs, fromId, to }) {
  const already = new Set(tasks.filter((r) => r.assigned_to === to.id).map(jobKey))
  const move = []; const dup = []; const venue = []
  tasks.filter((r) => r.assigned_to === fromId).forEach((r) => {
    if (!memberInProperty(to, r.property)) venue.push(r)
    else if (already.has(jobKey(r))) dup.push(r)
    else move.push(r)
  })
  const fixMove = []; const fixVenue = []
  repairs.filter((r) => r.assigned_to === fromId).forEach((r) => {
    if (memberInProperty(to, r.property)) fixMove.push(r)
    else fixVenue.push(r)
  })
  return { move, dup, venue, fixMove, fixVenue }
}

export default function TransferWorkModal({ user, onClose, onDone }) {
  const C = useColors()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const propScope = scopedProperty(user)
  const deptScope = scopedDepartment(user)

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [repairs, setRepairs] = useState([])
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)
  const [showSkipped, setShowSkipped] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Everything assigned to anybody, inside this admin's own scope — an admin
      // locked to one venue moves that venue's work and nothing else.
      let tq = supabase.from('tasks')
        .select('id, title, title_hi, property, department, category, status, assigned_to, assignee_name')
        .not('assigned_to', 'is', null)
        .limit(5000)
      let rq = supabase.from('work_board')
        .select('id, title, title_hi, property, department, status, assigned_to, assigned_to_name')
        .not('assigned_to', 'is', null)
      if (propScope) { tq = tq.eq('property', propScope); rq = rq.eq('property', propScope) }
      if (deptScope) { tq = tq.eq('department', deptScope); rq = rq.eq('department', deptScope) }
      const [u, tr, rr] = await Promise.all([
        // inactive too: somebody switched off with work still on them is the
        // person this is most needed for
        supabase.from('users').select('id, name, name_hi, role, property, department, is_active').order('name'),
        tq, rq,
      ])
      if (!alive) return
      setUsers(u.data || [])
      setTasks(tr.data || [])
      setRepairs((rr.data || []).filter((r) => OPEN_REPAIR(r.status)))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [propScope, deptScope])

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  // Only people who have something to hand over, with how much — choosing a
  // name and finding nothing to move is a question the list can answer first.
  const fromOptions = useMemo(() => {
    const n = new Map()
    tasks.forEach((r) => n.set(r.assigned_to, (n.get(r.assigned_to) || 0) + 1))
    repairs.forEach((r) => n.set(r.assigned_to, (n.get(r.assigned_to) || 0) + 1))
    return [...n.entries()]
      .map(([id, count]) => {
        const u = byId.get(id)
        const row = tasks.find((r) => r.assigned_to === id)
        return {
          id, count,
          name: (u && personName(u, lang)) || row?.assignee_name || id,
          inactive: !u || u.is_active === false,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks, repairs, byId, lang])

  const from = byId.get(fromId) || null
  const to = byId.get(toId) || null

  const toOptions = useMemo(() => users
    .filter((u) => u.is_active !== false && WORK_ASSIGNEE_ROLES.includes(u.role) && u.id !== fromId)
    // the same scope the admin assigns within everywhere else
    .filter((u) => !propScope || memberInProperty(u, propScope)), [users, fromId, propScope])

  const plan = useMemo(
    () => (fromId && to ? planTransfer({ tasks, repairs, fromId, to }) : null),
    [fromId, to, tasks, repairs],
  )

  const nothing = plan && plan.move.length === 0 && plan.fixMove.length === 0
  const toName = to ? personName(to, lang) : ''
  const fromName = fromOptions.find((o) => o.id === fromId)?.name || ''
  const titleOf = (r) => (hi && r.title_hi) || r.title

  async function transfer() {
    if (!plan || nothing) return
    setBusy(true); setErr('')
    // `.eq('assigned_to', fromId)` on both: a row somebody reassigned while this
    // screen was open stays with whoever they gave it to.
    const [tr, rr] = await Promise.all([
      plan.move.length
        ? supabase.from('tasks')
          .update({ assigned_to: to.id, assignee_name: to.name })
          .in('id', plan.move.map((r) => r.id))
          .eq('assigned_to', fromId)
          .select('id')
        : Promise.resolve({ data: [] }),
      plan.fixMove.length
        ? supabase.from('work_board')
          .update({ assigned_to: to.id, assigned_to_name: to.name })
          .in('id', plan.fixMove.map((r) => r.id))
          .eq('assigned_to', fromId)
          .select('id')
        : Promise.resolve({ data: [] }),
    ])
    setBusy(false)
    const failed = tr.error || rr.error
    if (failed) { setErr(failed.message); return }
    setDone({ tasks: (tr.data || []).length, repairs: (rr.data || []).length })
    onDone?.()
  }

  const line = (icon, color, text) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
      <Icon name={icon} size={15} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={hi ? 'काम ट्रांसफ़र करें' : 'Transfer work'}
      footer={done ? (
        <Button variant="primary" onClick={onClose} style={{ flex: 1 }}>{hi ? 'ठीक है' : 'Done'}</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{hi ? 'रद्द करें' : 'Cancel'}</Button>
          <Button variant="primary" onClick={transfer} disabled={busy || !plan || nothing} style={{ flex: 2 }}>
            {hi ? 'ट्रांसफ़र करें' : 'Transfer'}
          </Button>
        </>
      )}
    >
      {loading ? <Loader /> : done ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {line('check', C.green, hi
            ? `${done.tasks} काम और ${done.repairs} रिपेयर अब ${toName} के नाम हैं।`
            : `${done.tasks} jobs and ${done.repairs} repairs are now ${toName}'s.`)}
          {plan && (plan.dup.length + plan.venue.length + plan.fixVenue.length) > 0 && line('warning', C.yellow, hi
            ? `${plan.dup.length + plan.venue.length + plan.fixVenue.length} ${fromName} के पास ही रहे — रोस्टर में देख लें।`
            : `${plan.dup.length + plan.venue.length + plan.fixVenue.length} stayed with ${fromName} — sort those out in the roster.`)}
        </div>
      ) : (
        <>
          <Field label={hi ? 'किसका काम' : 'Whose work'}>
            <select style={inputStyle(C)} value={fromId} onChange={(e) => { setFromId(e.target.value); setShowSkipped(false) }}>
              <option value="">—</option>
              {fromOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.inactive ? (hi ? ' (बंद)' : ' (inactive)') : ''} · {o.count}
                </option>
              ))}
            </select>
          </Field>

          <Field label={hi ? 'किसको देना है' : 'Give it to'}>
            <select style={inputStyle(C)} value={toId} onChange={(e) => { setToId(e.target.value); setShowSkipped(false) }} disabled={!fromId}>
              <option value="">—</option>
              {toOptions.map((u) => (
                <option key={u.id} value={u.id}>{personName(u, lang)} · {propName(u.property, lang)}</option>
              ))}
            </select>
          </Field>

          {!fromId && (
            <div style={{ fontSize: 12.5, color: C.tl, lineHeight: 1.5 }}>
              {hi
                ? 'किसी को बंद (inactive) करने से पहले करें — बंद करते ही उसका काम किसी के नाम नहीं रहता, फिर यहाँ ट्रांसफ़र करने को कुछ नहीं बचता।'
                : 'Do this before switching someone\'s account off — deactivating unassigns their work, and then there is nothing left here to move.'}
            </div>
          )}

          {plan && (
            <div style={{
              display: 'grid', gap: 8, padding: '12px 13px', borderRadius: 12,
              background: C.cardAlt, border: `1px solid ${C.border}`,
            }}>
              {nothing
                ? line('info', C.tl, hi ? `${toName} को देने लायक कुछ नहीं है।` : `Nothing here can go to ${toName}.`)
                : line('check', C.green, hi
                  ? `${plan.move.length} काम और ${plan.fixMove.length} खुले रिपेयर ${toName} को जाएँगे।`
                  : `${plan.move.length} jobs and ${plan.fixMove.length} open repairs will go to ${toName}.`)}
              {plan.dup.length > 0 && line('warning', C.yellow, hi
                ? `${plan.dup.length} नहीं जाएँगे — ${toName} के पास उसी जगह पहले से यही काम है।`
                : `${plan.dup.length} will not — ${toName} already has the same job at that venue.`)}
              {(plan.venue.length + plan.fixVenue.length) > 0 && line('warning', C.yellow, hi
                ? `${plan.venue.length + plan.fixVenue.length} नहीं जाएँगे — ये उस जगह के हैं जहाँ ${toName} नहीं है।`
                : `${plan.venue.length + plan.fixVenue.length} will not — they are at a venue ${toName} does not work at.`)}

              {(plan.dup.length + plan.venue.length + plan.fixVenue.length) > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSkipped((v) => !v)}
                    style={{ justifySelf: 'start', background: 'transparent', padding: 0, fontSize: 12.5, fontWeight: 700, color: C.maroon }}
                  >
                    {showSkipped ? (hi ? 'छिपाएँ' : 'Hide which') : (hi ? 'कौन-से, देखें' : 'Show which')}
                  </button>
                  {showSkipped && (
                    <div style={{ display: 'grid', gap: 4, fontSize: 12.5, color: C.tl }}>
                      {[...plan.dup, ...plan.venue, ...plan.fixVenue].map((r) => (
                        <div key={r.id}>{titleOf(r)} · {propName(r.property, lang)}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
        </>
      )}
    </Modal>
  )
}
