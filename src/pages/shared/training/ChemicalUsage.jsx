import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { todayISO, fmtDate } from '../../../lib/time'
import { useColors } from '../../../context/ThemeContext'
import { useT, useLang } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { PROPERTIES, PROPERTY_MAP, propName, unitName, isAdminRole, canSeeAllProperties, scopedProperty, scopedDepartment } from '../../../constants/org'
import { Card, Loader, EmptyState, Button, Field, inputStyle, SectionTitle } from '../../../components/common/UI'
import Modal from '../../../components/common/Modal'
import Icon from '../../../components/common/Icon'
import { useConfirm } from '../../../components/common/ConfirmDialog'
import { translateToHindi } from '../../../lib/translate'
import ChemicalGuide from './ChemicalGuide'

const UNITS = ['L', 'ml', 'kg', 'g', 'pcs']

export default function ChemicalUsage() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const admin = isAdminRole(user?.role)
  const seeAll = canSeeAllProperties(user)
  // properties this user is allowed to see (all, or just their own)
  const visibleProps = useMemo(
    () => (seeAll ? PROPERTIES : PROPERTIES.filter((p) => p.code === user?.property)),
    [seeAll, user]
  )

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [propFilter, setPropFilter] = useState(seeAll ? 'all' : (user?.property || 'all'))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // log row open for editing
  const [mode, setMode] = useState('guide') // 'guide' (calculator + product guide) | 'log' (recorded usage)

  const load = useCallback(async () => {
    const propScope = scopedProperty(user)   // null = every property
    const deptScope = scopedDepartment(user) // null = every department (Sandeep → security)
    let q = supabase.from('chemical_usage').select('*').order('usage_date', { ascending: false }).limit(300)
    if (propScope) q = q.eq('property', propScope)
    if (deptScope) q = q.eq('department', deptScope)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const visible = useMemo(
    () => (propFilter === 'all' ? rows : rows.filter((r) => r.property === propFilter)),
    [rows, propFilter]
  )

  // totals per property (sum quantity grouped by property + unit)
  const totalsByProperty = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      const key = r.property
      if (!map[key]) map[key] = {}
      const u = r.unit || 'L'
      map[key][u] = (map[key][u] || 0) + Number(r.quantity || 0)
    })
    return map
  }, [rows])

  return (
    <div>
      {/* Chemical Guide (calculator + product guide) vs recorded Usage Log */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: C.maroonSoft, borderRadius: 12, padding: 3, width: 'fit-content' }}>
        {[
          { id: 'guide', label: lang === 'hi' ? 'केमिकल गाइड' : 'Chemical Guide' },
          { id: 'log', label: lang === 'hi' ? 'उपयोग लॉग' : 'Usage Log' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: 700,
              background: mode === m.id ? C.maroon : 'transparent',
              color: mode === m.id ? '#fff' : C.maroon,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'guide' && <ChemicalGuide visibleProps={visibleProps} />}

      {mode === 'log' && loading && <Loader label={t.loading} />}

      {mode === 'log' && !loading && (
      <>
      {/* Totals by property */}
      <SectionTitle
        right={<Button variant="soft" onClick={() => setAdding(true)}><Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{t.logUsage}</Button>}
      >
        {t.totalByProperty}
      </SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        {visibleProps.map((p) => {
          const totals = totalsByProperty[p.code] || {}
          const parts = Object.entries(totals)
          return (
            <Card key={p.code}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon name="flask" size={18} color={C.maroon} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{propName(p.code, lang)}</span>
              </div>
              {parts.length === 0 ? (
                <div style={{ fontSize: 13, color: C.tl }}>—</div>
              ) : (
                parts.map(([u, q]) => (
                  <div key={u} style={{ fontSize: 15, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                    {q} <span style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>{unitName(u, lang)}</span>
                  </div>
                ))
              )}
            </Card>
          )
        })}
      </div>

      {/* Property filter — only for users who oversee more than one property */}
      {seeAll && (
        <div className="no-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
          <Chip C={C} active={propFilter === 'all'} onClick={() => setPropFilter('all')}>{t.all}</Chip>
          {visibleProps.map((p) => (
            <Chip key={p.code} C={C} active={propFilter === p.code} onClick={() => setPropFilter(p.code)}>{propName(p.code, lang)}</Chip>
          ))}
        </div>
      )}

      {/* Usage log */}
      {visible.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map((r) => (
            <Card key={r.id} onClick={() => setEditing(r)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {lang === 'hi' && r.chemical_name_hi ? r.chemical_name_hi : r.chemical_name}
                  </div>
                  {/* brand / category, when they were recorded */}
                  {(r.brand || r.category) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {r.brand && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.maroon, background: C.maroonSoft, padding: '2px 8px', borderRadius: 999 }}>
                          {r.brand}
                        </span>
                      )}
                      {r.category && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.tl, background: C.cardAlt, border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 999 }}>
                          {r.category}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: C.tl, display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <Icon name="pin" size={13} /> {(lang === 'hi' && r.location_hi ? r.location_hi : r.location) || '—'} · {propName(r.property, lang)}
                  </div>
                  <div style={{ fontSize: 12, color: C.tl, marginTop: 2 }}>{fmtDate(r.usage_date)}{r.used_by_name ? ` · ${r.used_by_name}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: C.maroon, fontVariantNumeric: 'tabular-nums' }}>{r.quantity}</span>
                  <span style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>{unitName(r.unit, lang)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <LogModal
          user={user}
          record={editing}
          canDelete={admin || editing?.used_by === user?.id}
          properties={visibleProps}
          defaultProperty={user?.property && user.property !== 'all' ? user.property : (visibleProps[0]?.code || 'pp')}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); load() }}
        />
      )}
      </>
      )}
    </div>
  )
}

function Chip({ children, active, onClick, C }) {
  return (
    <button onClick={onClick} style={{
      whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
      background: active ? C.maroon : C.card, color: active ? '#fff' : C.tl, border: `1px solid ${active ? C.maroon : C.border}`,
    }}>{children}</button>
  )
}

function LogModal({ user, record, canDelete, properties, defaultProperty, onClose, onSaved }) {
  const confirm = useConfirm()
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const [form, setForm] = useState({
    property: record?.property || defaultProperty,
    chemical_name: record?.chemical_name || '',
    chemical_name_hi: record?.chemical_name_hi || '',
    category: record?.category || '',
    brand: record?.brand || '',
    quantity: record?.quantity ?? '',
    unit: record?.unit || 'L',
    location: record?.location || '',
    location_hi: record?.location_hi || '',
    notes: record?.notes || '',
    usage_date: record?.usage_date || todayISO(),
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // auto-fill the Hindi chemical name until the user edits it by hand. Safe
  // here (unlike people's names) — these are common nouns like "Floor cleaner".
  const [autoHi, setAutoHi] = useState(!record?.chemical_name_hi)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    if (!autoHi) return undefined
    const name = form.chemical_name.trim()
    if (!name) { setForm((f) => ({ ...f, chemical_name_hi: '' })); return undefined }
    const id = setTimeout(async () => {
      setTranslating(true)
      try {
        const hiName = await translateToHindi(name)
        if (hiName) setForm((f) => ({ ...f, chemical_name_hi: hiName }))
      } catch { /* leave it blank — the user can type it */ }
      setTranslating(false)
    }, 600)
    return () => clearTimeout(id)
  }, [form.chemical_name, autoHi])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.chemical_name.trim()) { setErr(`${t.chemical} ${t.isRequired}`); return }
    if (!form.property) { setErr(`${t.propertyLabel} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    // fields the user can change; who logged it and when are left alone on edit
    const payload = {
      property: form.property,
      chemical_name: form.chemical_name.trim(),
      chemical_name_hi: form.chemical_name_hi.trim() || null,
      category: form.category || null,
      brand: form.brand || null,
      quantity: Number(form.quantity || 0),
      unit: form.unit,
      location: form.location || null,
      location_hi: form.location_hi.trim() || null,
      notes: form.notes || null,
      usage_date: form.usage_date || todayISO(),
    }
    const { error } = record
      ? await supabase.from('chemical_usage').update(payload).eq('id', record.id)
      : await supabase.from('chemical_usage').insert({
        ...payload,
        department: user.department || null,
        used_by: user.id,
        used_by_name: user.name,
        created_by: user.id,
      })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function del() {
    if (!(await confirm({ message: t.deleteLogConfirm }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('chemical_usage').delete().eq('id', record.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={record ? t.editLog : t.logUsage}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          {record && canDelete && (
            <Button variant="danger" onClick={del} disabled={busy} title={t.delete} aria-label={t.delete} style={{ flexShrink: 0 }}>
              <Icon name="trash" size={16} color="#fff" />
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label={t.propertyLabel}>
        <select style={inputStyle(C)} value={form.property} onChange={set('property')} disabled={properties.length <= 1}>
          {properties.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
        </select>
      </Field>
      <Field label={t.chemical}>
        <input style={inputStyle(C)} value={form.chemical_name} onChange={set('chemical_name')} placeholder={t.chemicalEg} />
      </Field>
      <Field label={`${t.chemical} (हिंदी)`}>
        <input
          style={inputStyle(C)}
          value={form.chemical_name_hi}
          onChange={(e) => { setAutoHi(false); set('chemical_name_hi')(e) }}
          placeholder={autoHi ? 'अपने आप अनुवाद होगा…' : 'जैसे फ़र्श क्लीनर'}
        />
        <div style={{ fontSize: 11.5, marginTop: 4, color: C.tl, display: 'flex', alignItems: 'center', gap: 5 }}>
          {translating ? t.translating : autoHi ? (
            <><Icon name="check" size={12} color={C.green} /> {t.autoFilledEditable}</>
          ) : (
            <button type="button" onClick={() => setAutoHi(true)}
                    style={{ background: 'transparent', color: C.maroon, fontWeight: 700, padding: 0 }}>
              {t.autoTranslate}
            </button>
          )}
        </div>
      </Field>
      <Field label={t.usageDate} hint={t.usageDateHint}>
        <input
          type="date"
          max={todayISO()}
          style={inputStyle(C)}
          value={form.usage_date}
          onChange={set('usage_date')}
        />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t.quantity}>
            <input type="number" style={inputStyle(C)} value={form.quantity} onChange={set('quantity')} />
          </Field>
        </div>
        <div style={{ width: 100 }}>
          <Field label={t.unit}>
            <select style={inputStyle(C)} value={form.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <Field label={t.location}>
        <input style={inputStyle(C)} value={form.location} onChange={set('location')} placeholder={t.locationEg} />
      </Field>
      <Field label={`${t.location} (हिंदी)`} hint={t.hindiOptionalHint}>
        <input style={inputStyle(C)} value={form.location_hi} onChange={set('location_hi')} placeholder="जैसे बैंक्वेट हॉल, लॉन, शौचालय" />
      </Field>
      <Field label={`${t.brandCategory} (${t.optional})`}>
        <input style={{ ...inputStyle(C), marginBottom: 8 }} value={form.brand} onChange={set('brand')} placeholder={t.brandEg} />
        <input style={inputStyle(C)} value={form.category} onChange={set('category')} placeholder={t.categoryEg} />
      </Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
