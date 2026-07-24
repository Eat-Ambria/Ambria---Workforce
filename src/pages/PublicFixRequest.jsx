import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/time'
import { useColors } from '../context/ThemeContext'
import { useLang } from '../context/LangContext'
import { PROPERTIES, PROPERTY_MAP } from '../constants/org'
import { Spinner, inputStyle, Badge, ProgressBar, EmptyState, Loader, Tabs } from '../components/common/UI'
import PhotoCapture from '../components/common/PhotoCapture'
import Icon from '../components/common/Icon'

// PUBLIC, no-login portal (/fix-request). Anyone with the link can:
//   - SEE all repair requests and their live status / progress
//   - ADD a new repair request (name + phone required)
// Submissions land in `work_board` as an `open` request so an admin can assign
// them. Renders outside AppLayout and never touches AuthContext.

const MINE_KEY = 'ambria_public_fix_ids' // ids submitted from THIS device

// status -> progress % + colour + labels (mirrors the internal Task Board flow)
const STATUS = {
  open:               { pct: 20,  tone: 'blue',   bg: 'bBg', en: 'Open',              hi: 'खुला' },
  assigned:           { pct: 45,  tone: 'indigo', bg: 'bBg', en: 'Assigned',          hi: 'सौंपा गया' },
  in_progress:        { pct: 65,  tone: 'yellow', bg: 'yBg', en: 'In Progress',       hi: 'चल रहा है' },
  approval_requested: { pct: 85,  tone: 'yellow', bg: 'yBg', en: 'Awaiting Approval', hi: 'मंज़ूरी बाकी' },
  completed:          { pct: 100, tone: 'green',  bg: 'gBg', en: 'Completed',          hi: 'पूरा हुआ' },
  approved:           { pct: 100, tone: 'green',  bg: 'gBg', en: 'Completed',          hi: 'पूरा हुआ' },
}
const stat = (s) => STATUS[s] || STATUS.open

function readMine() {
  try { return new Set(JSON.parse(localStorage.getItem(MINE_KEY) || '[]')) } catch { return new Set() }
}
function addMine(id) {
  try {
    const s = readMine(); s.add(id)
    localStorage.setItem(MINE_KEY, JSON.stringify([...s]))
  } catch { /* ignore private-mode storage errors */ }
}

