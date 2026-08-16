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
// How far off the renewal is. These read as full phrases because they sit under
// the date now rather than in an 84px column of their own — "5 days overdue"
// against "On track" is legible at a glance where "5d over" against "ok" was a
// puzzle to be worked out.
function dueStatus(due, hi) {
  if (!due) return { color: 'faint', label: '—' }
  const d = daysUntil(due)
  if (d < 0) {
    const n = Math.abs(d)
    return { color: 'red', label: hi ? `${n} दिन देरी` : `${n} day${n === 1 ? '' : 's'} overdue` }
  }
  if (d === 0) return { color: 'red', label: hi ? 'आज देय' : 'Due today' }
  if (d <= 7) return { color: 'yellow', label: hi ? `${d} दिन में` : `In ${d} day${d === 1 ? '' : 's'}` }
  return { color: 'green', label: hi ? 'ठीक है' : 'On track' }
}

const thCell = {
  padding: '11px 10px', fontSize: 10.5, fontWeight: 700, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left',
}
const tdCell = { padding: '9px 10px', minWidth: 0 }
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
      // ...then id, which is the part that was missing. Most rows have no due
      // date, so most rows tied — and a tie leaves the order to the database,
      // which returns an updated row wherever it now sits on disk. Saving a row
      // made it jump down the list. With a tiebreaker every row has one place.
      .order('id', { ascending: true })
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
    wifi_name: '', wifi_name_hi: '', password: '', location: '',
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
      return ['property', 'location', 'wifi_name', 'wifi_name_hi', 'password',
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

  // A dropped request, not a refused one: no status, no body, just a fetch that
  // did not finish. Worth one more try; anything the server actually rejected
  // will fail again the same way and is not retried.
  const isDropped = (e) => /failed to fetch|networkerror|load failed|network request failed/i
    .test(e?.message || String(e || ''))

  async function saveAll() {
    if (!dirty.length) return
    const bad = dirty.find((r) => phoneErrors[r.key])
    if (bad) {
      setErr(hi ? 'फ़ोन नंबर ठीक करें' : 'Fix the phone number first')
      return
    }
    setBusy(true); setErr('')
    // Rows go one at a time, so a failure part way through leaves the earlier
    // ones written. Which ones is the difference between "try again" and "try
    // again and hope it is not saved twice".
    let done = 0
    try {
      for (const r of dirty) {
        const patch = {
          property: r.property,
          wifi_name: r.wifi_name.trim(),
          wifi_name_hi: await otherScript(r.wifi_name, r.wifi_name_hi),
          // not trimmed to nothing: a password may legitimately start or end
          // with a space, and silently eating one makes it simply wrong
          password: r.password || null,
          location: r.location?.trim() || null,
          operator_name: r.operator_name?.trim() || null,
          operator_name_hi: await otherScript(r.operator_name, r.operator_name_hi),
          contact: r.contact?.trim() || null,
          due_date: r.due_date || null,
          notes: r.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        }
        const write = () => (r.key.startsWith('new:')
          ? supabase.from('wifi_services').insert(patch)
          : supabase.from('wifi_services').update(patch).eq('id', r.id))

        let { error } = await write()
        if (error && isDropped(error)) {
          // Long enough for a wifi handover or a sleeping radio to come back,
          // short enough that nobody reaches for the button again.
          await new Promise((ok) => setTimeout(ok, 900))
          ;({ error } = await write())
        }
        if (error) throw error
        done += 1
      }
      await load()
      setToast(true)
      setTimeout(() => setToast(false), 2200)
    } catch (e) {
      setErr(isDropped(e)
        ? (hi
          ? `नेटवर्क नहीं मिला। ${dirty.length} में से ${done} पंक्तियाँ सहेजी गईं — बाकी नीचे वैसी ही हैं, दोबारा सहेजें।`
          : `No network. Saved ${done} of ${dirty.length} rows — the rest are still below, just save again.`)
        : (e.message || String(e)))
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

  // name | password | property | location | operator | contact | due+status | remarks | bin
  //
  // 156px on the property, measured: "Pushpanjali" is the longest venue and a
  // <select> spends about 26px of its own width on the arrow. At 120px every
  // name was clipped.
  //
  // Location shares the stretch with name and operator rather than taking a
  // fixed width — "MD office" and "1st floor pantry, behind the door" both
  // belong in it, and only the wide layout has room to be generous.
  const COLS = wide
    // Floors, summed: 175+175+156+130+120+135+152+140+40 = 1223, against 1528px
    // of content now that Training is a wide route. Sized to the values rather
    // than to a budget: "MD office Skynet" and "Ambria@0044" set the first two,
    // and password matches the name for shorter text because its copy button
    // comes out of the same track.
    ? 'minmax(175px, 1.2fr) minmax(175px, 1fr) 156px minmax(130px, 1.1fr) minmax(120px, 1fr) minmax(135px, 1fr) 152px minmax(140px, 1.2fr) 40px'
    : '200px 190px 156px 170px 160px 155px 152px 185px 40px'
  // 200+190+156+170+160+155+152+185+40
  const gridMin = wide ? 0 : 1408

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
          // `auto` at every width, not just narrow. It used to be `visible` on
          // wide screens on the bet that the columns always fit there — then a
          // column was added, the bet quietly lost, and the last two columns were
          // painted outside the border rather than scrolled to. A box that cannot
          // hold its contents should scroll, not leak.
          overflowX: 'auto',
        }}>
          <div style={{ minWidth: gridMin || undefined }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS,
                          background: C.cardAlt, borderBottom: `1px solid ${C.borderStrong}` }}>
              <span style={thCell}>{hi ? 'वाई-फ़ाई' : 'WiFi name'}</span>
              <span style={thCell}>{hi ? 'पासवर्ड' : 'Password'}</span>
              <span style={thCell}>{t.properties}</span>
              <span style={thCell}>{hi ? 'सटीक जगह' : 'Location'}</span>
              <span style={thCell}>{hi ? 'ऑपरेटर' : 'Operator'}</span>
              <span style={thCell}>{hi ? 'संपर्क' : 'Contact'}</span>
              <span style={thCell}>{hi ? 'देय तारीख़' : 'Due date'}</span>
              <span style={thCell}>{hi ? 'टिप्पणी' : 'Remarks'}</span>
              <span style={thCell} />
            </div>

            {rows.map((r, i) => {
              const st = dueStatus(r.due_date, hi)
              const isNew = r.key.startsWith('new:')
              return (
                <div
                  key={r.key}
                  style={{
                    // start, not center: the date cell is taller than the rest
                    // whenever it carries a status pill, and centring lifted its
                    // input above every other input in the row
                    display: 'grid', gridTemplateColumns: COLS, alignItems: 'start',
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
                  {/* Not transliterated, unlike the name and the operator: this
                      is a direction to a place, and a machine-written Hindi
                      spelling of "MD office" helps nobody find the router. Type
                      it in whichever script the person reading it will use. */}
                  <span style={tdCell}>
                    <input
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={r.location || ''}
                      placeholder={hi ? 'जैसे एमडी ऑफ़िस, रिसेप्शन के पीछे' : 'e.g. MD office, behind reception'}
                      onChange={(e) => set(r.key, { location: e.target.value })}
                    />
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
                  {/* Status lives here, not in a column of its own. It is
                      computed from this date and from nothing else, so as a
                      separate column it was the same fact written twice — and
                      "—" on every row without a date. */}
                  <span style={tdCell}>
                    <input
                      type="date"
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={r.due_date || ''}
                      onChange={(e) => set(r.key, { due_date: e.target.value })}
                    />
                    {r.due_date && (
                      <span style={{ display: 'flex', justifyContent: 'center', marginTop: 5 }}>
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em',
                          color: C[st.color] || C.faint,
                          background: `${C[st.color] || C.faint}18`,
                          borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
                        }}>
                          {st.label}
                        </span>
                      </span>
                    )}
                  </span>
                  {/* Whatever the row does not have a column for. Not
                      transliterated — a remark is a sentence somebody wrote, and
                      a machine rewriting it in the other script would change
                      what it says. */}
                  <span style={tdCell}>
                    <input
                      className="sheet-cell"
                      style={cellInput(C)}
                      value={r.notes || ''}
                      placeholder={hi ? 'जैसे बिल मार्च तक भरा' : 'e.g. bill paid till Mar'}
                      onChange={(e) => set(r.key, { notes: e.target.value })}
                    />
                  </span>
                  <span style={{
                    ...tdCell,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    minHeight: 33 + 18,   // a field, plus tdCell's 9px top and bottom
                  }}>
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
