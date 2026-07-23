import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { todayISO, fmtDate } from '../../../lib/time'
import { ytThumb } from '../../../lib/youtube'
import { useColors } from '../../../context/ThemeContext'
import { useT, useLang } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { isAdminRole, DEPARTMENTS, DEPARTMENT_MAP, scopedDepartment } from '../../../constants/org'
import { Card, Loader, EmptyState, ProgressBar, Button } from '../../../components/common/UI'
import Icon from '../../../components/common/Icon'
import PlayerModal from './videos/PlayerModal'
import VideoForm from './videos/VideoForm'
import QuizManager from './videos/QuizManager'
import AssignModal from './videos/AssignModal'

// status tones: completed = green, pending = yellow, overdue = orange
const TR_GREEN = '#15803D'
const TR_YELLOW = '#CA8A04'
const TR_ORANGE = '#EA580C'

// whole days from today to the deadline (negative = overdue)
function daysLeft(deadline) {
  return Math.ceil((new Date(deadline) - new Date(todayISO())) / 86400000)
}

// Returns the deadline chip {text,color,bg} for a video, or null.
function deadlineChip(deadline, done, C, lang) {
  if (done) return { text: lang === 'hi' ? 'पूरा' : 'Completed', color: C.green, bg: C.gBg }
  if (!deadline) return null
  const d = daysLeft(deadline)
  if (d < 0) return { text: lang === 'hi' ? `${-d} दिन देर` : `Overdue ${-d}d`, color: C.red, bg: C.rBg }
  if (d === 0) return { text: lang === 'hi' ? 'आज तक' : 'Due today', color: C.red, bg: C.rBg }
  if (d <= 7) return { text: lang === 'hi' ? `${d} दिन बाकी` : `${d}d left`, color: C.yellow, bg: C.yBg }
  return { text: `${lang === 'hi' ? 'नियत' : 'Due'} ${fmtDate(deadline)}`, color: C.tl, bg: C.cardAlt }
}

