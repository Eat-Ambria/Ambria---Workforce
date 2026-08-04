import { useEffect, useRef, useState } from 'react'
import { inputStyle } from './UI'
import { useT } from '../../context/LangContext'
import Icon from './Icon'

// Dropdown with a checkbox checklist — pick several values to filter by.
// options: [{ value, label, sub? }]; selected: array of values.
// Pass the theme colors as `C`. Set `searchable` to show a search box.
export default function MultiSelect({ C, placeholder, options, selected, onChange, searchable = false }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  // close when clicking outside
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const sel = new Set(selected)
  const needle = q.trim().toLowerCase()
  const list = searchable && needle
    ? options.filter((o) => (o.label || '').toLowerCase().includes(needle) || (o.sub || '').toLowerCase().includes(needle))
    : options

  const toggle = (value) => {
    const next = new Set(sel)
    if (next.has(value)) next.delete(value); else next.add(value)
    onChange([...next])
  }

  // Name what is chosen. "2 selected" tells you the one thing you already knew —
  // you picked them. Past three names it would not fit, so the rest become "+N"
  // and the full list goes in the tooltip.
  const names = options.filter((o) => sel.has(o.value)).map((o) => o.label)
  const label = names.length === 0 ? placeholder
    : names.length === options.length && options.length > 1 ? `${t.all} (${names.length})`
    : names.length <= 3 ? names.join(', ')
    : `${names.slice(0, 2).join(', ')} +${names.length - 2}`

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 150 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={names.join(', ') || placeholder}
        style={{ ...inputStyle(C), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ color: selected.length ? C.text : C.tl, fontWeight: selected.length ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <Icon name="chevronRight" size={16} color={C.tl} style={{ transform: 'rotate(90deg)', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadowLg || C.shadow, padding: 8, maxHeight: 320, overflowY: 'auto' }}>
          {searchable && (
            <input autoFocus placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle(C), marginBottom: 8 }} />
          )}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 600, padding: '2px 6px 8px' }}>
              {t.clearFilters} ({selected.length})
            </button>
          )}
          {list.length === 0 ? (
            <div style={{ fontSize: 13, color: C.faint, padding: '8px 10px' }}>{t.noMatch}</div>
          ) : (
            list.map((o) => {
              const on = sel.has(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: on ? C.maroonSoft : 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? C.maroon : C.border}`, background: on ? C.maroon : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {on && <Icon name="check" size={12} color="#fff" />}
                  </span>
                  <span style={{ fontSize: 14, color: C.text }}>{o.label}{o.sub ? <span style={{ color: C.faint, fontSize: 12 }}> {o.sub}</span> : null}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
