
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { nowISO } from '../../../../lib/time'
import { useColors } from '../../../../context/ThemeContext'
import { useT, useLang } from '../../../../context/LangContext'
import { Button, Loader } from '../../../../components/common/UI'
import Modal from '../../../../components/common/Modal'
import Icon from '../../../../components/common/Icon'
import YTPlayer from './YTPlayer'
import { notifyAdmins } from '../../../../lib/notify'

const PASS_PCT = 0.6
const WATCH_PCT = 0.9 // must watch at least this much of the video to unlock the assessment
const OPTS = ['a', 'b', 'c', 'd']

// Staff flow: watch the video -> take the assessment -> must score >= 60% to
// complete. Below 60% they are sent back to rewatch before trying again.
export default function PlayerModal({ video, user, completed, onClose, onCompleted }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const hi = lang === 'hi'

  const [phase, setPhase] = useState('watch') // watch | quiz | result
  const [watched, setWatched] = useState(0)    // furthest-watched fraction (from YTPlayer)
  const [questions, setQuestions] = useState(null) // null = not loaded yet
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { score, total, passed }
  const [err, setErr] = useState('')

  // youtube videos use the custom YTPlayer; a raw embed URL uses a plain iframe
  const embed = video.youtube_url || ''
  const title = hi && video.topic_hi ? video.topic_hi : video.topic
  const resumeKey = `ambria_resume_${user.id}_${video.id}`

  // preload the questions so we can show the right button labels / counts
  const loadQuestions = useCallback(async () => {
    const { data } = await supabase.from('training_quizzes').select('*').eq('video_id', video.id).order('id')
    setQuestions(data || [])
    return data || []
  }, [video.id])

  useEffect(() => { loadQuestions() }, [loadQuestions])

  const qCount = questions?.length ?? null
  const needed = qCount ? Math.ceil(qCount * PASS_PCT) : 0
  // enforce watching only on the tracked YouTube player; plain embeds can't be measured
  const isYouTube = !!video.youtube_id
  const videoDone = completed || !isYouTube || watched >= WATCH_PCT

  async function markWatched() {
    setBusy(true)
    await supabase.from('training_progress').upsert(
      { user_id: user.id, video_key: String(video.id), department: video.department, completed: true, completed_at: nowISO() },
      { onConflict: 'user_id,video_key' }
    )
    setBusy(false)
    onCompleted()
  }

  async function submitQuiz() {
    if (Object.keys(answers).length < questions.length) {
      setErr(hi ? 'सभी प्रश्नों के उत्तर दें' : 'Please answer every question')
      return
    }
    setBusy(true); setErr('')
    let score = 0
    questions.forEach((q) => { if (answers[q.id] === q.correct_option) score += 1 })
    const total = questions.length
    const passed = score / total >= PASS_PCT
    await supabase.from('quiz_results').insert({
      user_id: user.id, video_id: video.id, score, total, passed, answers, completed_at: nowISO(),
    })
    if (passed) {
      await supabase.from('training_progress').upsert(
        { user_id: user.id, video_key: String(video.id), department: video.department, completed: true, completed_at: nowISO() },
        { onConflict: 'user_id,video_key' }
      )
      // let the relevant admins know this staff member cleared the assessment
      await notifyAdmins('quiz_completed', { taskText: video.topic, property: user?.property, department: video.department, entityId: video.id, byName: user?.name, byUser: user.id })
    }
    setBusy(false)
    setResult({ score, total, passed })
    setPhase('result')
    if (passed) onCompleted({ silent: true }) // refresh grid, keep modal on the result screen
  }

  function rewatch() {
    setAnswers({})
    setResult(null)
    setErr('')
    setPhase('watch')
  }

  // ---- footer per phase ----
  let footer
  if (phase === 'watch') {
    footer = completed ? (
      <Button variant="ghost" onClick={onClose} full>{t.close}</Button>
    ) : qCount === null ? (
      <Button variant="ghost" disabled full>…</Button>
    ) : qCount === 0 ? (
      <Button variant="success" onClick={markWatched} disabled={busy || !videoDone} full>
        <Icon name="check" size={18} color="#fff" style={{ marginRight: 6 }} />{hi ? 'देखा — पूरा करें' : 'Mark as Watched'}
      </Button>
    ) : (
      <Button variant="primary" onClick={() => setPhase('quiz')} disabled={!videoDone} full>
        {videoDone
          ? <>{hi ? 'असेसमेंट लें' : 'Take Assessment'} <Icon name="chevronRight" size={18} color="#fff" style={{ marginLeft: 4 }} /></>
          : <><Icon name="lock" size={16} color="#fff" style={{ marginRight: 6 }} />{hi ? 'पहले वीडियो पूरा देखें' : 'Finish the video first'}</>}
      </Button>
    )
  } else if (phase === 'quiz') {
    footer = (
      <>
        <Button variant="ghost" onClick={() => setPhase('watch')} style={{ flex: 1 }}>{hi ? 'वापस' : 'Back'}</Button>
        <Button variant="primary" onClick={submitQuiz} disabled={busy} style={{ flex: 2 }}>{hi ? 'जमा करें' : 'Submit Test'}</Button>
      </>
    )
  } else {
    footer = result?.passed
      ? <Button variant="success" onClick={onClose} full><Icon name="check" size={18} color="#fff" style={{ marginRight: 6 }} />{t.close}</Button>
      : <Button variant="primary" onClick={rewatch} full><Icon name="play" size={16} color="#fff" fill="#fff" style={{ marginRight: 6 }} />{hi ? 'वीडियो दोबारा देखें' : 'Rewatch Video'}</Button>
  }

  return (
    <Modal open onClose={onClose} title={title} footer={footer}>
      {/* ---------- WATCH ---------- */}
      {phase === 'watch' && (
        <>
          {video.youtube_id ? (
            <YTPlayer videoId={video.youtube_id} resumeKey={resumeKey} onProgress={(f) => setWatched((w) => Math.max(w, f))} />
          ) : (
            <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
              {embed ? (
                <iframe
                  title={title}
                  src={embed}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13 }}>
                  {hi ? 'वीडियो अभी नहीं जोड़ा गया' : 'No video linked yet'}
                </div>
              )}
            </div>
          )}
          {video.youtube_id && (
            <div style={{ fontSize: 12, color: C.tl, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" size={13} color={C.tl} />
              {hi ? 'अधिकतम गति 1.5x · केवल देखे हुए भाग तक आगे-पीछे' : 'Max 1.5× · rewind within the watched part, no skipping ahead'}
            </div>
          )}

          {completed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 700, marginTop: 14 }}>
              <Icon name="check" size={18} /> {hi ? 'यह वीडियो पूरा हो चुका है' : 'This video is complete'}
            </div>
          ) : qCount > 0 ? (
            <div style={{ marginTop: 14, padding: '10px 12px', background: C.bBg, borderRadius: 10, fontSize: 13, color: C.blue, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="warning" size={16} color={C.blue} />
              <span>{hi
                ? `पूरा वीडियो देखें, फिर ${qCount} सवालों का टेस्ट दें। पास होने के लिए ${needed}/${qCount} सही चाहिए (60%)। पास न होने पर वीडियो दोबारा देखना होगा।`
                : `Watch the full video, then take the ${qCount}-question test. You need ${needed}/${qCount} correct (60%) to pass — otherwise you'll rewatch and retry.`}</span>
            </div>
          ) : (
            <div style={{ marginTop: 14, fontSize: 13, color: C.tl }}>
              {hi ? 'इस वीडियो के लिए अभी टेस्ट नहीं जोड़ा गया है।' : 'No assessment has been added for this video yet.'}
            </div>
          )}

          {/* watch progress — the assessment stays locked until the video is finished */}
          {!completed && isYouTube && !videoDone && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.tl }}>
              <Icon name="lock" size={14} color={C.tl} />
              {hi ? `असेसमेंट अनलॉक करने के लिए वीडियो पूरा देखें — ${Math.round(watched * 100)}% देखा` : `Watch the full video to unlock the assessment — ${Math.round(watched * 100)}% watched`}
            </div>
          )}
        </>
      )}

      {/* ---------- QUIZ ---------- */}
      {phase === 'quiz' && (
        questions === null ? <Loader /> : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ fontSize: 13, color: C.tl }}>
              {hi ? `पास होने के लिए ${needed}/${qCount} सही चाहिए` : `Score ${needed}/${qCount} to pass`}
            </div>
            {questions.map((q, qi) => (
              <div key={q.id}>
                <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 8 }}>
                  {qi + 1}. {hi && q.question_hi ? q.question_hi : q.question}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {OPTS.map((o) => {
                    const label = (hi && q[`option_${o}_hi`]) ? q[`option_${o}_hi`] : q[`option_${o}`]
                    const active = answers[q.id] === o
                    return (
                      <button
                        key={o}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                        style={{
                          textAlign: 'left', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                          border: `1.5px solid ${active ? C.maroon : C.border}`,
                          background: active ? C.maroonSoft : C.card,
                          color: active ? C.maroon : C.text, fontWeight: active ? 700 : 500,
                        }}
                      >
                        <b style={{ textTransform: 'uppercase', marginRight: 8 }}>{o}</b>{label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
          </div>
        )
      )}

      {/* ---------- RESULT ---------- */}
      {phase === 'result' && result && (
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div style={{ width: 72, height: 72, margin: '0 auto 14px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: result.passed ? C.gBg : C.rBg }}>
            <Icon name={result.passed ? 'check' : 'close'} size={34} color={result.passed ? C.green : C.red} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: result.passed ? C.green : C.red, fontVariantNumeric: 'tabular-nums' }}>
            {result.score}/{result.total}
          </div>
          <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>
            {Math.round((result.score / result.total) * 100)}%
          </div>
          <div style={{ fontSize: 14, color: C.text, marginTop: 12, fontWeight: 600 }}>
            {result.passed
              ? (hi ? 'बधाई! यह वीडियो अब पूरा है।' : 'Passed! This video is now complete.')
              : (hi ? `पास होने के लिए 60% चाहिए। वीडियो दोबारा देखें और फिर टेस्ट दें।` : 'You need 60% to pass. Please rewatch the video, then take the test again.')}
          </div>
        </div>
      )}
    </Modal>
  )
}
