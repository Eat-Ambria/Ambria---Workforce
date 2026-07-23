import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { todayISO, fmtDate } from '../../../lib/time'
import { useColors } from '../../../context/ThemeContext'
import { useT } from '../../../context/LangContext'
import { PROPERTY_MAP, PROPERTIES } from '../../../constants/org'
import { Card, Loader, EmptyState, Badge, Button, Field, inputStyle } from '../../../components/common/UI'
import Modal from '../../../components/common/Modal'
import MultiSelect from '../../../components/common/MultiSelect'
import Icon from '../../../components/common/Icon'

const DAY = 86400000
const daysUntil = (d) => Math.ceil((new Date(d) - new Date(todayISO())) / DAY)
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// common extinguisher types (size/kg and quantity are typed in manually)
const TYPE_OPTIONS = ['ABC Dry Powder', 'CO2', 'Water', 'Mechanical Foam', 'Clean Agent', 'Water Mist']

// refill/expiry status
function extStatus(e) {
  if (!e.expiry_date) return { key: 'active', color: 'green', bg: 'gBg', label: 'OK' }
  const days = daysUntil(e.expiry_date)
  if (days < 0) return { key: 'expired', color: 'red', bg: 'rBg', label: 'Expired' }
  if (days <= 15) return { key: 'expiring', color: 'yellow', bg: 'yBg', label: `${days}d left` }
  return { key: 'ok', color: 'green', bg: 'gBg', label: 'OK' }
}

// periodic inspection status (based on next_inspection vs today)
function inspectStatus(e) {
  if (!e.last_inspection && !e.next_inspection) return { color: 'tl', label: 'Not inspected' }
  if (!e.next_inspection) return { color: 'tl', label: 'No next date set' }
  const days = daysUntil(e.next_inspection)
  if (days < 0) return { color: 'red', label: `Overdue by ${Math.abs(days)}d` }   // past the due date, not inspected
  if (days <= 7) return { color: 'yellow', label: `Due in ${days}d` }
  return { color: 'green', label: 'Up to date' }                                  // inspected & within due date
}

