import { useEffect, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { translateToHindi } from '../../lib/translate'
import { Field, inputStyle, Spinner } from './UI'
import Icon from './Icon'

const hasLatin = (s) => /[A-Za-z]/.test(s || '')

// A Hindi box that writes itself from the English one — and gets out of the way
// the moment somebody types in it.
//
// The people who do the work do not read English, so a request typed in English
// reaches them as a wall of letters. Machine translation is a good first draft
// and wrong often enough that it cannot be the last word: whoever raises the
// request can correct the Hindi on the spot, and an admin can fix it afterwards.
//
// Auto-fill stops for good once the field is edited by hand (there is a link to
// turn it back on). Source text already written in Devanagari is left alone —
// pushing Hindi through an English→Hindi translator is how it comes back mangled.
export default function HindiInput({ label, source, value, onChange, rows, placeholder, hint }) {
  const C = useColors()
  const t = useT()
  const [auto, setAuto] = useState(!value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!auto) return
    const q = (source || '').trim()
    // nothing to translate, or it is Hindi already
    if (!q || !hasLatin(q)) { onChange(''); setBusy(false); setFailed(false); return }
    const ctrl = new AbortController()
    setBusy(true); setFailed(false)
    const id = setTimeout(async () => {
      try {
        onChange(await translateToHindi(q, ctrl.signal))
      } catch (e) {
        if (e.name !== 'AbortError') setFailed(true)
      } finally {
        setBusy(false)
      }
    }, 500)
    return () => { clearTimeout(id); ctrl.abort() }
    // onChange is a fresh closure each render; depending on it would re-translate forever
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, auto])

  const common = {
    style: rows ? { ...inputStyle(C), resize: 'vertical' } : { ...inputStyle(C), paddingRight: 34 },
    value: value || '',
    placeholder: placeholder || (auto ? t.autoTranslateWait : undefined),
    onChange: (e) => { onChange(e.target.value); setAuto(false) },
  }

  return (
    <Field label={label} hint={hint}>
      <div style={{ position: 'relative' }}>
        {rows ? <textarea rows={rows} {...common} /> : <input {...common} />}
        {busy && !rows && <span style={{ position: 'absolute', right: 10, top: 11 }}><Spinner size={16} /></span>}
      </div>
      <div style={{ fontSize: 12, marginTop: 5, color: failed ? C.red : C.tl, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {busy ? t.autoTranslating
          : failed ? t.autoTranslateFailed
          : auto ? <><Icon name="check" size={13} color={C.green} /> {t.autoTranslatedHint}</>
          : (
            <>
              {t.manualLabel}
              <button
                type="button"
                onClick={() => setAuto(true)}
                style={{ background: 'transparent', color: C.maroon, fontWeight: 700, padding: 0 }}
              >
                {t.autoTranslate}
              </button>
            </>
          )}
      </div>
    </Field>
  )
}
