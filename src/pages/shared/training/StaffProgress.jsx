import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { nowISO } from '../../../lib/time'
import { useColors } from '../../../context/ThemeContext'
import { useT, useLang } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { PROPERTY_MAP, DEPARTMENT_MAP, scopedProperty, scopedDepartment } from '../../../constants/org'
import { Card, Loader, EmptyState, ProgressBar, Button } from '../../../components/common/UI'
import Icon from '../../../components/common/Icon'

// Admin report: training completion per staff, grouped and collapsible by property.
// Expand a staff member to see each video and reset a completed one back to incomplete.
export default function StaffProgress() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()

  const [videos, setVideos] = useState(null) // [{id, topic, topic_hi, department}]
  const [staff, setStaff] = useState([])
  const [byUser, setByUser] = useState({}) // user_id -> Set(video_key)
  const [openProp, setOpenProp] = useState({})
  const [openStaff, setOpenStaff] = useState({})
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    const { data: vids } = await supabase.from('training_videos').select('id, topic, topic_hi, department').eq('is_active', true).order('sort_order')

    const propScope = scopedProperty(user)
    const deptScope = scopedDepartment(user)
    let sq = supabase.from('users').select('id, name, department, property').eq('is_active', true).eq('role', 'e').order('name')
    if (propScope) sq = sq.eq('property', propScope)
    if (deptScope) sq = sq.eq('department', deptScope)
    const { data: st } = await sq
    const ids = (st || []).map((s) => s.id)

    const map = {}
    if (ids.length) {
      const { data: prog } = await supabase.from('training_progress').select('user_id, video_key, completed').in('user_id', ids)
      ;(prog || []).forEach((p) => {
        if (!p.completed) return
        ;(map[p.user_id] = map[p.user_id] || new Set()).add(String(p.video_key))
      })
    }
    setVideos(vids || [])
    setStaff(st || [])
    setByUser(map)
  }, [user])

  useEffect(() => { load() }, [load])

  // refresh when staff complete videos elsewhere — slow backstop + on tab focus
  useEffect(() => {
    const id = setInterval(() => { load() }, 5 * 60 * 1000) // 5 min
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // videos grouped by department
  const deptVideos = useMemo(() => {
    const m = {}
    ;(videos || []).forEach((v) => { (m[v.department] = m[v.department] || []).push(v) })
    return m
  }, [videos])

  // staff grouped by property, each with done/total
  const groups = useMemo(() => {
    const byProp = {}
    staff.forEach((s) => {
      const total = (deptVideos[s.department] || []).length
      const doneSet = byUser[s.id] || new Set()
      const done = (deptVideos[s.department] || []).filter((v) => doneSet.has(String(v.id))).length
      const row = { ...s, total, done }
      ;(byProp[s.property || 'pp'] = byProp[s.property || 'pp'] || []).push(row)
    })
    return Object.entries(byProp).map(([prop, list]) => ({
      prop,
      list: list.sort((a, b) => (a.department || '').localeCompare(b.department) || a.name.localeCompare(b.name)),
      done: list.reduce((s, r) => s + r.done, 0),
      total: list.reduce((s, r) => s + r.total, 0),
    }))
  }, [staff, deptVideos, byUser])

  async function toggleComplete(s, video, currentlyDone) {
    const key = `${s.id}:${video.id}`
    setBusyKey(key)
    if (currentlyDone) {
      await supabase.from('training_progress').delete().eq('user_id', s.id).eq('video_key', String(video.id))
    } else {
      await supabase.from('training_progress').upsert(
        { user_id: s.id, video_key: String(video.id), department: video.department, completed: true, completed_at: nowISO() },
        { onConflict: 'user_id,video_key' }
      )
    }
    await load()
    setBusyKey(null)
  }

  if (videos === null) return <Loader label={t.loading} />
  if (staff.length === 0) return <EmptyState icon="team" title={t.noData} />

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {groups.map((g) => {
        const pOpen = !!openProp[g.prop]
        const pct = g.total ? Math.round((g.done / g.total) * 100) : 0
        return (
          <Card key={g.prop} style={{ padding: 0, overflow: 'hidden' }}>
            {/* property header (collapsible) */}
            <button
              onClick={() => setOpenProp((o) => ({ ...o, [g.prop]: !pOpen }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 14px', background: 'transparent' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="pin" size={16} color={C.maroon} />
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{PROPERTY_MAP[g.prop]?.name || g.prop}</span>
                <span style={{ fontSize: 12.5, color: C.tl }}>· {g.list.length} staff · {pct}%</span>
              </span>
              <Icon name="chevronRight" size={16} color={C.tl} style={{ transform: pOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </button>

            {pOpen && (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {g.list.map((s) => {
                  const sOpen = !!openStaff[s.id]
                  const dept = DEPARTMENT_MAP[s.department] || { name: s.department, color: C.tl }
                  const spct = s.total ? Math.round((s.done / s.total) * 100) : 0
                  const all = s.total > 0 && s.done >= s.total
                  const list = deptVideos[s.department] || []
                  const doneSet = byUser[s.id] || new Set()
                  return (
                    <div key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      {/* staff row (collapsible) */}
                      <button
                        onClick={() => setOpenStaff((o) => ({ ...o, [s.id]: !sOpen }))}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'transparent', textAlign: 'left' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: dept.color }}>{dept.name}</span>
                          </div>
                          <div style={{ marginTop: 6 }}><ProgressBar value={spct} tone={all ? C.green : C.maroon} height={6} /></div>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: all ? C.green : C.tl, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.done}/{s.total}</span>
                        <Icon name="chevronRight" size={15} color={C.tl} style={{ transform: sOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      </button>

                      {/* per-video detail with reset */}
                      {sOpen && (
                        <div style={{ padding: '4px 14px 12px', display: 'grid', gap: 6 }}>
                          {list.length === 0 ? (
                            <div style={{ fontSize: 13, color: C.tl }}>{lang === 'hi' ? 'इस विभाग में कोई वीडियो नहीं' : 'No videos in this department'}</div>
                          ) : list.map((v) => {
                            const done = doneSet.has(String(v.id))
                            const rowBusy = busyKey === `${s.id}:${v.id}`
                            return (
                              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: C.bg }}>
                                <Icon name={done ? 'check' : 'clock'} size={15} color={done ? C.green : C.faint} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text }}>{lang === 'hi' && v.topic_hi ? v.topic_hi : v.topic}</span>
                                {done ? (
                                  <Button variant="ghost" onClick={() => toggleComplete(s, v, true)} disabled={rowBusy} style={{ padding: '5px 10px', fontSize: 12 }}>
                                    {lang === 'hi' ? 'अधूरा करें' : 'Mark incomplete'}
                                  </Button>
                                ) : (
                                  <Button variant="ghost" onClick={() => toggleComplete(s, v, false)} disabled={rowBusy} style={{ padding: '5px 10px', fontSize: 12, color: C.green }}>
                                    {lang === 'hi' ? 'पूरा करें' : 'Mark done'}
                                  </Button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
