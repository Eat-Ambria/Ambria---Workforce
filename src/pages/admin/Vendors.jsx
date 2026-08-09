import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { typedPhone } from '../../lib/phone'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { Card, Loader, EmptyState, Button, SectionTitle, Field, inputStyle } from '../../components/common/UI'
import HindiInput from '../../components/common/HindiInput'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { useConfirm } from '../../components/common/ConfirmDialog'

export default function Vendors() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | fixed | new
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)  // vendor open for editing

  const load = useCallback(async () => {
    const { data } = await supabase.from('vendors').select('*').eq('is_active', true).order('name')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Counts come from the same array the list is built from. Deriving a count
  // from `rows` next to a list built from `visible` is how a chip ends up
  // claiming 5 above a list of 2.
  const searched = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return rows
    // the Hindi columns are searchable too — otherwise typing what you can
    // see on the card returns nothing
    return rows.filter((r) => [r.name, r.name_hi, r.company, r.category, r.category_hi, r.phone]
      .filter(Boolean).some((f) => f.toLowerCase().includes(s)))
  }, [rows, search])

  const visible = useMemo(() => {
    const list = typeFilter === 'all' ? searched : searched.filter((r) => vendorType(r) === typeFilter)
    // fixed first — a directory that buries the default vendor is not answering
    // the question it exists to answer
    return [...list].sort((a, b) => {
      const av = vendorType(a) === 'fixed' ? 0 : 1
      const bv = vendorType(b) === 'fixed' ? 0 : 1
      return av - bv || vName(a, lang).localeCompare(vName(b, lang))
    })
  }, [searched, typeFilter, lang])

  const counts = useMemo(() => ({
    all: searched.length,
    fixed: searched.filter((r) => vendorType(r) === 'fixed').length,
    new: searched.filter((r) => vendorType(r) === 'new').length,
  }), [searched])

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: t.all, n: counts.all },
          { key: 'fixed', label: t.vendorFixed, n: counts.fixed },
          { key: 'new', label: t.vendorNew, n: counts.new },
        ].map((f) => {
          const on = typeFilter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              aria-pressed={on}
              style={{
                padding: '8px 15px', borderRadius: 999, fontSize: 13.5, fontWeight: 700,
                background: on ? C.maroon : C.card,
                color: on ? '#fff' : C.tl,
                border: `1px solid ${on ? C.maroon : C.border}`,
                cursor: 'pointer',
              }}
            >
              {f.label} ({f.n})
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? <EmptyState icon={null} title={t.noData} /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {visible.map((v) => (
            <Card
              key={v.id}
              onClick={() => setEditing(v)}
              style={{
                cursor: 'pointer',
                // the accent bar below is positioned against this, and clipped
                // by the card's own 14px radius so it ends square, not curved
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {vendorType(v) === 'fixed' && (
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: C.maroon }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vName(v, lang)}</div>
                  <div style={{ fontSize: 13, color: C.tl, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vCategory(v, lang)}{v.company ? ` · ${v.company}` : ''}</div>
                  <div style={{ fontSize: 13, color: C.tl, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.phone}</div>
                </div>
                {/* The badge rides with the buttons rather than the name: it is
                    one right-hand group, centred as a unit, so the badge sits on
                    the buttons' line and on the same x on every card. */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <TypeBadge C={C} t={t} type={vendorType(v)} />
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

// The trades a vendor can be filed under. English is what goes in `category`,
// Hindi in `category_hi` — written down rather than machine-translated, because
// a translator turns a trade into a description ("Mistri work" -> "mason's job")
// and these are labels people scan, not sentences they read.
//
// The first four were asked for; the rest are what the existing vendors already
// use, kept so nothing already filed has to be re-filed.
const VENDOR_TRADES = [
  { en: 'Electrician',            hi: 'बिजली मिस्त्री' },
  { en: 'Mistri work',            hi: 'मिस्त्री का काम' },
  { en: 'Painter',                hi: 'पेंटर' },
  { en: 'Carpenter',              hi: 'बढ़ई' },
  { en: 'Plumber',                hi: 'प्लंबर' },
  { en: 'AC/HVAC',                hi: 'एसी / कूलिंग' },
  { en: 'Welder / Fabrication',   hi: 'वेल्डर / फैब्रिकेशन' },
  { en: 'Glass & Aluminium Work', hi: 'शीशा और एल्युमिनियम' },
]
const OTHER = '__other'

// Same shape as personName/propName/deptName in constants/org: prefer the _hi
// column, fall back to English so a vendor added before this existed still reads.
const vName = (v, lang) => (lang === 'hi' && v?.name_hi ? v.name_hi : (v?.name || ''))
const vCategory = (v, lang) => (lang === 'hi' && v?.category_hi ? v.category_hi : (v?.category || ''))

const iconLink = (C, bg) => ({ width: 38, height: 38, borderRadius: 10, background: bg, display: 'grid', placeItems: 'center' })

// Rows written before the column existed read as 'new' from the DB default, but
// the migration backfills them to 'fixed'. This guard is for the gap between
// deploying the app and running the SQL — without it every vendor silently
// becomes "New" for however long that takes.
const vendorType = (v) => (v?.vendor_type === 'fixed' ? 'fixed' : 'new')

// Filled versus outlined, not two colours: "which one do I call" has to survive
// a colour-blind eye and a phone in sunlight.
function TypeBadge({ C, t, type }) {
  const fixed = type === 'fixed'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 9px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 800, letterSpacing: '0.03em',
        background: fixed ? C.maroon : 'transparent',
        color: fixed ? '#fff' : C.tl,
        border: `1px solid ${fixed ? C.maroon : C.borderStrong}`,
      }}
    >
      {fixed && <Icon name="check" size={12} color="#fff" />}
      {fixed ? t.vendorFixed : t.vendorNew}
    </span>
  )
}

function VendorModal({ user, record, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const confirm = useConfirm()
  const { lang } = useLang()
  const editing = !!record
  const [form, setForm] = useState({
    name: record?.name || '',
    name_hi: record?.name_hi || '',
    category_hi: record?.category_hi || '',
    company: record?.company || '',
    phone: record?.phone || '',
    category: record?.category || '',
    notes: record?.notes || '',
    vendorType: record ? vendorType(record) : 'new',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // an existing vendor filed under something not on the list keeps its text and
  // lands on "Other" rather than being silently blanked
  const listedTrade = VENDOR_TRADES.some((tr) => tr.en === form.category)

  async function save() {
    if (!form.name.trim()) { setErr(`${t.fullName} ${t.isRequired}`); return }
    if (!form.phone.trim()) { setErr(`${t.phone} ${t.isRequired}`); return }
    if (!form.category.trim()) { setErr(`${t.category} ${t.isRequired}`); return }
    setBusy(true); setErr('')
    const payload = {
      name: form.name.trim(), company: form.company || null, phone: form.phone.trim(),
      category: form.category.trim(), notes: form.notes || null,
      name_hi: form.name_hi.trim() || null,
      category_hi: form.category_hi.trim() || null,
      vendor_type: form.vendorType,
    }
    const { error } = editing
      ? await supabase.from('vendors').update(payload).eq('id', record.id)
      : await supabase.from('vendors').insert({ ...payload, created_by: user.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  async function remove() {
    if (!(await confirm({ message: t.deleteVendorConfirm, detail: vName(record, lang), confirmLabel: t.remove }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('vendors').update({ is_active: false }).eq('id', record.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={editing ? `${t.edit} — ${vName(record, lang)}` : t.vendors}
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
      {/* transliterate, don't translate: a translator reads "Ram Narayan the
          Mali" as a gardener. Spelling it out keeps the name and makes it
          readable to staff who don't read Latin script. */}
      <HindiInput
        transliterate
        label={t.vendorNameHi}
        hint={t.vendorNameHiHint}
        source={form.name}
        value={form.name_hi}
        onChange={(v) => setForm((f) => ({ ...f, name_hi: v }))}
      />
      <Field label={t.phone}><input style={inputStyle(C)} value={form.phone} type="tel" inputMode="numeric" maxLength={10} placeholder={t.phonePlaceholder} onChange={(e) => setForm((f) => ({ ...f, phone: typedPhone(e.target.value) }))} /></Field>
      <Field label={t.category} required>
        <select
          style={inputStyle(C)}
          value={listedTrade ? form.category : (form.category ? OTHER : '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === OTHER) { setForm((f) => ({ ...f, category: '', category_hi: '' })); return }
            const tr = VENDOR_TRADES.find((x) => x.en === v)
            // both columns come from the list, so the Hindi is never a guess
            setForm((f) => ({ ...f, category: tr ? tr.en : '', category_hi: tr ? tr.hi : '' }))
          }}
        >
          <option value="">— {t.category} —</option>
          {VENDOR_TRADES.map((tr) => (
            <option key={tr.en} value={tr.en}>{lang === 'hi' ? tr.hi : tr.en}</option>
          ))}
          <option value={OTHER}>{t.other}</option>
        </select>
      </Field>

      {/* The list will always be missing something, and a vendor you cannot file
          is a vendor you cannot add. Free text stays available, and only then is
          the Hindi worth translating. */}
      {!listedTrade && (
        <>
          <Field label={`${t.category} — ${t.other}`}>
            <input
              style={inputStyle(C)}
              value={form.category}
              onChange={set('category')}
              placeholder="e.g. Florist, Pest control"
            />
          </Field>
          <HindiInput
            label={t.vendorCategoryHi}
            source={form.category}
            value={form.category_hi}
            onChange={(v) => setForm((f) => ({ ...f, category_hi: v }))}
          />
        </>
      )}
      <Field label={t.vendorType}>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { key: 'fixed', label: t.vendorFixed, hint: t.vendorFixedHint },
            { key: 'new', label: t.vendorNew, hint: t.vendorNewHint },
          ].map((opt) => {
            const on = form.vendorType === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, vendorType: opt.key }))}
                aria-pressed={on}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                  padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                  background: on ? C.maroonSoft : C.card,
                  border: `1.5px solid ${on ? C.maroon : C.border}`,
                }}
              >
                <span
                  style={{
                    width: 17, height: 17, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    border: `2px solid ${on ? C.maroon : C.borderStrong}`,
                    background: on ? C.maroon : 'transparent',
                    display: 'grid', placeItems: 'center',
                  }}
                >
                  {on && <Icon name="check" size={11} color="#fff" />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: on ? C.maroon : C.text }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.tl, marginTop: 1 }}>{opt.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Field>
      <Field label={`${t.company} (${t.optional})`}><input style={inputStyle(C)} value={form.company} onChange={set('company')} /></Field>
      <Field label={`${t.notes} (${t.optional})`}>
        <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.notes} onChange={set('notes')} />
      </Field>
      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}
