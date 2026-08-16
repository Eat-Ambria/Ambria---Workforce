import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { todayISO } from '../../../lib/time'
import { useColors } from '../../../context/ThemeContext'
import { useT, useLang } from '../../../context/LangContext'
import { useAuth } from '../../../context/AuthContext'
import { propName, PROPERTIES, scopedProperty } from '../../../constants/org'
import { typedPhone, isValidPhone } from '../../../lib/phone'
import { transliterateToHindi } from '../../../lib/translate'
import { Loader, EmptyState, Button } from '../../../components/common/UI'
import Icon from '../../../components/common/Icon'
import { useConfirm } from '../../../components/common/ConfirmDialog'
import { useMediaQuery } from '../../../hooks/useMediaQuery'

// The wifi connection at each venue: who runs it, who to ring, and when it is
// next due.
//
// Written as a sheet rather than a list of cards with a dialog behind each,
// because that is what it is — five short columns and a handful of rows, all of
// which an admin wants to read at once and correct in place. The roster works
// the same way and for the same reason: opening a modal to change a phone
// number is three clicks to type six characters.

const DAY = 86400000
const daysUntil = (d) => Math.ceil((new Date(d) - new Date(todayISO())) / DAY)

// A date turns amber before it turns red. A bill that lapsed yesterday is
// already somebody's problem; the point of the register is to catch it the week
// before, so "6 days left" gets its own colour rather than sharing "fine".
function dueStatus(due, hi) {
  if (!due) return { color: 'faint', label: hi ? '—' : '—' }
  const d = daysUntil(due)
  if (d < 0) return { color: 'red', label: hi ? `${Math.abs(d)} दिन ऊपर` : `${Math.abs(d)}d over` }
  if (d === 0) return { color: 'red', label: hi ? 'आज' : 'today' }
  if (d <= 7) return { color: 'yellow', label: hi ? `${d} दिन` : `${d}d left` }
  return { color: 'green', label: hi ? 'ठीक' : 'ok' }
}

const thCell = {
  padding: '11px 12px', fontSize: 10.5, fontWeight: 700, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left',
}
const tdCell = { padding: '9px 12px', minWidth: 0 }
const cellInput = (C) => ({
  width: '100%', background: C.white, color: C.text,
  border: `1px solid ${C.border}`, borderRadius: 7,
  padding: '6px 8px', fontSize: 12.5, outline: 'none',
})

// id for a row that exists only on screen. Prefixed so the save can tell a new
// row from a saved one without a second flag to keep in step.
let seq = 0
const newKey = () => `new:${++seq}`

