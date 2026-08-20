import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fmtDate } from '../../../../lib/time'
import { useColors } from '../../../../context/ThemeContext'
import { useT, useLang } from '../../../../context/LangContext'
import { scopedProperty, scopedDepartment, DEPARTMENT_MAP, personName, deptName } from '../../../../constants/org'
import { Button, Field, inputStyle, Loader } from '../../../../components/common/UI'
import Modal from '../../../../components/common/Modal'
import Icon from '../../../../components/common/Icon'

// Admin: assign a video to specific staff, each with a shared deadline.
export default function AssignModal({ video, user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [staff, setStaff] = useState(null)
  const [assigned, setAssigned] = useState({}) // user_id -> deadline (existing)
  const [picked, setPicked] = useState(new Set())
  const [deadline, setDeadline] = useState(video.deadline || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const propScope = scopedProperty(user)
    const deptScope = scopedDepartment(user)
    let q = supabase.from('users').select('id, name, name_hi, department, property').eq('is_active', true).eq('role', 'e').order('name')
    if (propScope) q = q.eq('property', propScope)
    if (deptScope) q = q.eq('department', deptScope)
    const { data: users } = await q

    const { data: rows } = await supabase.from('training_assignments').select('user_id, deadline').eq('video_id', video.id)
    const amap = {}
    ;(rows || []).forEach((r) => { amap[r.user_id] = r.deadline })
    // Only tick people this picker can actually show. An assignment can belong to
    // someone absent from the list — deactivated, promoted to admin, or outside
    // this admin's scope — and counting those made the total disagree with the
    // ticks. Their rows are left untouched on save.
    const listed = new Set((users || []).map((u) => u.id))
    setAssigned(amap)
    setPicked(new Set(Object.keys(amap).filter((id) => listed.has(id))))
    setStaff(users || [])
  }, [user, video.id])
  useEffect(() => { load() }, [load])

  const listedIds = useMemo(() => new Set((staff || []).map((s) => s.id)), [staff])
  // people who already have this video but cannot appear in the list
  const hiddenCount = useMemo(
    () => Object.keys(assigned).filter((id) => !listedIds.has(id)).length,
    [assigned, listedIds]
  )
  // already-assigned staff sort to the top; the rest stay alphabetical
  const ordered = useMemo(() => {
    if (!staff) return []
    return [...staff].sort((a, b) => {
      const aa = assigned[a.id] !== undefined ? 0 : 1
      const bb = assigned[b.id] !== undefined ? 0 : 1
      return aa !== bb ? aa - bb : (a.name || '').localeCompare(b.name || '')
    })
  }, [staff, assigned])

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function save() {
    setBusy(true); setErr('')
    const ids = [...picked].filter((id) => listedIds.has(id))
    // an unticked row only counts as a removal if it was on screen to untick
    const toRemove = Object.keys(assigned).filter((id) => listedIds.has(id) && !picked.has(id))

    if (ids.length) {
      const rows = ids.map((uid) => ({ video_id: video.id, user_id: uid, deadline: deadline || null, assigned_by: user.id }))
      const { error } = await supabase.from('training_assignments').upsert(rows, { onConflict: 'video_id,user_id' })
      if (error) { setBusy(false); setErr(error.message); return }
    }
    if (toRemove.length) {
      await supabase.from('training_assignments').delete().eq('video_id', video.id).in('user_id', toRemove)
    }
    setBusy(false)
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={`${t.assign} — ${video.topic}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      {staff === null ? <Loader /> : (
        <>
          <Field label={t.deadlineForStaff} hint={t.deadlineAppliesHint}>
            <input type="date" style={inputStyle(C)} value={deadline || ''} onChange={(e) => setDeadline(e.target.value)} />
          </Field>

          <div style={{ fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: hiddenCount ? 4 : 8 }}>
            {picked.size} {t.staffSelected}
          </div>
          {hiddenCount > 0 && (
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 8, lineHeight: 1.45 }}>
              {t.assignedNotListed.replace('{n}', hiddenCount)}
            </div>
          )}

          {staff.length === 0 ? (
            <div style={{ fontSize: 13, color: C.tl, padding: 12 }}>{t.noStaffInScope}</div>
          ) : (
            <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {ordered.map((s) => {
                const on = picked.has(s.id)
                const dept = DEPARTMENT_MAP[s.department]
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      padding: '10px 12px', borderRadius: 10,
                      border: `1.5px solid ${on ? C.maroon : C.border}`,
                      background: on ? C.maroonSoft : C.card,
                    }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: on ? C.brandBg : C.card, border: `1px solid ${on ? C.brandBg : C.borderStrong}` }}>
                      {on && <Icon name="check" size={14} color="#fff" />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{personName(s, lang)}</div>
                      {dept && <div style={{ fontSize: 12, color: dept.color, fontWeight: 600 }}>{deptName(s.department, lang)}</div>}
                    </div>
                    {assigned[s.id] !== undefined && (
                      <span style={{ fontSize: 11, color: C.tl }}>{assigned[s.id] ? fmtDate(assigned[s.id]) : t.assigned}</span>
                    )}
                  </button>
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
