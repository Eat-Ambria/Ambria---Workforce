import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayISO, fmtDate } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { PROPERTIES, DEPARTMENTS, DEPARTMENT_MAP, propName, deptName, personName } from '../../constants/org'
import { assigneesQuery } from '../../lib/assignees'
import { Card, Loader, Button, SectionTitle, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { useConfirm } from '../../components/common/ConfirmDialog'

// Temporary cover: someone posted to one venue working at another for a while.
//
// The roster can record cover as a side effect of handing out work, which is
// convenient but invisible — there was no way to answer "who is at Exotica this
// week?" or to end a cover early. This is that place: the arrangement itself,
// with dates, listed and revocable.
//
// While a cover is live the person's session picks up that venue (see
// scopedProperties), so they see its repair board as well as their own.
export default function CoverPanel() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const confirm = useConfirm()

  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const today = todayISO()

  const load = useCallback(async () => {
    const [{ data: deps }, { data: mem }] = await Promise.all([
      supabase.from('staff_deployments').select('*').order('from_date', { ascending: false }),
      assigneesQuery({}),
    ])
    setRows(deps || [])
    setPeople(mem || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const personOf = useCallback(
    (id) => people.find((p) => p.id === id),
    [people]
  )

  // live today vs finished — a lapsed cover is history, not a current posting
  const { live, past } = useMemo(() => {
    const isLive = (d) => d.from_date <= today && (!d.to_date || d.to_date >= today)
    return {
      live: rows.filter(isLive),
      past: rows.filter((d) => !isLive(d)),
    }
  }, [rows, today])

  async function endCover(d) {
    const who = personName(personOf(d.user_id) || {}, lang) || d.user_id
    if (!(await confirm({
      message: t.endCoverConfirm,
      detail: `${who} · ${propName(d.property, lang)}`,
      confirmLabel: t.endCover,
    }))) return
    setErr('')
    // ended, not deleted: the row stays as a record of who covered where
    const { error } = await supabase.from('staff_deployments')
      .update({ to_date: today }).eq('id', d.id)
    if (error) { setErr(error.message); return }
    load()
  }

  if (loading) return <Loader label={t.loading} />

  const row = (d, isLive) => {
    const p = personOf(d.user_id)
    return (
      <div
        key={d.id}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '10px 12px', borderRadius: 10, flexWrap: 'wrap',
          background: isLive ? C.card : C.cardAlt,
          border: `1px solid ${isLive ? C.border : 'transparent'}`,
          opacity: isLive ? 1 : 0.75,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {p ? personName(p, lang) : d.user_id}
          </div>
          <div style={{ fontSize: 12.5, color: C.tl, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {p?.property && <span>{propName(p.property, lang)}</span>}
            <Icon name="chevronRight" size={12} color={C.faint} />
            <span style={{ fontWeight: 700, color: C.maroon }}>{propName(d.property, lang)}</span>
            {(d.department || p?.department) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ·
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: DEPARTMENT_MAP[d.department || p?.department]?.color || C.tl }} />
                {deptName(d.department || p?.department, lang)}
                {d.department && p?.department && d.department !== p.department && (
                  <span style={{ color: C.maroon, fontWeight: 700 }}> ({t.insteadOf} {deptName(p.department, lang)})</span>
                )}
              </span>
            )}
          </div>
          {d.note && (
            <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, fontStyle: 'italic' }}>{d.note}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: C.tl, whiteSpace: 'nowrap' }}>
            {fmtDate(d.from_date)} → {d.to_date ? fmtDate(d.to_date) : t.untilFurtherNotice}
          </span>
          {isLive && (
            <Button variant="ghost" onClick={() => endCover(d)} style={{ padding: '7px 12px', fontSize: 12.5 }}>
              {t.endCover}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionTitle
        right={(
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{t.addCover}
          </Button>
        )}
      >
        {t.coverTitle}
      </SectionTitle>

      <div style={{ fontSize: 12.5, color: C.tl, marginBottom: 14, lineHeight: 1.5 }}>{t.coverExplain}</div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tl, marginBottom: 10 }}>
          {t.onCoverNow} · {live.length}
        </div>
        {live.length === 0
          ? <div style={{ fontSize: 13, color: C.faint }}>{t.noCoverNow}</div>
          : <div style={{ display: 'grid', gap: 8 }}>{live.map((d) => row(d, true))}</div>}
      </Card>

      {past.length > 0 && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tl, marginBottom: 10 }}>
            {t.pastCover} · {past.length}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>{past.slice(0, 20).map((d) => row(d, false))}</div>
        </Card>
      )}

      {adding && (
        <AddCover
          people={people}
          user={user}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}
    </div>
  )
}