export default function Videos() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const admin = isAdminRole(user?.role)
  const deptScope = scopedDepartment(user) // Sandeep → security only

  const [videos, setVideos] = useState([])
  const [progress, setProgress] = useState({}) // video_key -> completed
  const [deadlines, setDeadlines] = useState({}) // video_id -> effective deadline (employee)
  const [quizCounts, setQuizCounts] = useState({}) // video_id -> question count
  const [results, setResults] = useState({}) // video_id -> {score,total,passed}
  const [loading, setLoading] = useState(true)

  const [deptFilter, setDeptFilter] = useState('all')   // admin dept chips
  // staff: all | completed | pending | overdue — may be preset from the dashboard
  const location = useLocation()
  const [statusFilter, setStatusFilter] = useState(location.state?.status || 'all')
  const [playing, setPlaying] = useState(null)
  const [editing, setEditing] = useState(null) // video | 'new'
  const [quizFor, setQuizFor] = useState(null)
  const [assignFor, setAssignFor] = useState(null)

  // silent=true refreshes data in the background without flashing the loader
  const load = useCallback(async (silent = false) => {
    if (!user) return
    if (!silent) setLoading(true)
    try {
      // 1. videos in scope
      let vq = supabase.from('training_videos').select('*').eq('is_active', true).order('department').order('sort_order')
      if (admin) { if (deptScope) vq = vq.eq('department', deptScope) }
      else vq = vq.eq('department', user.department)
      const { data: deptVids } = await vq
      let vids = deptVids || []

      // 2. employee: also pull videos assigned specifically to them (may be other depts)
      const dmap = {}
      if (!admin) {
        const { data: asg } = await supabase.from('training_assignments').select('video_id, deadline').eq('user_id', user.id)
        ;(asg || []).forEach((a) => { dmap[a.video_id] = a.deadline })
        const missing = Object.keys(dmap).map(Number).filter((id) => !vids.some((v) => v.id === id))
        if (missing.length) {
          const { data: extra } = await supabase.from('training_videos').select('*').eq('is_active', true).in('id', missing)
          vids = [...vids, ...(extra || [])]
        }
        // effective deadline = assignment override ?? video default
        vids.forEach((v) => { dmap[v.id] = dmap[v.id] ?? v.deadline })
      }

      const ids = vids.map((v) => v.id)

      // 3. progress + quiz question counts + this user's results
      const [progR, quizR, resR] = await Promise.all([
        supabase.from('training_progress').select('video_key, completed').eq('user_id', user.id),
        ids.length ? supabase.from('training_quizzes').select('video_id').in('video_id', ids) : Promise.resolve({ data: [] }),
        !admin && ids.length ? supabase.from('quiz_results').select('video_id, score, total, passed').eq('user_id', user.id).in('video_id', ids) : Promise.resolve({ data: [] }),
      ])

      const pmap = {}
      ;(progR.data || []).forEach((p) => { pmap[p.video_key] = p.completed })
      const qmap = {}
      ;(quizR.data || []).forEach((q) => { qmap[q.video_id] = (qmap[q.video_id] || 0) + 1 })
      const rmap = {}
      ;(resR.data || []).forEach((r) => {
        const cur = rmap[r.video_id]
        if (!cur || r.passed || r.score > cur.score) rmap[r.video_id] = r
      })

      setVideos(vids)
      setProgress(pmap)
      setDeadlines(dmap)
      setQuizCounts(qmap)
      setResults(rmap)
    } catch {
      // ignore — keep whatever we had rather than hanging the loader
    } finally {
      setLoading(false)
    }
  }, [user, admin, deptScope])

  useEffect(() => { load() }, [load])

  // apply a status preset passed from the dashboard tiles
  useEffect(() => { if (location.state?.status) setStatusFilter(location.state.status) }, [location.state])

  // keep in sync with admin changes made elsewhere — but SILENTLY (no loader
  // flash) and infrequently, so it never disrupts what the user is doing.
  // Primary trigger is returning to the tab; the interval is just a slow backstop.
  useEffect(() => {
    const id = setInterval(() => { load(true) }, 5 * 60 * 1000) // 5 min
    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // admin department chips (respect Sandeep's security-only scope)
  const deptChips = useMemo(() => (deptScope ? [] : DEPARTMENTS.filter((d) => videos.some((v) => v.department === d.code))), [videos, deptScope])
  const shown = useMemo(() => {
    let list = videos
    if (admin && deptFilter !== 'all') list = list.filter((v) => v.department === deptFilter)
    if (!admin && statusFilter !== 'all') {
      const today = todayISO()
      list = list.filter((v) => {
        const done = !!progress[String(v.id)]
        if (statusFilter === 'completed') return done
        if (statusFilter === 'pending') return !done
        if (statusFilter === 'overdue') return !done && deadlines[v.id] && deadlines[v.id] < today
        return true
      })
    }
    return list
  }, [videos, admin, deptFilter, statusFilter, progress, deadlines])

  const completedCount = useMemo(() => videos.filter((v) => progress[String(v.id)]).length, [videos, progress])
  const pct = videos.length ? (completedCount / videos.length) * 100 : 0
  // pending = not completed; overdue = pending with a deadline already passed
  const pendingCount = videos.length - completedCount
  const overdueCount = useMemo(
    () => videos.filter((v) => !progress[String(v.id)] && deadlines[v.id] && deadlines[v.id] < todayISO()).length,
    [videos, progress, deadlines]
  )

  async function deleteVideo(v) {
    if (!window.confirm(`Remove "${v.topic}" from training? Staff will no longer see it.`)) return
    await supabase.from('training_videos').update({ is_active: false }).eq('id', v.id)
    load()
  }

  if (loading) return <Loader label={t.loading} />

  const empDept = DEPARTMENT_MAP[user?.department]

  return (
    <div>
      {/* Employee: progress + department banner */}
      {!admin && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{t.yourProgress}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.maroon, fontVariantNumeric: 'tabular-nums' }}>{completedCount}/{videos.length}</span>
            </div>
            <ProgressBar value={pct} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Stat C={C} tone={TR_GREEN} label={lang === 'hi' ? 'पूरे' : 'Completed'} value={completedCount}
                active={statusFilter === 'completed'} onClick={() => setStatusFilter((f) => (f === 'completed' ? 'all' : 'completed'))} />
              <Stat C={C} tone={TR_YELLOW} label={lang === 'hi' ? 'बाकी' : 'Pending'} value={pendingCount}
                active={statusFilter === 'pending'} onClick={() => setStatusFilter((f) => (f === 'pending' ? 'all' : 'pending'))} />
              <Stat C={C} tone={TR_ORANGE} label={lang === 'hi' ? 'समय पार' : 'Overdue'} value={overdueCount}
                active={statusFilter === 'overdue'} onClick={() => setStatusFilter((f) => (f === 'overdue' ? 'all' : 'overdue'))} />
            </div>
            {statusFilter !== 'all' && (
              <button onClick={() => setStatusFilter('all')} style={{ marginTop: 10, background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 700 }}>
                {lang === 'hi' ? 'सभी दिखाएँ' : 'Show all'}
              </button>
            )}
          </Card>
          {empDept && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: C.gBg, borderRadius: 12, border: `1px solid ${empDept.color}28` }}>
              <Icon name="training" size={18} color={empDept.color} />
              <span style={{ fontSize: 14, fontWeight: 700, color: empDept.color }}>{empDept.name}</span>
              <span style={{ fontSize: 12.5, color: empDept.color, opacity: 0.75 }}>— {lang === 'hi' ? 'आपके विभाग की ट्रेनिंग' : 'Your department training'}</span>
            </div>
          )}
        </>
      )}

      {/* Admin: add button + department filter chips */}
      {admin && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} color="#fff" style={{ marginRight: 4 }} />{lang === 'hi' ? 'वीडियो जोड़ें' : 'Add Video'}
            </Button>
          </div>
          {deptChips.length > 0 && (
            <div className="no-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
              <Chip C={C} active={deptFilter === 'all'} onClick={() => setDeptFilter('all')}>{t.all}</Chip>
              {deptChips.map((d) => (
                <Chip key={d.code} C={C} active={deptFilter === d.code} onClick={() => setDeptFilter(d.code)}>{d.name}</Chip>
              ))}
            </div>
          )}
        </>
      )}

      {shown.length === 0 ? (
        <EmptyState icon="training" title={t.noData} hint={admin ? (lang === 'hi' ? 'पहला वीडियो जोड़ें' : 'Add the first video') : undefined} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {shown.map((v) => {
            const done = !!progress[String(v.id)]
            const dept = DEPARTMENT_MAP[v.department] || {}
            const thumb = ytThumb(v.youtube_id)
            const hasVideo = !!v.youtube_id || !!(v.youtube_url && v.youtube_url.trim()) // youtube or embed url
            const chip = deadlineChip(admin ? v.deadline : deadlines[v.id], done, C, lang)
            const qCount = quizCounts[v.id] || 0
            const res = results[v.id]
            return (
              <Card key={v.id} style={{ padding: 0, overflow: 'hidden', border: `1px solid ${done ? C.green : C.border}` }}>
                {/* thumbnail / placeholder */}
                <button
                  onClick={() => (admin ? setEditing(v) : setPlaying(v))}
                  style={{ display: 'block', width: '100%', position: 'relative', paddingTop: '56.25%', background: thumb ? '#111' : `linear-gradient(135deg, ${dept.color || C.maroon}22, ${dept.color || C.maroon}08)` }}
                >
                  {thumb ? (
                    <img src={thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Icon name={hasVideo ? 'play' : 'training'} size={30} color={dept.color || C.maroon} fill={hasVideo ? (dept.color || C.maroon) : 'none'} />
                      <span style={{ fontSize: 11, color: C.tl }}>{hasVideo ? (lang === 'hi' ? 'वीडियो' : 'Video') : (lang === 'hi' ? 'वीडियो नहीं जोड़ा' : 'No video linked')}</span>
                    </div>
                  )}
                  {/* play overlay when a youtube thumbnail is shown */}
                  {thumb && !done && (
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.15)' }}>
                      <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'grid', placeItems: 'center' }}>
                        <Icon name="play" size={16} color={C.maroon} fill={C.maroon} />
                      </span>
                    </span>
                  )}
                  {/* status tick (staff): completed=green, overdue=orange, pending=yellow */}
                  {(() => {
                    if (admin && !done) return null // admins have no personal completion status
                    const dl = admin ? v.deadline : deadlines[v.id]
                    const overdue = !done && dl && dl < todayISO()
                    const tone = done ? TR_GREEN : overdue ? TR_ORANGE : TR_YELLOW
                    return (
                      <span style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: '50%', background: tone, display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
                        <Icon name="check" size={15} color="#fff" />
                      </span>
                    )
                  })()}
                </button>

                {/* title + meta */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: done ? C.green : C.text, lineHeight: 1.35 }}>
                    {lang === 'hi' && v.topic_hi ? v.topic_hi : v.topic}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                    {chip && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: chip.color, background: chip.bg, padding: '3px 8px', borderRadius: 999 }}>
                        <Icon name="calendar" size={11} color={chip.color} /> {chip.text}
                      </span>
                    )}
                    {qCount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: C.bBg, padding: '3px 8px', borderRadius: 999 }}>
                        {res?.passed ? `${lang === 'hi' ? 'पास' : 'Passed'} ${res.score}/${res.total}` : `${qCount} Q ${lang === 'hi' ? 'असेसमेंट' : 'assessment'}`}
                      </span>
                    )}
                  </div>

                  {/* admin controls — 2×2 grid so labels never overflow */}
                  {admin && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                      <AdminBtn C={C} icon="edit" label={lang === 'hi' ? 'एडिट' : 'Edit'} onClick={() => setEditing(v)} />
                      <AdminBtn C={C} icon="tasks" label={`Quiz${qCount ? ` ${qCount}` : ''}`} tone={C.blue} onClick={() => setQuizFor(v)} />
                      <AdminBtn C={C} icon="team" label={lang === 'hi' ? 'सौंपें' : 'Assign'} tone={C.maroon} onClick={() => setAssignFor(v)} />
                      <AdminBtn C={C} icon="trash" label={lang === 'hi' ? 'हटाएँ' : 'Delete'} tone={C.red} onClick={() => deleteVideo(v)} />
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {playing && (
        <PlayerModal
          video={playing}
          user={user}
          completed={!!progress[String(playing.id)]}
          onClose={() => setPlaying(null)}
          onCompleted={(opt) => { if (!opt?.silent) setPlaying(null); load() }}
        />
      )}
      {editing && (
        <VideoForm
          video={editing === 'new' ? null : editing}
          user={user}
          defaultDepartment={deptScope || (admin && deptFilter !== 'all' ? deptFilter : undefined)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {quizFor && <QuizManager video={quizFor} onClose={() => { setQuizFor(null); load() }} />}
      {assignFor && <AssignModal video={assignFor} user={user} onClose={() => setAssignFor(null)} onSaved={() => { setAssignFor(null); load() }} />}
    </div>
  )
}

function Stat({ C, tone, label, value, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minWidth: 84, textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
        background: active ? tone + '14' : C.bg, borderRadius: 10, padding: '8px 10px',
        border: `1.5px solid ${active ? tone : 'transparent'}`,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: tone, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>{label}</div>
    </button>
  )
}

function Chip({ children, active, onClick, C }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
        background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl,
        border: `1px solid ${active ? C.maroon : C.border}`,
      }}
    >
      {children}
    </button>
  )
}

function AdminBtn({ C, icon, label, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '7px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
        fontSize: 12, fontWeight: 700, color: tone || C.tl, whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={14} color={tone || C.tl} />{label}
    </button>
  )
}