export default function WifiServices() {
  const confirm = useConfirm()
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const hi = lang === 'hi'
  const { user } = useAuth()
  // null for the super admin and the all-venue admins; everyone else is pinned
  const propScope = scopedProperty(user)
  // the sheet needs its width; below that it scrolls sideways rather than
  // crushing a phone number into two characters
  const wide = useMediaQuery('(min-width: 860px)')

  const [rows, setRows] = useState([])       // what is on screen, edits included
  const [saved, setSaved] = useState([])     // what the table last said
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(false)
  const [copied, setCopied] = useState('')   // which password was just copied

  const load = useCallback(async () => {
    let q = supabase.from('wifi_services').select('*')
      // soonest first, and connections with no date at the end rather than the
      // top, where a blank would outrank a bill due tomorrow
      .order('due_date', { ascending: true, nullsFirst: false })
    if (propScope) q = q.eq('property', propScope)
    const { data, error } = await q
    if (error) setErr(error.message)
    const list = (data || []).map((r) => ({ ...r, key: String(r.id) }))
    setRows(list)
    setSaved(list)
    setLoading(false)
  }, [propScope])

  useEffect(() => { load() }, [load])

  // The venues this admin may file against. A single-venue admin gets one, and
  // a new row fills it in rather than asking.
  const venues = useMemo(
    () => (propScope ? PROPERTIES.filter((p) => p.code === propScope) : PROPERTIES),
    [propScope]
  )

  const set = (key, patch) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // Which Hindi cells the machine is allowed to write. A cell starts out its own
  // once it has been typed in, and stays that way — `tenda` transliterates to
  // ठंडा ("cold"), and re-imposing that every time somebody fixed it would make
  // the column worse than empty. Keyed "<row>|<field>".
  const machineOwns = useRef(new Set())
  const claim = (key, field) => machineOwns.current.delete(`${key}|${field}`)

  // Fill the Hindi from the English once typing stops. One network call per
  // name, so it waits rather than firing per keystroke.
  const PAIRS = [['wifi_name', 'wifi_name_hi'], ['operator_name', 'operator_name_hi']]
  const sourceSig = rows.map((r) => `${r.key}:${r.wifi_name || ''}:${r.operator_name || ''}`).join('|')
  useEffect(() => {
    const id = setTimeout(async () => {
      const jobs = []
      rows.forEach((r) => {
        PAIRS.forEach(([src, dst]) => {
          const from = (r[src] || '').trim()
          const to = (r[dst] || '').trim()
          const owned = machineOwns.current.has(`${r.key}|${dst}`)
          // blank, or ours to replace because the English behind it changed
          if (from && (!to || owned)) jobs.push({ key: r.key, src, dst, from })
        })
      })
      if (!jobs.length) return
      for (const j of jobs) {
        let out = null
        try { out = await transliterateToHindi(j.from) } catch { /* leave it blank */ }
        if (!out) continue
        machineOwns.current.add(`${j.key}|${j.dst}`)
        setRows((list) => list.map((r) => (r.key === j.key ? { ...r, [j.dst]: out } : r)))
      }
    }, 700)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSig])

  const addRow = () => setRows((list) => [...list, {
    key: newKey(),
    property: propScope || venues[0]?.code || '',
    wifi_name: '', wifi_name_hi: '', password: '',
    operator_name: '', operator_name_hi: '', contact: '', due_date: '', notes: '',
  }])

  // What the save has to write. A new row counts only once it has a name — an
  // empty row somebody added and thought better of is not a change.
  const dirty = useMemo(() => {
    const before = new Map(saved.map((r) => [r.key, r]))
    const changed = rows.filter((r) => {
      if (r.key.startsWith('new:')) return !!(r.wifi_name.trim() || r.wifi_name_hi?.trim())
      const b = before.get(r.key)
      if (!b) return false
      return ['property', 'wifi_name', 'wifi_name_hi', 'password',
        'operator_name', 'operator_name_hi', 'contact', 'due_date', 'notes']
        .some((f) => (r[f] || '') !== (b[f] || ''))
    })
    return changed
  }, [rows, saved])

  // A bad number is worth stopping for: it is the one field here whose only
  // purpose is to be dialled, and a wrong one is worse than a blank.
  const phoneErrors = useMemo(() => {
    const out = {}
    rows.forEach((r) => {
      // typedPhone already keeps the box to ten digits, so the only way to be
      // invalid here is to be short — a half-typed number somebody moved on from.
      if (r.contact && !isValidPhone(r.contact)) {
        out[r.key] = hi ? '10 अंक चाहिए' : 'Needs 10 digits'
      }
    })
    return out
  }, [rows, hi])

  // A last resort only. The effect above fills these as you type; this catches
  // the row saved before it finished, or one whose transliteration failed.
  async function otherScript(text, existing) {
    if (existing?.trim()) return existing.trim()
    const q = (text || '').trim()
    if (!q) return null
    try { return (await transliterateToHindi(q)) || null } catch { return null }
  }

  async function saveAll() {
    if (!dirty.length) return
    const bad = dirty.find((r) => phoneErrors[r.key])
    if (bad) {
      setErr(hi ? 'फ़ोन नंबर ठीक करें' : 'Fix the phone number first')
      return
    }
    setBusy(true); setErr('')
    try {
      for (const r of dirty) {
        const patch = {
          property: r.property,
          wifi_name: r.wifi_name.trim(),
          wifi_name_hi: await otherScript(r.wifi_name, r.wifi_name_hi),
          // not trimmed to nothing: a password may legitimately start or end
          // with a space, and silently eating one makes it simply wrong
          password: r.password || null,
          operator_name: r.operator_name?.trim() || null,
          operator_name_hi: await otherScript(r.operator_name, r.operator_name_hi),
          contact: r.contact?.trim() || null,
          due_date: r.due_date || null,
          notes: r.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        }
        const { error } = r.key.startsWith('new:')
          ? await supabase.from('wifi_services').insert(patch)
          : await supabase.from('wifi_services').update(patch).eq('id', r.id)
        if (error) throw error
      }
      await load()
      setToast(true)
      setTimeout(() => setToast(false), 2200)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(r) {
    // A row that was never saved just goes; only a real one is worth asking about
    if (r.key.startsWith('new:')) {
      setRows((list) => list.filter((x) => x.key !== r.key))
      return
    }
    const ok = await confirm({
      message: hi
        ? `"${r.wifi_name_hi || r.wifi_name}" हटाएँ?`
        : `Remove "${r.wifi_name}"?`,
      detail: propName(r.property, lang),
      confirmLabel: t.delete,
    })
    if (!ok) return
    const { error } = await supabase.from('wifi_services').delete().eq('id', r.id)
    if (error) { setErr(error.message); return }
    load()
  }

  async function copyPassword(r) {
    if (!r.password) return
    try {
      await navigator.clipboard.writeText(r.password)
      setCopied(r.key)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      // clipboard is refused on an insecure origin and in some in-app browsers;
      // the password is on screen either way, so there is nothing to recover
    }
  }

  if (loading) return <Loader label={t.loading} />

  // name | property | operator | contact | due | status | bin
  //
  // 156px on the property, measured: "Pushpanjali" is the longest venue and a
  // <select> spends about 26px of its own width on the arrow. At 120px every
  // name was clipped.
  const COLS = wide
    ? 'minmax(140px, 1.2fr) 156px minmax(130px, 1fr) minmax(130px, 1fr) minmax(140px, 1fr) 146px 84px 40px'
    : '170px 156px 160px 150px 160px 146px 84px 40px'
  const gridMin = wide ? 0 : 1086

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5, flex: '1 1 260px' }}>
          {hi
            ? 'हर प्रॉपर्टी का वाई-फ़ाई — सीधे यहीं बदलें, फिर सहेजें।'
            : 'The wifi at each property — edit in place, then save.'}
        </span>
        <Button variant="ghost" onClick={addRow} style={{ flexShrink: 0 }}>
          <Icon name="plus" size={14} color={C.maroon} style={{ marginRight: 5 }} />
          {hi ? 'वाई-फ़ाई जोड़ें' : 'Add wifi'}
        </Button>
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}

      {rows.length === 0 ? (
        <EmptyState
          icon="globe"
          title={hi ? 'अभी कोई वाई-फ़ाई दर्ज नहीं' : 'No wifi connections yet'}
          hint={hi ? '“वाई-फ़ाई जोड़ें” से पहला जोड़ें।' : 'Use “Add wifi” to enter the first one.'}
        />
      ) : (
        <div style={{
          border: `1px solid ${C.borderStrong}`, borderRadius: 10,
          // sideways only when the columns genuinely do not fit — `auto` on a box
          // that always fits makes it a scrollport on both axes for nothing
          overflowX: wide ? 'visible' : 'auto',
        }}>
          <div style={{ minWidth: gridMin || undefined }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS,
                          background: C.cardAlt, borderBottom: `1px solid ${C.borderStrong}` }}>
              <span style={thCell}>{hi ? 'वाई-फ़ाई' : 'WiFi name'}</span>
              <span style={thCell}>{hi ? 'पासवर्ड' : 'Password'}</span>
              <span style={thCell}>{t.properties}</span>
              <span style={thCell}>{hi ? 'ऑपरेटर' : 'Operator'}</span>
              <span style={thCell}>{hi ? 'संपर्क' : 'Contact'}</span>
              <span style={thCell}>{hi ? 'देय तारीख़' : 'Due date'}</span>
              <span style={thCell}>{hi ? 'हालत' : 'Status'}</span>
              <span style={thCell} />
            </div>

            {rows.map((r, i) => {
              const st = dueStatus(r.due_date, hi)
              const isNew = r.key.startsWith('new:')
              return (
                <div
                  key={r.key}
                  style={{
                    display: 'grid', gridTemplateColumns: COLS, alignItems: 'center',
                    borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.border}`,
                    // an unsaved line is tinted, so it is obvious what Save will write
                    background: isNew ? C.maroonSoft : 'transparent',
                  }}
                >
                  {/* In Hindi the cell edits the Hindi name, with the English
                      as the placeholder so the row is still recognisable before
                      a Hindi spelling exists. Saving fills the blank one. */}
                  <span style={tdCell}>
                    <input
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={(hi ? r.wifi_name_hi : r.wifi_name) || ''}
                      placeholder={hi ? (r.wifi_name || 'नाम') : 'Name'}
                      onChange={(e) => {
                        if (hi) claim(r.key, 'wifi_name_hi')
                        set(r.key, hi
                          ? { wifi_name_hi: e.target.value }
                          : { wifi_name: e.target.value })
                      }}
                    />
                  </span>
                  {/* Shown, not hidden. A wifi key is written to be given away,
                      and a reveal button would add a tap to the commonest thing
                      done here while protecting nothing — the row is readable by
                      anyone who can open the tab. Copy is the useful action. */}
                  <span style={{ ...tdCell, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={r.password || ''}
                      placeholder={hi ? 'पासवर्ड' : 'Password'}
                      onChange={(e) => set(r.key, { password: e.target.value })}
                    />
                    {r.password && (
                      <button
                        type="button"
                        onClick={() => copyPassword(r)}
                        title={hi ? 'कॉपी करें' : 'Copy'}
                        aria-label={hi ? 'कॉपी करें' : 'Copy'}
                        style={{ background: 'transparent', padding: 3, lineHeight: 0, flexShrink: 0 }}
                      >
                        <Icon name={copied === r.key ? 'check' : 'copy'} size={14}
                              color={copied === r.key ? C.green : C.tl} />
                      </button>
                    )}
                  </span>
                  <span style={tdCell}>
                    <select
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={r.property}
                      onChange={(e) => set(r.key, { property: e.target.value })}
                    >
                      {venues.map((p) => (
                        <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>
                      ))}
                    </select>
                  </span>
                  <span style={tdCell}>
                    <input
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={(hi ? r.operator_name_hi : r.operator_name) || ''}
                      placeholder={hi ? (r.operator_name || 'जैसे एयरटेल') : 'e.g. Airtel'}
                      onChange={(e) => {
                        if (hi) claim(r.key, 'operator_name_hi')
                        set(r.key, hi
                          ? { operator_name_hi: e.target.value }
                          : { operator_name: e.target.value })
                      }}
                    />
                  </span>
                  <span style={tdCell}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        className="sheet-cell"
                        inputMode="tel"
                        style={{
                          ...cellInput(C),
                          borderColor: phoneErrors[r.key] ? C.red : C.border,
                        }}
                        value={r.contact || ''}
                        placeholder="9876543210"
                        maxLength={10}
                        // capped and cleaned as it is typed: letters dropped, and a
                        // pasted "+91 98765 43210" becomes the ten-digit number
                        // rather than being cut off into a different one
                        onChange={(e) => set(r.key, { contact: typedPhone(e.target.value) })}
                      />
                      {/* Only for a complete number. A tel: link to half of one
                          places a wrong call, which is worse than no button. */}
                      {isValidPhone(r.contact) && (
                        <a
                          href={`tel:${r.contact}`}
                          title={hi ? 'कॉल करें' : 'Call'}
                          aria-label={hi ? 'कॉल करें' : 'Call'}
                          style={{ padding: 3, lineHeight: 0, flexShrink: 0 }}
                        >
                          <Icon name="phone" size={14} color={C.maroon} />
                        </a>
                      )}
                    </span>
                    {phoneErrors[r.key] && (
                      <span style={{ display: 'block', fontSize: 10.5, color: C.red, marginTop: 3 }}>
                        {phoneErrors[r.key]}
                      </span>
                    )}
                  </span>
                  <span style={tdCell}>
                    <input
                      type="date"
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={r.due_date || ''}
                      onChange={(e) => set(r.key, { due_date: e.target.value })}
                    />
                  </span>
                  <span style={{ ...tdCell, fontSize: 11.5, fontWeight: 700, color: C[st.color] || C.faint }}>
                    {st.label}
                  </span>
                  <span style={{ ...tdCell, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      title={t.delete}
                      aria-label={t.delete}
                      style={{ background: 'transparent', padding: 3, lineHeight: 0 }}
                    >
                      <Icon name="trash" size={15} color={C.red} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(dirty.length > 0 || toast) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
          {dirty.length > 0 && (
            <>
              <Button variant="ghost" onClick={() => setRows(saved)} disabled={busy}>
                {hi ? 'बदलाव छोड़ें' : 'Discard changes'}
              </Button>
              <Button variant="primary" onClick={saveAll} disabled={busy}>
                {t.save} ({dirty.length})
              </Button>
            </>
          )}
          {toast && (
            <span style={{ fontSize: 13, fontWeight: 700, color: C.green,
                           display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={15} color={C.green} /> {hi ? 'सहेज दिया' : 'Saved'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