function AddCover({ people, user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [form, setForm] = useState({ user_id: '', property: '', department: '', from_date: todayISO(), to_date: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const chosen = people.find((p) => p.id === form.user_id)
  const pickPerson = (e) => {
    const id = e.target.value
    const p = people.find((x) => x.id === id)
    // start from their own team: covering in a different one is the exception
    setForm((f) => ({ ...f, user_id: id, department: p?.department || '' }))
  }

  async function save() {
    if (!form.user_id) { setErr(`${t.members} ${t.isRequired}`); return }
    if (!form.property) { setErr(`${t.propertyLabel} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('staff_deployments').upsert({
      user_id: form.user_id,
      property: form.property,
      department: form.department || chosen?.department || null,
      from_date: form.from_date || todayISO(),
      to_date: form.to_date || null,
      note: form.note.trim() || null,
      created_by: user.id,
    }, { onConflict: 'user_id,property,from_date' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} maxWidth={480} title={t.addCover}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}
    >
      <Field label={t.members} required>
        <select style={inputStyle(C)} value={form.user_id} onChange={pickPerson}>
          <option value="">— {t.members} —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p, lang)}
              {p.department ? ` · ${deptName(p.department, lang)}` : ''}
              {p.property ? ` · ${propName(p.property, lang)}` : ''}
            </option>
          ))}
        </select>
      </Field>

      {/* who they actually are — a name alone does not say whether sending them
          to another venue makes any sense */}
      {chosen && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', marginBottom: 14, fontSize: 12.5, color: C.tl }}>
          {chosen.department && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: DEPARTMENT_MAP[chosen.department]?.color || C.tl }} />
              <b style={{ color: C.text }}>{deptName(chosen.department, lang)}</b>
            </span>
          )}
          <span><Icon name="pin" size={12} color={C.faint} /> {propName(chosen.property, lang)}</span>
          {chosen.designation && <span>{chosen.designation}</span>}
        </div>
      )}

      <Field label={t.propertyLabel} required hint={chosen ? t.coverAwayFromHome.replace('{home}', propName(chosen.property, lang)) : undefined}>
        <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
          <option value="">— {t.propertyLabel} —</option>
          {PROPERTIES.filter((p) => !chosen || p.code !== chosen.property).map((p) => (
            <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>
          ))}
        </select>
      </Field>

      {/* which team there — usually their own, but a housekeeper can be lent as
          security cover, and the roster/analytics should show them where they
          actually worked */}
      <Field label={t.department} hint={chosen && form.department !== chosen.department ? t.coverOtherDeptHint : undefined}>
        <select style={inputStyle(C)} value={form.department} onChange={set('department')}>
          <option value="">— {t.department} —</option>
          {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>)}
        </select>
      </Field>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <Field label={t.coverFrom}>
            <input type="date" style={inputStyle(C)} value={form.from_date} onChange={set('from_date')} />
          </Field>
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <Field label={`${t.coverTo} (${t.optional})`} hint={t.coverHint}>
            <input type="date" style={inputStyle(C)} min={form.from_date} value={form.to_date} onChange={set('to_date')} />
          </Field>
        </div>
      </div>

      <Field label={`${t.coverNote} (${t.optional})`} hint={t.coverNoteHint}>
        <textarea
          rows={2}
          style={{ ...inputStyle(C), resize: 'vertical' }}
          value={form.note}
          placeholder={t.coverNotePlaceholder}
          onChange={set('note')}
        />
      </Field>

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
    </Modal>
  )
}
