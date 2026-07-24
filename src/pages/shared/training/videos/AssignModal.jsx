import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { fmtDate } from '../../../../lib/time'
import { useColors } from '../../../../context/ThemeContext'
import { useT } from '../../../../context/LangContext'
import { scopedProperty, scopedDepartment, DEPARTMENT_MAP } from '../../../../constants/org'
import { Button, Field, inputStyle, Loader } from '../../../../components/common/UI'
import Modal from '../../../../components/common/Modal'
import Icon from '../../../../components/common/Icon'

// Admin: assign a video to specific staff, each with a shared deadline.
export default function AssignModal({ video, user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [staff, setStaff] = useState(null)
  const [assigned, setAssigned] = useState({}) // user_id -> deadline (existing)
  const [picked, setPicked] = useState(new Set())
  const [deadline, setDeadline] = useState(video.deadline || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const propScope = scopedProperty(user)
    const deptScope = scopedDepartment(user)
    let q = supabase.from('users').select('id, name, department, property').eq('is_active', true).eq('role', 'e').order('name')
    if (propScope) q = q.eq('property', propScope)
    if (deptScope) q = q.eq('department', deptScope)
    const { data: users } = await q

    const { data: rows } = await supabase.from('training_assignments').select('user_id, deadline').eq('video_id', video.id)
    const amap = {}
    ;(rows || []).forEach((r) => { amap[r.user_id] = r.deadline })
    setAssigned(amap)
    setPicked(new Set(Object.keys(amap)))
    setStaff(users || [])
  }, [user, video.id])
  useEffect(() => { load() }, [load])

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function save() {
    setBusy(true); setErr('')
    const ids = [...picked]
    const toRemove = Object.keys(assigned).filter((id) => !picked.has(id))

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
      open onClose={onClose} title={`Assign — ${video.topic}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      {staff === null ? <Loader /> : (
        <>
          <Field label="Deadline for assigned staff" hint="Applies to everyone selected below. Overrides the video's default deadline.">
            <input type="date" style={inputStyle(C)} value={deadline || ''} onChange={(e) => setDeadline(e.target.value)} />
          </Field>

          <div style={{ fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: 8 }}>
            {picked.size} {picked.size === 1 ? 'staff' : 'staff'} selected
          </div>

          {staff.length === 0 ? (
            <div style={{ fontSize: 13, color: C.tl, padding: 12 }}>No staff in your scope.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {staff.map((s) => {
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
                    <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: on ? C.maroon : C.card, border: `1px solid ${on ? C.maroon : C.borderStrong}` }}>
                      {on && <Icon name="check" size={14} color="#fff" />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.name}</div>
                      {dept && <div style={{ fontSize: 12, color: dept.color, fontWeight: 600 }}>{dept.name}</div>}
                    </div>
                    {assigned[s.id] !== undefined && (
                      <span style={{ fontSize: 11, color: C.tl }}>{assigned[s.id] ? fmtDate(assigned[s.id]) : 'assigned'}</span>
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
