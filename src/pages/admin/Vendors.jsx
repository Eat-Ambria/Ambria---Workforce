import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { typedPhone } from '../../lib/phone'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { Card, Loader, EmptyState, Button, SectionTitle, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { useConfirm } from '../../components/common/ConfirmDialog'

export default function Vendors() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)  // vendor open for editing

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
            <Card key={v.id} onClick={() => setEditing(v)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{v.name}</div>
                  <div style={{ fontSize: 13, color: C.tl }}>{v.category}{v.company ? ` · ${v.company}` : ''}</div>
                  <div style={{ fontSize: 13, color: C.tl }}>{v.phone}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* stopPropagation: calling someone must never open the editor */}
                  <a href={`tel:${v.phone}`} onClick={(e) => e.stopPropagation()} style={iconLink(C, C.green)} aria-label={t.call}><Icon name="phone" size={18} color="#fff" /></a>
                  <a href={`https://wa.me/${(v.phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={iconLink(C, '#25D366')} aria-label={t.whatsapp}>
                    <Icon name="whatsapp" size={18} color="#fff" />
                  </a>
                  {/* visible affordance — the whole card is clickable too */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditing(v) }}
                    aria-label={t.edit}
                    title={t.edit}
                    style={{ ...iconLink(C, C.card), border: `1px solid ${C.border}` }}
                  >
                    <Icon name="edit" size={17} color={C.tl} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <VendorModal
          user={user}
          record={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

const iconLink = (C, bg) => ({ width: 38, height: 38, borderRadius: 10, background: bg, display: 'grid', placeItems: 'center' })

function VendorModal({ user, record, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const confirm = useConfirm()
  const editing = !!record
  const [form, setForm] = useState({
    name: record?.name || '',
    company: record?.company || '',
    phone: record?.phone || '',
    category: record?.category || '',
    notes: record?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.name.trim()) { setErr(`${t.fullName} ${t.isRequired}`); return }
    if (!form.phone.trim()) { setErr(`${t.phone} ${t.isRequired}`); return }
    if (!form.category.trim()) { setErr(`${t.category} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const payload = {
      name: form.name.trim(), company: form.company || null, phone: form.phone.trim(),
      category: form.category.trim(), notes: form.notes || null,
    }
    const { error } = editing
      ? await supabase.from('vendors').update(payload).eq('id', record.id)
      : await supabase.from('vendors').insert({ ...payload, created_by: user.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function remove() {
    if (!(await confirm({ message: t.deleteVendorConfirm, detail: record.name, confirmLabel: t.remove }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('vendors').update({ is_active: false }).eq('id', record.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={editing ? `${t.edit} — ${record.name}` : t.vendors}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          {editing && (
            <Button variant="danger" onClick={remove} disabled={busy} title={t.delete} aria-label={t.delete} style={{ flexShrink: 0 }}>
              <Icon name="trash" size={16} color="#fff" />
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      )}>
      <Field label={t.fullName}><input style={inputStyle(C)} value={form.name} onChange={set('name')} /></Field>
      <Field label={t.phone}><input style={inputStyle(C)} value={form.phone} type="tel" inputMode="numeric" maxLength={10} placeholder={t.phonePlaceholder} onChange={(e) => setForm((f) => ({ ...f, phone: typedPhone(e.target.value) }))} /></Field>
      <Field label={t.category}><input style={inputStyle(C)} value={form.category} onChange={set('category')} placeholder="e.g. Electrician, Florist" /></Field>
      <Field label={`${t.company} (${t.optional})`}><input style={inputStyle(C)} value={form.company} onChange={set('company')} /></Field>
      <Field label={`${t.notes} (${t.optional})`}>
        <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.notes} onChange={set('notes')} />
      </Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