export default function PublicFixRequest() {
  const C = useColors()
  const { lang, toggle: toggleLang } = useLang()
  const hi = lang === 'hi'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')   // 'list' | 'form'
  const [tab, setTab] = useState('open')     // 'open' | 'assigned' | 'completed'
  const [mine, setMine] = useState(() => readMine())

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('work_board')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setRows(data || [])
    setLoading(false)
  }, [])

  // load on mount, refresh every 20s + on focus so progress stays live
  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  const counts = useMemo(() => {
    const done = rows.filter((r) => ['completed', 'approved'].includes(r.status)).length
    return { total: rows.length, ongoing: rows.length - done, done }
  }, [rows])

  // sections by status. Open shows ONLY unassigned requests; once assigned they
  // move to "Assigned" (incl. in-progress / awaiting approval); once approved
  // they move to "Completed".
  const groups = useMemo(() => ({
    open: rows.filter((r) => r.status === 'open'),
    assigned: rows.filter((r) => ['assigned', 'in_progress', 'approval_requested'].includes(r.status)),
    completed: rows.filter((r) => ['completed', 'approved'].includes(r.status)),
  }), [rows])

  const gradient = `linear-gradient(150deg, ${C.maroon} 0%, ${C.maroonDark} 100%)`

  const langToggle = (
    <button
      type="button"
      onClick={toggleLang}
      style={{
        background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
        borderRadius: 10, padding: '8px 14px', fontSize: 13.5, fontWeight: 600, backdropFilter: 'blur(4px)',
      }}
    >
      {hi ? 'English' : 'हिंदी'}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* brand header band */}
      <div style={{ width: '100%', background: gradient, color: '#fff', padding: '30px 20px 26px', position: 'relative', textAlign: 'center' }}>
        <div style={{ position: 'absolute', top: 16, right: 16 }}>{langToggle}</div>
        <div style={{ width: 50, height: 50, margin: '0 auto', borderRadius: 15, background: '#fff', color: C.maroon, display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 700, fontFamily: 'Georgia, serif', boxShadow: C.shadowLg }}>A</div>
        <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 10 }}>
          {hi ? 'मरम्मत अनुरोध' : 'Repair Requests'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3, maxWidth: 440, marginInline: 'auto' }}>
          {hi ? 'चल रहे अनुरोध देखें या नया अनुरोध जोड़ें।' : 'See ongoing requests or add a new one.'}
        </p>
      </div>

      <div style={{ flex: 1, width: '100%', maxWidth: 560, padding: '18px 16px 40px' }}>
        {view === 'form' ? (
          <RequestForm
            C={C} hi={hi}
            onBack={() => setView('list')}
            onSubmitted={(id) => { if (id) { addMine(id); setMine(readMine()) } load() }}
          />
        ) : (
          <>
            {/* Add request + summary */}
            <button type="button" onClick={() => setView('form')} style={addBtn(C)}>
              <Icon name="plus" size={18} color="#fff" /> {hi ? 'नया अनुरोध जोड़ें' : 'Add Request'}
            </button>

            <div style={{ display: 'flex', gap: 10, margin: '14px 0 16px' }}>
              <StatTile C={C} label={hi ? 'कुल' : 'Total'} value={counts.total} tone={C.text} />
              <StatTile C={C} label={hi ? 'चल रहे' : 'Ongoing'} value={counts.ongoing} tone={C.yellow} />
              <StatTile C={C} label={hi ? 'पूरे हुए' : 'Completed'} value={counts.done} tone={C.green} />
            </div>

            {loading ? (
              <Loader label={hi ? 'लोड हो रहा है…' : 'Loading…'} />
            ) : (
              <>
                <Tabs
                  tabs={[
                    { key: 'open', label: `${hi ? 'खुले' : 'Open'} (${groups.open.length})` },
                    { key: 'assigned', label: `${hi ? 'सौंपे गए' : 'Assigned'} (${groups.assigned.length})` },
                    { key: 'completed', label: `${hi ? 'पूरे हुए' : 'Completed'} (${groups.completed.length})` },
                  ]}
                  active={tab}
                  onChange={setTab}
                />
                {groups[tab].length === 0 ? (
                  <EmptyState
                    icon="inbox"
                    title={
                      tab === 'open' ? (hi ? 'कोई खुला अनुरोध नहीं' : 'No open requests')
                      : tab === 'assigned' ? (hi ? 'कोई सौंपा गया अनुरोध नहीं' : 'No assigned requests')
                      : (hi ? 'कोई पूरा अनुरोध नहीं' : 'No completed requests')
                    }
                    hint={tab === 'open' ? (hi ? 'ऊपर से नया अनुरोध जोड़ें' : 'Add one using the button above') : undefined}
                  />
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {groups[tab].map((r) => (
                      <RequestCard key={r.id} C={C} hi={hi} r={r} isMine={mine.has(r.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        <p style={{ textAlign: 'center', color: C.faint, fontSize: 12, margin: '22px 0 4px' }}>Ambria Ops · Workforce Management</p>
      </div>
    </div>
  )
}

function StatTile({ C, label, value, tone }) {
  return (
    <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 10px', textAlign: 'center', boxShadow: C.shadow }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.tl, fontWeight: 600, marginTop: 3 }}>{label}</div>
    </div>
  )
}

function RequestCard({ C, hi, r, isMine }) {
  const s = stat(r.status)
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C[s.tone]}`, borderRadius: 14, padding: 14, boxShadow: C.shadow }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, wordBreak: 'break-word' }}>
            {r.title}
            {isMine && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: C.maroon, background: C.maroonSoft, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                {hi ? 'आपका' : 'You'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Icon name="pin" size={13} color={C.faint} />
            {PROPERTY_MAP[r.property]?.name || r.property}
            {r.posted_by_name ? ` · ${r.posted_by_name}` : ''}
            {' · '}{fmtDate(r.created_at)}
          </div>
        </div>
        <Badge color={C[s.tone]} bg={C[s.bg]}>{hi ? s.hi : s.en}</Badge>
      </div>

      <div style={{ marginTop: 10 }}>
        <ProgressBar value={s.pct} tone={C[s.tone]} height={7} />
      </div>

      {r.assigned_to_name && (
        <div style={{ fontSize: 12, color: C.tl, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="user" size={13} color={C.faint} />
          {hi ? 'किसे सौंपा:' : 'Assigned to:'} {r.assigned_to_name}
        </div>
      )}
    </div>
  )
}

// ---- the Add Request form (name + phone required, phone capped at 10 digits) ----
function RequestForm({ C, hi, onBack, onSubmitted }) {
  const [form, setForm] = useState({ name: '', phone: '', property: 'pp', location: '', issue: '' })
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // phone: keep digits only, never longer than 10
  const setPhone = (e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))

  const canSubmit = !!form.name.trim() && form.phone.length === 10 && !!form.issue.trim() && !busy

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(hi ? 'नाम भरना ज़रूरी है।' : 'Name is required.'); return }
    if (form.phone.length !== 10) { setError(hi ? 'फ़ोन नंबर 10 अंकों का होना चाहिए।' : 'Phone number must be exactly 10 digits.'); return }
    if (!form.issue.trim()) { setError(hi ? 'समस्या बताना ज़रूरी है।' : 'Please describe the issue.'); return }

    setBusy(true); setError('')
    const issue = form.issue.trim()
    const description = [
      issue, '',
      hi ? '— सार्वजनिक लिंक से भेजा गया —' : '— Reported via public link —',
      `${hi ? 'नाम' : 'Name'}: ${form.name.trim()}`,
      `${hi ? 'फ़ोन' : 'Phone'}: ${form.phone}`,
      form.location.trim() ? `${hi ? 'स्थान' : 'Location'}: ${form.location.trim()}` : null,
    ].filter((l) => l !== null).join('\n')
    const title = issue.split('\n')[0].slice(0, 70) + (issue.length > 70 ? '…' : '')

    const { data, error: err } = await supabase.from('work_board').insert({
      title,
      description,
      category: 'other',
      property: form.property,
      posted_by: 'public',
      posted_by_name: `${form.name.trim()} · ${hi ? 'बाहरी' : 'External'}`,
      priority: 'normal',
      photos,
      status: 'open',
    }).select('id').single()

    setBusy(false)
    if (err) { setError(hi ? 'भेजने में समस्या हुई। दोबारा कोशिश करें।' : 'Could not submit. Please try again.'); return }
    onSubmitted?.(data?.id)
    setDone(true)
  }

  const fieldLabel = { display: 'block', fontSize: 12.5, fontWeight: 600, color: C.tl, marginBottom: 6 }
  const leadIcon = { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: C.faint, display: 'inline-flex' }

  if (done) {
    return (
      <div style={{ ...card(C), textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, margin: '4px auto 14px', borderRadius: '50%', background: C.gBg, display: 'grid', placeItems: 'center' }}>
          <Icon name="check" size={30} color={C.green} />
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>{hi ? 'अनुरोध भेज दिया गया!' : 'Request submitted!'}</h2>
        <p style={{ fontSize: 14, color: C.tl, marginTop: 6, lineHeight: 1.55 }}>
          {hi ? 'धन्यवाद। आप नीचे सूची में इसका स्टेटस देख सकते हैं।' : 'Thank you. You can track its status in the list.'}
        </p>
        <button type="button" onClick={onBack} style={addBtn(C)}>
          <Icon name="chevronLeft" size={18} color="#fff" /> {hi ? 'सूची पर वापस जाएँ' : 'Back to list'}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={card(C)}>
      <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.maroon, fontSize: 13.5, fontWeight: 600, marginBottom: 12, background: 'transparent' }}>
        <Icon name="chevronLeft" size={16} color={C.maroon} /> {hi ? 'वापस' : 'Back'}
      </button>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'आपका नाम' : 'Your name'} <span style={{ color: C.red }}>*</span></label>
        <div style={{ position: 'relative' }}>
          <span style={leadIcon}><Icon name="user" size={18} /></span>
          <input style={{ ...inputStyle(C), paddingLeft: 42 }} value={form.name} onChange={set('name')} placeholder={hi ? 'नाम' : 'Full name'} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'फ़ोन नंबर' : 'Phone number'} <span style={{ color: C.red }}>*</span></label>
        <div style={{ position: 'relative' }}>
          <span style={leadIcon}><Icon name="phone" size={18} /></span>
          <input
            style={{ ...inputStyle(C), paddingLeft: 42 }}
            type="tel" inputMode="numeric" maxLength={10}
            value={form.phone} onChange={setPhone}
            placeholder={hi ? '10 अंकों का नंबर' : '10-digit number'}
          />
        </div>
        <span style={{ fontSize: 11.5, color: form.phone.length === 10 ? C.green : C.faint, marginTop: 4, display: 'block' }}>
          {form.phone.length}/10 {hi ? 'अंक' : 'digits'}
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'कौन सी जगह?' : 'Which venue?'}</label>
        <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
          {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name} · {p.area}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'जगह / एरिया (कहाँ है समस्या?)' : 'Location / area (where is it?)'}</label>
        <div style={{ position: 'relative' }}>
          <span style={leadIcon}><Icon name="pin" size={18} /></span>
          <input style={{ ...inputStyle(C), paddingLeft: 42 }} value={form.location} onChange={set('location')} placeholder={hi ? 'जैसे: लॉन, वॉशरूम, गेट 2' : 'e.g. Lawn, washroom, gate 2'} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'समस्या बताएँ' : 'Describe the issue'} <span style={{ color: C.red }}>*</span></label>
        <textarea rows={4} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.issue} onChange={set('issue')} placeholder={hi ? 'क्या ठीक करना है?' : 'What needs to be fixed?'} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabel}>{hi ? 'फ़ोटो (वैकल्पिक)' : 'Photo (optional)'}</label>
        <PhotoCapture folder="work_board" value={photos} onChange={setPhotos} />
      </div>

      {error && (
        <div style={{ background: C.rBg, color: C.red, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" size={16} color={C.red} /> {error}
        </div>
      )}

      <button type="submit" disabled={!canSubmit} style={{ ...addBtn(C), opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed', marginTop: 0 }}>
        {busy ? <Spinner size={18} color="#fff" /> : <Icon name="check" size={18} color="#fff" />}
        {hi ? 'अनुरोध भेजें' : 'Submit request'}
      </button>
    </form>
  )
}

const card = (C) => ({
  background: C.card, borderRadius: 18, padding: 20, border: `1px solid ${C.border}`, boxShadow: C.shadowMd,
})

const addBtn = (C) => ({
  width: '100%', background: C.maroon, color: '#fff', border: 'none', borderRadius: 12,
  padding: '13px', fontSize: 15.5, fontWeight: 700, boxShadow: C.shadow, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6,
})