export default function FireSafety() {
  const C = useColors()
  const t = useT()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(null) // extinguisher being inspected
  const [adding, setAdding] = useState(false)  // add-cylinder modal open
  const [propSel, setPropSel] = useState([])   // property filter (multi-select)

  const load = useCallback(async () => {
    const { data } = await supabase.from('fire_extinguishers').select('*').order('expiry_date')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // permanently remove a cylinder from the register
  const removeExt = useCallback(async (e) => {
    if (!window.confirm(`Delete this cylinder — ${e.location}${e.capacity ? ` (${e.capacity})` : ''}? This cannot be undone.`)) return
    await supabase.from('fire_extinguishers').delete().eq('id', e.id)
    load()
  }, [load])

  // only show properties that actually have extinguishers, as filter options
  const propOptions = useMemo(() => {
    const present = new Set(rows.map((e) => e.property))
    return PROPERTIES.filter((p) => present.has(p.code)).map((p) => ({ value: p.code, label: p.name }))
  }, [rows])

  const visible = useMemo(
    () => (propSel.length ? rows.filter((e) => propSel.includes(e.property)) : rows),
    [rows, propSel]
  )

  if (loading) return <Loader label={t.loading} />

  return (
    <div>
      {/* property filter + add cylinder */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 260, maxWidth: '100%' }}>
          <MultiSelect C={C} placeholder={t.properties || 'All properties'} options={propOptions} selected={propSel} onChange={setPropSel} />
        </div>
        <Button variant="primary" onClick={() => setAdding(true)} style={{ marginLeft: 'auto' }}>
          <Icon name="plus" size={16} color="#fff" style={{ marginRight: 4 }} /> Add cylinder
        </Button>
      </div>

      {rows.length === 0 || visible.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map((e) => {
        const s = extStatus(e)
        const insp = inspectStatus(e)
        return (
          <Card key={e.id} style={{ borderLeft: `4px solid ${C[s.color]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Icon name="fire" size={17} color={C.red} /> {e.location}
                </div>
                <div style={{ fontSize: 13, color: C.tl, marginTop: 2 }}>
                  {PROPERTY_MAP[e.property]?.name} · {e.type}{e.capacity ? ` · ${e.capacity}` : ''}{e.quantity > 1 ? ` · ×${e.quantity}` : ''}
                </div>
                <div style={{ fontSize: 12, color: C.tl, marginTop: 2 }}>Expiry: {fmtDate(e.expiry_date)}</div>
              </div>
              <Badge color={C[s.color]} bg={C[s.bg]}>{s.label}</Badge>
            </div>

            {/* inspection row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Icon name="check" size={15} color={C[insp.color]} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C[insp.color] }}>{insp.label}</div>
                  <div style={{ fontSize: 12, color: C.faint }}>
                    Last inspected: {e.last_inspection ? fmtDate(e.last_inspection) : '—'}
                    {e.next_inspection ? ` · Due: ${fmtDate(e.next_inspection)}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="soft" onClick={() => setLogging(e)} style={{ padding: '8px 12px', fontSize: 13 }}>
                  <Icon name="check" size={15} color={C.maroon} style={{ marginRight: 4 }} /> Log inspection
                </Button>
                <Button variant="ghost" onClick={() => removeExt(e)} aria-label="Delete cylinder" style={{ padding: '8px 12px', fontSize: 13 }}>
                  <Icon name="trash" size={15} color={C.red} />
                </Button>
              </div>
            </div>
          </Card>
            )
          })}
        </div>
      )}

      {logging && (
        <LogModal ext={logging} onClose={() => setLogging(null)} onSaved={() => { setLogging(null); load() }} />
      )}
      {adding && (
        <AddModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
    </div>
  )
}

// Admin registers a new cylinder: property, location, type, size (kg) + expiry.
function AddModal({ onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [form, setForm] = useState({
    property: PROPERTIES[0].code,
    location: '',
    type: TYPE_OPTIONS[0],
    capacity: '',
    quantity: '1',
    serial_number: '',
    install_date: '',
    expiry_date: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.location.trim()) { setErr('Enter the location'); return }
    if (!form.expiry_date) { setErr('Pick the expiry / next refill date'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('fire_extinguishers').insert({
      property: form.property,
      location: form.location.trim(),
      type: form.type,
      capacity: form.capacity.trim() || null,
      quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
      serial_number: form.serial_number.trim() || null,
      install_date: form.install_date || null,
      expiry_date: form.expiry_date,
      status: 'active',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title="Add cylinder"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label="Property">
        <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
          {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Location">
        <input style={inputStyle(C)} value={form.location} onChange={set('location')} placeholder="e.g. Main lobby, Kitchen, Gate 2" />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Type">
            <select style={inputStyle(C)} value={form.type} onChange={set('type')}>
              {TYPE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Size (kg)">
            <input style={inputStyle(C)} value={form.capacity} onChange={set('capacity')} placeholder="e.g. 6 kg" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Quantity">
            <input type="number" min="1" style={inputStyle(C)} value={form.quantity} onChange={set('quantity')} placeholder="How many cylinders" />
          </Field>
        </div>
      </div>
      <Field label="Serial number (optional)">
        <input style={inputStyle(C)} value={form.serial_number} onChange={set('serial_number')} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Install date (optional)">
            <input type="date" max={todayISO()} style={inputStyle(C)} value={form.install_date} onChange={set('install_date')} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Expiry / next refill">
            <input type="date" style={inputStyle(C)} value={form.expiry_date} onChange={set('expiry_date')} />
          </Field>
        </div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}

// Admin records an inspection: sets last inspection to a date and schedules the next.
function LogModal({ ext, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [date, setDate] = useState(todayISO())
  const [next, setNext] = useState(() => addDays(todayISO(), 90)) // default: quarterly
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!date) { setErr('Pick an inspection date'); return }
    if (next && next < date) { setErr('Next inspection must be after the inspection date'); return }
    setBusy(true); setErr('')
    const { error } = await supabase
      .from('fire_extinguishers')
      .update({ last_inspection: date, next_inspection: next || null })
      .eq('id', ext.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={`Log inspection — ${ext.location}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: C.tl, marginBottom: 14 }}>
        {PROPERTY_MAP[ext.property]?.name} · {ext.type}{ext.capacity ? ` · ${ext.capacity}` : ''}{ext.quantity > 1 ? ` · ×${ext.quantity}` : ''}
      </div>
      <Field label="Inspection date">
        <input type="date" max={todayISO()} style={inputStyle(C)} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Next inspection due" hint="Defaults to 3 months from today.">
        <input type="date" min={date} style={inputStyle(C)} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
