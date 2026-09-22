import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useColors } from '../../../context/ThemeContext'
import { useT, useLang } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { propName, PROPERTIES, scopedProperty } from '../../../constants/org'
import { Card, Loader, EmptyState, Badge, Button, Field, FilterChip, inputStyle } from '../../../components/common/UI'
import Modal from '../../../components/common/Modal'
import MultiSelect from '../../../components/common/MultiSelect'
import Icon from '../../../components/common/Icon'
import { useConfirm } from '../../../components/common/ConfirmDialog'
import { useMediaQuery } from '../../../hooks/useMediaQuery'

// The two brands on site. Free text underneath, so a third recorder is somebody
// typing its name here rather than waiting on a code change — the list is a
// shortcut for the common case, not a restriction.
const COMPANY_OPTIONS = ['CP Plus', 'Hik Connect']

const iconBtn = { background: 'transparent', padding: 2, lineHeight: 0, flexShrink: 0 }

/**
 * One labelled detail on a device card.
 *
 * A dash rather than an absent row when there is nothing: the register is meant
 * to be filled in over time, and a missing serial number reads as something
 * still to do only if the space for it is visible.
 *
 * `children` wins over `value` — the password cell needs its own buttons beside
 * the text and everything else is a plain string.
 */
function Cell({ C, label, value, mono, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.faint,
        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13.5, fontWeight: 600, display: 'flex',
        alignItems: 'center', gap: 6, minWidth: 0,
      }}>
        {children ?? (value
          ? <span style={{ fontFamily: mono ? 'ui-monospace, monospace' : undefined, wordBreak: 'break-all' }}>{value}</span>
          : <span style={{ color: C.faint }}>—</span>)}
      </div>
    </div>
  )
}

