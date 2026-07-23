import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { Card, Loader, EmptyState, Button, SectionTitle, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'

export default function Vendors() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('vendors').select('*').eq('is_active', true).order('name')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => [r.name, r.company, r.category, r.phone].filter(Boolean).some((f) => f.toLowerCase().includes(s)))
  }, [rows, search])

  if (loading) return <Loader label={t.loading} />

  return (
    <div>
      <SectionTitle right={<Button variant="primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{t.vendors}</Button>}>
        {t.vendors}
      </SectionTitle>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: 11, color: C.tl }}><Icon name="search" size={18} /></span>
        <input style={{ ...inputStyle(C), paddingLeft: 40 }} placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {visible.length === 0 ? <EmptyState icon={null} title={t.noData} /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map((v) => (
            <Card key={v.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{v.name}</div>
                  <div style={{ fontSize: 13, color: C.tl }}>{v.category}{v.company ? ` · ${v.company}` : ''}</div>
                  <div style={{ fontSize: 13, color: C.tl }}>{v.phone}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <a href={`tel:${v.phone}`} style={iconLink(C, C.green)} aria-label="Call"><Icon name="phone" size={18} color="#fff" /></a>
                  <a href={`https://wa.me/${(v.phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" style={iconLink(C, '#25D366')} aria-label="WhatsApp">
                    <Icon name="whatsapp" size={18} color="#fff" />
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding && <AddModal user={user} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
  )
}

const iconLink = (C, bg) => ({ width: 38, height: 38, borderRadius: 10, background: bg, display: 'grid', placeItems: 'center' })

function AddModal({ user, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const [form, setForm] = useState({ name: '', company: '', phone: '', category: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.name.trim() || !form.phone.trim() || !form.category.trim()) { setErr(t.required); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('vendors').insert({
      name: form.name.trim(), company: form.company || null, phone: form.phone.trim(),
      category: form.category.trim(), notes: form.notes || null, created_by: user.id,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={t.vendors}
      footer={<><Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button><Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button></>}>
      <Field label="Name"><input style={inputStyle(C)} value={form.name} onChange={set('name')} /></Field>
      <Field label="Phone"><input style={inputStyle(C)} value={form.phone} onChange={set('phone')} /></Field>
      <Field label="Category"><input style={inputStyle(C)} value={form.category} onChange={set('category')} placeholder="e.g. Electrician, Florist" /></Field>
      <Field label={`Company (${t.optional})`}><input style={inputStyle(C)} value={form.company} onChange={set('company')} /></Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
