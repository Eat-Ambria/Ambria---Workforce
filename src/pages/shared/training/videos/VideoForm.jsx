import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { extractYTId, ytThumb } from '../../../../lib/youtube'
import { translateToHindi } from '../../../../lib/translate'
import { useColors } from '../../../../context/ThemeContext'
import { useT } from '../../../../context/LangContext'
import { DEPARTMENTS } from '../../../../constants/org'
import { Button, Field, inputStyle, Spinner } from '../../../../components/common/UI'
import Modal from '../../../../components/common/Modal'
import Icon from '../../../../components/common/Icon'

// Admin: add or edit a training video (YouTube link + default deadline).
export default function VideoForm({ video, user, defaultDepartment, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const editing = !!video
  const [form, setForm] = useState({
    topic: video?.topic || '',
    topic_hi: video?.topic_hi || '',
    department: video?.department || defaultDepartment || 'h',
    youtube_url: video?.youtube_url || '',
    deadline: video?.deadline || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Auto-fill Hindi from English. Active for new videos (or when Hindi is blank);
  // turns off the moment the admin edits the Hindi field by hand.
  const [autoHi, setAutoHi] = useState(!video?.topic_hi)
  const [translating, setTranslating] = useState(false)
  const [translateErr, setTranslateErr] = useState(false)

  useEffect(() => {
    if (!autoHi) return
    const topic = form.topic.trim()
    if (!topic) { setForm((f) => ({ ...f, topic_hi: '' })); setTranslating(false); setTranslateErr(false); return }
    const ctrl = new AbortController()
    setTranslating(true); setTranslateErr(false)
    const id = setTimeout(async () => {
      try {
        const hi = await translateToHindi(topic, ctrl.signal)
        setForm((f) => ({ ...f, topic_hi: hi }))
      } catch (e) {
        if (e.name !== 'AbortError') setTranslateErr(true)
      } finally {
        setTranslating(false)
      }
    }, 500)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [form.topic, autoHi])

  const ytId = extractYTId(form.youtube_url)

  async function save() {
    if (!form.topic.trim()) { setErr(t.required); return }
    setBusy(true); setErr('')
    const payload = {
      topic: form.topic.trim(),
      topic_hi: form.topic_hi.trim() || null,
      department: form.department,
      youtube_url: form.youtube_url.trim(),
      youtube_id: ytId,
      deadline: form.deadline || null,
    }
    const { error } = editing
      ? await supabase.from('training_videos').update(payload).eq('id', video.id)
      : await supabase.from('training_videos').insert({ ...payload, is_active: true, created_by: user.id, sort_order: 99 })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={editing ? (t.edit || 'Edit') + ' — ' + t.videos : t.videos}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label="Topic (English)"><input style={inputStyle(C)} value={form.topic} onChange={set('topic')} placeholder="e.g. Lawn Care & Maintenance" /></Field>
      <Field label="Topic (हिंदी)">
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...inputStyle(C), paddingRight: 34 }}
            value={form.topic_hi}
            onChange={(e) => { setForm((f) => ({ ...f, topic_hi: e.target.value })); setAutoHi(false) }}
            placeholder={autoHi ? 'अपने आप अनुवाद होगा…' : 'e.g. लॉन केयर'}
          />
          {translating && <span style={{ position: 'absolute', right: 10, top: 11 }}><Spinner size={16} /></span>}
        </div>
        <div style={{ fontSize: 12, marginTop: 5, color: translateErr ? C.red : C.tl, display: 'flex', alignItems: 'center', gap: 5 }}>
          {translating ? (
            'Translating from English…'
          ) : translateErr ? (
            "Couldn't auto-translate — type the Hindi manually."
          ) : autoHi ? (
            <><Icon name="check" size={13} color={C.green} /> Auto-translated from English — edit if needed.</>
          ) : (
            <>Manual. <button type="button" onClick={() => setAutoHi(true)} style={{ background: 'transparent', color: C.maroon, fontWeight: 700, padding: 0 }}>Auto-translate</button></>
          )}
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Department">
            <select style={inputStyle(C)} value={form.department} onChange={set('department')}>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={`Deadline (${t.optional})`}>
            <input type="date" style={inputStyle(C)} value={form.deadline || ''} onChange={set('deadline')} />
          </Field>
        </div>
      </div>
      <Field label="Video URL / Embed URL" hint="Paste a YouTube link OR an embed URL (iframe src). YouTube links auto-show a thumbnail; other embeds play inline.">
        <input style={inputStyle(C)} value={form.youtube_url} onChange={set('youtube_url')} placeholder="https://www.youtube.com/embed/…  or  https://…/embed/…" />
      </Field>
      {ytId ? (
        <img src={ytThumb(ytId)} alt="" style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}` }} />
      ) : form.youtube_url.trim() ? (
        <div style={{ fontSize: 12.5, color: C.tl }}>Embed URL will play directly in the player.</div>
      ) : null}
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}
