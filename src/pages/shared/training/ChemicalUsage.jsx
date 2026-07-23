import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { todayISO, fmtDate } from '../../../lib/time'
import { useColors } from '../../../context/ThemeContext'
import { useT, useLang } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { PROPERTIES, PROPERTY_MAP, isAdminRole, canSeeAllProperties, scopedProperty, scopedDepartment } from '../../../constants/org'
import { Card, Loader, EmptyState, Button, Field, inputStyle, SectionTitle } from '../../../components/common/UI'
import Modal from '../../../components/common/Modal'
import Icon from '../../../components/common/Icon'
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
                <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
              </div>
              {parts.length === 0 ? (
                <div style={{ fontSize: 13, color: C.tl }}>—</div>
              ) : (
                parts.map(([u, q]) => (
                  <div key={u} style={{ fontSize: 15, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                    {q} <span style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>{u}</span>
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
            <Chip key={p.code} C={C} active={propFilter === p.code} onClick={() => setPropFilter(p.code)}>{p.name}</Chip>
          ))}
        </div>
      )}

      {/* Usage log */}
      {visible.length === 0 ? (
        <EmptyState icon={null} title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map((r) => (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {lang === 'hi' && r.chemical_name_hi ? r.chemical_name_hi : r.chemical_name}
                  </div>
                  <div style={{ fontSize: 13, color: C.tl, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Icon name="pin" size={13} /> {r.location || '—'} · {PROPERTY_MAP[r.property]?.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.tl, marginTop: 2 }}>{fmtDate(r.usage_date)}{r.used_by_name ? ` · ${r.used_by_name}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: C.maroon, fontVariantNumeric: 'tabular-nums' }}>{r.quantity}</span>
                  <span style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>{r.unit}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <LogModal
          user={user}
          properties={visibleProps}
          defaultProperty={user?.property && user.property !== 'all' ? user.property : (visibleProps[0]?.code || 'pp')}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
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

function LogModal({ user, properties, defaultProperty, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [form, setForm] = useState({
    property: defaultProperty, chemical_name: '', category: '', brand: '',
    quantity: '', unit: 'L', location: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.chemical_name.trim() || !form.property) { setErr(t.required); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('chemical_usage').insert({
      property: form.property,
      chemical_name: form.chemical_name.trim(),
      category: form.category || null,
      brand: form.brand || null,
      quantity: Number(form.quantity || 0),
      unit: form.unit,
      location: form.location || null,
      department: user.department || null,
      used_by: user.id,
      used_by_name: user.name,
      usage_date: todayISO(),
      notes: form.notes || null,
      created_by: user.id,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={t.logUsage}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label="Property">
        <select style={inputStyle(C)} value={form.property} onChange={set('property')} disabled={properties.length <= 1}>
          {properties.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={t.chemical}>
        <input style={inputStyle(C)} value={form.chemical_name} onChange={set('chemical_name')} placeholder="e.g. Floor cleaner" />
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
        <input style={inputStyle(C)} value={form.location} onChange={set('location')} placeholder="e.g. Banquet hall, Lawn, WC" />
      </Field>
      <Field label={`Brand / Category (${t.optional})`}>
        <input style={{ ...inputStyle(C), marginBottom: 8 }} value={form.brand} onChange={set('brand')} placeholder="Brand e.g. Kleanfix" />
        <input style={inputStyle(C)} value={form.category} onChange={set('category')} placeholder="Category e.g. Floor Care" />
      </Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