export default function CctvDevices() {
  const confirm = useConfirm()
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const propScope = scopedProperty(user)   // null = may see every venue
  const wide = useMediaQuery('(min-width: 900px)')

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [propSel, setPropSel] = useState([])
  const [shown, setShown] = useState(null)  // id of the row whose password is revealed
  const [copied, setCopied] = useState(null)

  const load = useCallback(async () => {
    let q = supabase.from('cctv_devices').select('*').order('property').order('id')
    if (propScope) q = q.eq('property', propScope)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }, [propScope])

  useEffect(() => { load() }, [load])

  const removeDevice = useCallback(async (d) => {
    if (!(await confirm({
      message: t.deleteDeviceConfirm,
      detail: `${propName(d.property, lang)}${d.company ? ` · ${d.company}` : ''}`,
    }))) return
    await supabase.from('cctv_devices').delete().eq('id', d.id)
    load()
  }, [confirm, t, lang, load])

  // Only the venues that actually have a recorder; an empty filter chip is a
  // dead end dressed up as a choice.
  const propOptions = useMemo(() => {
    const present = new Set(rows.map((d) => d.property))
    return PROPERTIES.filter((p) => present.has(p.code)).map((p) => ({ value: p.code, label: p.name }))
  }, [rows])

  const visible = useMemo(
    () => (propSel.length ? rows.filter((d) => propSel.includes(d.property)) : rows),
    [rows, propSel]
  )

  async function copy(d) {
    if (!d.password) return
    try {
      await navigator.clipboard.writeText(d.password)
      setCopied(d.id)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // refused on an insecure origin and in some in-app browsers; the reveal
      // button still puts it on screen, so nothing is lost
    }
  }

  if (loading) return <Loader label={t.loading} />

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {!propScope && (wide ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <FilterChip active={propSel.length === 0} onClick={() => setPropSel([])}>{t.all}</FilterChip>
            {propOptions.map((o) => {
              const on = propSel.includes(o.value)
              return (
                <FilterChip
                  key={o.value}
                  active={on}
                  onClick={() => setPropSel((prev) => (on ? prev.filter((v) => v !== o.value) : [...prev, o.value]))}
                >
                  {propName(o.value, lang)}
                </FilterChip>
              )
            })}
          </div>
        ) : (
          <div style={{ width: 260, maxWidth: '100%' }}>
            <MultiSelect C={C} placeholder={t.properties} options={propOptions} selected={propSel} onChange={setPropSel} />
          </div>
        ))}
        <Button variant="primary" onClick={() => setAdding(true)} style={{ marginLeft: 'auto' }}>
          <Icon name="plus" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.addDevice}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={null} title={rows.length === 0 ? t.noDevicesYet : t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map((d) => (
            <Card key={d.id} onClick={() => setEditing(d)} style={{ cursor: 'pointer' }}>
              {/* Venue, brand, bin. The brand is a chip rather than a second
                  grey line — it is the one thing that tells two otherwise
                  identical cards apart at a glance. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="camera" size={18} color={C.maroon} />
                <span style={{ fontWeight: 700, fontSize: 15.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {propName(d.property, lang)}
                </span>
                {d.company && <Badge color={C.maroon} bg={C.maroonSoft}>{d.company}</Badge>}
                <Button variant="ghost" onClick={(ev) => { ev.stopPropagation(); removeDevice(d) }}
                        aria-label={t.deleteDevice}
                        style={{ padding: '6px 10px', marginLeft: 'auto', flexShrink: 0 }}>
                  <Icon name="trash" size={15} color={C.red} />
                </Button>
              </div>

              {/* Serial, then the sign-in. Three labelled cells that spread
                  across whatever width there is instead of huddling on the left
                  and leaving the rest of the card empty; on a phone they stack.
                  Unlike the wifi key next door a recorder password is not
                  written to be handed out, so it stays masked until asked for. */}
              <div style={{
                display: 'grid', gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
              }}>
                <Cell C={C} label={t.serialNo} value={d.serial_number} mono />
                <Cell C={C} label={t.username} value={d.username} />
                <Cell C={C} label={t.password}>
                  {!d.password ? (
                    <span style={{ color: C.faint }}>—</span>
                  ) : (
                    <>
                      <span style={{
                        fontFamily: shown === d.id ? 'ui-monospace, monospace' : undefined,
                        letterSpacing: shown === d.id ? 0 : 1.5,
                        wordBreak: 'break-all',
                      }}>
                        {shown === d.id ? d.password : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setShown((s) => (s === d.id ? null : d.id)) }}
                        aria-label={shown === d.id ? t.hidePassword : t.showPassword}
                        style={iconBtn}
                      >
                        <Icon name={shown === d.id ? 'eye' : 'eyeOff'} size={15} color={C.tl} />
                      </button>
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); copy(d) }}
                        aria-label={t.copy}
                        style={iconBtn}
                      >
                        <Icon name={copied === d.id ? 'check' : 'copy'} size={15}
                              color={copied === d.id ? C.green : C.tl} />
                      </button>
                    </>
                  )}
                </Cell>
              </div>

              {d.notes && (
                <div style={{
                  fontSize: 12.5, color: C.tl, marginTop: 12, paddingTop: 10,
                  borderTop: `1px solid ${C.border}`,
                }}>
                  {d.notes}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <DeviceModal
          record={editing}
          propScope={propScope}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function DeviceModal({ record, propScope, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [form, setForm] = useState({
    property: record?.property || propScope || PROPERTIES[0].code,
    company: record?.company || COMPANY_OPTIONS[0],
    serial_number: record?.serial_number || '',
    username: record?.username || '',
    password: record?.password || '',
    notes: record?.notes || '',
  })
  // An unrecognised brand already on the row opens in free-text mode, so
  // editing something else about that device does not quietly rewrite it.
  const [otherCompany, setOtherCompany] = useState(
    !!record?.company && !COMPANY_OPTIONS.includes(record.company)
  )
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    // A recorder nobody can sign in to is not worth a row. Checked here rather
    // than with NOT NULL columns, so the rows written before this rule — and any
    // written by hand in the SQL editor — still load instead of the tab breaking
    // on them.
    if (!form.company.trim()) { setErr(`${t.deviceCompany} ${t.isRequired}`); return }
    if (!form.serial_number.trim()) { setErr(`${t.serialNo} ${t.isRequired}`); return }
    if (!form.username.trim()) { setErr(`${t.username} ${t.isRequired}`); return }
    if (!form.password) { setErr(`${t.password} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const payload = {
      property: form.property,
      company: form.company.trim(),
      serial_number: form.serial_number.trim(),
      username: form.username.trim(),
      // not trimmed: a password may legitimately begin or end with a space, and
      // eating one makes it simply wrong
      password: form.password,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = record
      ? await supabase.from('cctv_devices').update(payload).eq('id', record.id)
      : await supabase.from('cctv_devices').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={record ? t.editDevice : t.addDevice}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      {propScope ? (
        <Field label={t.propertyLabel} required>
          <div style={{ ...inputStyle(C), display: 'flex', alignItems: 'center', color: C.tl, background: C.cardAlt }}>
            {propName(propScope, lang)}
          </div>
        </Field>
      ) : (
        <Field label={t.propertyLabel} required>
          <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
            {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
          </select>
        </Field>
      )}

      {/* The picker stays on screen in both modes. Swapping it out for the text
          box left no way back to CP Plus once "Other…" was picked. */}
      <Field label={t.deviceCompany} required>
        <select
          style={inputStyle(C)}
          value={otherCompany ? '__other' : form.company}
          onChange={(e) => {
            if (e.target.value === '__other') { setOtherCompany(true); setForm((f) => ({ ...f, company: '' })); return }
            setOtherCompany(false)
            setForm((f) => ({ ...f, company: e.target.value }))
          }}
        >
          {COMPANY_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
          <option value="__other">{lang === 'hi' ? 'कोई और…' : 'Other…'}</option>
        </select>
        {otherCompany && (
          <input
            style={{ ...inputStyle(C), marginTop: 8 }}
            value={form.company}
            onChange={set('company')}
            placeholder={lang === 'hi' ? 'कंपनी का नाम' : 'Company name'}
            autoFocus
          />
        )}
      </Field>

      <Field label={t.serialNo} required>
        <input style={inputStyle(C)} value={form.serial_number} onChange={set('serial_number')} />
      </Field>

      <Field label={t.username} required>
        {/* the recorder's own login, not a browser account — keep the password
            manager out of it */}
        <input style={inputStyle(C)} value={form.username} onChange={set('username')} autoComplete="off" />
      </Field>

      <Field label={t.password} required>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type={reveal ? 'text' : 'password'}
            style={{ ...inputStyle(C), flex: 1 }}
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? t.hidePassword : t.showPassword}
            style={{ background: 'transparent', padding: 8, lineHeight: 0 }}
          >
            <Icon name={reveal ? 'eye' : 'eyeOff'} size={17} color={C.tl} />
          </button>
        </div>
      </Field>

      <Field label={`${t.notes} (${t.optional})`}>
        <input style={inputStyle(C)} value={form.notes} onChange={set('notes')} />
      </Field>

      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
