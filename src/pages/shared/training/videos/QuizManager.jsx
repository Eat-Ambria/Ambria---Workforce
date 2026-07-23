import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { transliterateToHindi, translateToHindi } from '../../../../lib/translate'
import { useColors } from '../../../../context/ThemeContext'
import { useT } from '../../../../context/LangContext'
import { Button, Field, inputStyle, Loader, Spinner } from '../../../../components/common/UI'
import Modal from '../../../../components/common/Modal'
import Icon from '../../../../components/common/Icon'

const OPTS = ['a', 'b', 'c', 'd']
const BLANK = {
  question: '', question_hi: '',
  option_a: '', option_a_hi: '', option_b: '', option_b_hi: '',
  option_c: '', option_c_hi: '', option_d: '', option_d_hi: '',
  correct_option: 'a',
}

// Admin: manage the assessment questions for one video.
// English text is auto-translated to Hindi (editable); existing questions stay listed above.
export default function QuizManager({ video, onClose }) {
  const C = useColors()
  const t = useT()
  const [questions, setQuestions] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [autoHi, setAutoHi] = useState(true)     // auto-fill Hindi from the typed text
  const [mode, setMode] = useState('translit')   // 'translit' = Hinglish→Hindi (sound), 'translate' = English→Hindi (meaning)
  const [translating, setTranslating] = useState(false)
  const [tErr, setTErr] = useState(false)

  const setEn = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setHi = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setAutoHi(false) }

  const load = useCallback(async () => {
    const { data } = await supabase.from('training_quizzes').select('*').eq('video_id', video.id).order('id')
    setQuestions(data || [])
  }, [video.id])
  useEffect(() => { load() }, [load])

  // debounced English -> Hindi for question + all four options
  useEffect(() => {
    if (!autoHi) return
    const src = { question: form.question, option_a: form.option_a, option_b: form.option_b, option_c: form.option_c, option_d: form.option_d }
    if (!Object.values(src).some((v) => v.trim())) return
    const ctrl = new AbortController()
    setTranslating(true); setTErr(false)
    const convert = mode === 'translate' ? translateToHindi : transliterateToHindi
    const id = setTimeout(async () => {
      try {
        const keys = Object.keys(src)
        const out = await Promise.all(keys.map((k) => (src[k].trim() ? convert(src[k], ctrl.signal) : Promise.resolve(''))))
        setForm((f) => {
          const next = { ...f }
          keys.forEach((k, i) => { next[`${k}_hi`] = out[i] })
          return next
        })
      } catch (e) {
        if (e.name !== 'AbortError') setTErr(true)
      } finally {
        setTranslating(false)
      }
    }, 600)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [form.question, form.option_a, form.option_b, form.option_c, form.option_d, autoHi, mode])

  async function addQuestion() {
    if (!form.question.trim() || OPTS.some((o) => !form[`option_${o}`].trim())) { setErr(t.required); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('training_quizzes').insert({
      video_id: video.id,
      question: form.question.trim(),
      question_hi: form.question_hi.trim() || null,
      option_a: form.option_a.trim(), option_a_hi: form.option_a_hi.trim() || null,
      option_b: form.option_b.trim(), option_b_hi: form.option_b_hi.trim() || null,
      option_c: form.option_c.trim(), option_c_hi: form.option_c_hi.trim() || null,
      option_d: form.option_d.trim(), option_d_hi: form.option_d_hi.trim() || null,
      correct_option: form.correct_option,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setForm(BLANK); setAutoHi(true); setTErr(false)
    load()
  }

  async function remove(id) {
    await supabase.from('training_quizzes').delete().eq('id', id)
    load()
  }

  return (
    <Modal open onClose={onClose} title={`Assessment — ${video.topic}`} footer={<Button variant="ghost" onClick={onClose} full>{t.close}</Button>}>
      {questions === null ? <Loader /> : (
        <>
          {/* previous questions */}
          {questions.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tl }}>{questions.length} question{questions.length > 1 ? 's' : ''} so far</div>
              {questions.map((q, i) => (
                <div key={q.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{i + 1}. {q.question}</div>
                    <button onClick={() => remove(q.id)} style={{ background: 'transparent', color: C.red }} aria-label="Delete">
                      <Icon name="trash" size={16} color={C.red} />
                    </button>
                  </div>
                  {q.question_hi && <div style={{ fontSize: 12.5, color: C.tl, marginTop: 2 }}>{q.question_hi}</div>}
                  <div style={{ fontSize: 12.5, color: C.tl, marginTop: 6, display: 'grid', gap: 2 }}>
                    {OPTS.map((o) => (
                      <span key={o} style={{ color: q.correct_option === o ? C.green : C.tl, fontWeight: q.correct_option === o ? 700 : 500 }}>
                        {o.toUpperCase()}: {q[`option_${o}`]}{q[`option_${o}_hi`] ? `  ·  ${q[`option_${o}_hi`]}` : ''}
                        {q.correct_option === o ? '  ✓' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.tl, marginBottom: 16 }}>No questions yet. Add the first one below.</div>
          )}

          {/* add a new question */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Add Question</div>
              <div style={{ fontSize: 12, color: tErr ? C.red : C.tl, display: 'flex', alignItems: 'center', gap: 6 }}>
                {translating ? <><Spinner size={13} /> Converting…</>
                  : tErr ? "Auto-convert failed — type Hindi manually"
                  : autoHi ? <><Icon name="check" size={13} color={C.green} /> Hindi auto-fills</>
                  : <button type="button" onClick={() => setAutoHi(true)} style={{ background: 'transparent', color: C.maroon, fontWeight: 700, padding: 0 }}>Re-enable auto-Hindi</button>}
              </div>
            </div>

            {/* conversion mode: sound (Hinglish) vs meaning (English) */}
            <div style={{ display: 'flex', gap: 3, marginBottom: 12, background: C.cardAlt, borderRadius: 10, padding: 3, width: 'fit-content' }}>
              {[
                { id: 'translit', label: 'Hinglish → हिंदी', hint: 'theek hai → ठीक है' },
                { id: 'translate', label: 'English → हिंदी', hint: 'Water → पानी' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMode(m.id); setAutoHi(true) }}
                  title={m.hint}
                  style={{
                    padding: '7px 12px', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 700,
                    background: mode === m.id ? C.maroon : 'transparent',
                    color: mode === m.id ? '#fff' : C.tl,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <Field label="Question" hint={mode === 'translate' ? "Type in English — meaning is translated to Hindi below." : "Type in English letters (e.g. 'theek hai') — Hindi appears below."}>
              <input style={inputStyle(C)} value={form.question} onChange={setEn('question')} placeholder="Type here…" />
            </Field>
            <Field label="Question (हिंदी)"><input style={inputStyle(C)} value={form.question_hi} onChange={setHi('question_hi')} placeholder="अपने आप बनेगा…" /></Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {OPTS.map((o) => (
                <div key={o}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.tl, marginBottom: 5 }}>
                    Option {o.toUpperCase()}{form.correct_option === o ? <span style={{ color: C.green }}> · correct</span> : ''}
                  </div>
                  <input style={inputStyle(C)} value={form[`option_${o}`]} onChange={setEn(`option_${o}`)} placeholder="Type here…" />
                  <input style={{ ...inputStyle(C), marginTop: 6, fontSize: 14 }} value={form[`option_${o}_hi`]} onChange={setHi(`option_${o}_hi`)} placeholder="हिंदी (अपने आप)" />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Correct answer">
                <select style={inputStyle(C)} value={form.correct_option} onChange={setEn('correct_option')}>
                  {OPTS.map((o) => <option key={o} value={o}>Option {o.toUpperCase()}</option>)}
                </select>
              </Field>
            </div>

            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
            <Button variant="primary" onClick={addQuestion} disabled={busy} full>
              <Icon name="plus" size={16} color="#fff" style={{ marginRight: 4 }} /> Add Question
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
