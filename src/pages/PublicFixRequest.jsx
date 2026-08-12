import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/time'
import { useColors } from '../context/ThemeContext'
import { useLang } from '../context/LangContext'
import { PROPERTIES, PROPERTY_MAP, propName, deptName, personName } from '../constants/org'
import { assigneesQuery } from '../lib/assignees'
import { hindiFor } from '../lib/translate'
import { Spinner, inputStyle, Badge, ProgressBar, EmptyState, Loader, Tabs, Field } from '../components/common/UI'
import HindiInput from '../components/common/HindiInput'
import PhotoCapture from '../components/common/PhotoCapture'
import VoiceRecorder from '../components/common/VoiceRecorder'
import Icon from '../components/common/Icon'
import PoweredBy from '../components/common/PoweredBy'

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
  const [propFilter, setPropFilter] = useState('all') // filter the list by venue
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

  // narrow to the selected property; counts + sections both reflect the filter
  const shownRows = useMemo(
    () => (propFilter === 'all' ? rows : rows.filter((r) => r.property === propFilter)),
    [rows, propFilter]
  )

  const counts = useMemo(() => {
    const done = shownRows.filter((r) => ['completed', 'approved'].includes(r.status)).length
    return { total: shownRows.length, ongoing: shownRows.length - done, done }
  }, [shownRows])

  // sections by status. Open shows ONLY unassigned requests; once assigned they
  // move to "Assigned" (incl. in-progress / awaiting approval); once approved
  // they move to "Completed".
  const groups = useMemo(() => ({
    open: shownRows.filter((r) => r.status === 'open'),
    assigned: shownRows.filter((r) => ['assigned', 'in_progress', 'approval_requested'].includes(r.status)),
    completed: shownRows.filter((r) => ['completed', 'approved'].includes(r.status)),
  }), [shownRows])

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
        {/* the wordmark sits straight on the gradient (transparent PNG) */}
        <img
          src={`${import.meta.env.BASE_URL}icons/logo-wordmark.png`}
          alt="Ambria"
          style={{ width: 150, display: 'block', margin: '0 auto' }}
        />
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

            {/* filter the list by venue */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <Icon name="pin" size={16} color={C.tl} />
              <select
                style={inputStyle(C)}
                value={propFilter}
                onChange={(e) => setPropFilter(e.target.value)}
                aria-label={hi ? 'प्रॉपर्टी' : 'Property'}
              >
                <option value="all">{hi ? 'सभी प्रॉपर्टी' : 'All properties'}</option>
                {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
              </select>
            </div>

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

        <PoweredBy style={{ paddingTop: 22, paddingBottom: 4 }} />
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
  const lang = hi ? 'hi' : 'en'
  const s = stat(r.status)
  const [showWork, setShowWork] = useState(false)
  const done = ['completed', 'approved'].includes(r.status)
  const workPhotos = Array.isArray(r.resolution_photos) ? r.resolution_photos : []
  const hasWork = done && (r.resolution_note || r.resolution_voice_url || workPhotos.length > 0)
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C[s.tone]}`, borderRadius: 14, padding: 14, boxShadow: C.shadow }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          {(r.category || 'other') === 'kitchen' && (
            <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 8px', marginBottom: 5 }}>
              {hi ? 'रसोई / किचन' : 'Kitchen'}
            </span>
          )}
          <div style={{ fontWeight: 700, fontSize: 15, wordBreak: 'break-word' }}>
            {hi && r.title_hi ? r.title_hi : r.title}
            {isMine && (
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: C.maroon, background: C.maroonSoft, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                {hi ? 'आपका' : 'You'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Icon name="pin" size={13} color={C.faint} />
            {propName(r.property, lang)}
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

      {/* Who signed it off. Only where there is a name: requests finished before
          the sign-off was recorded have nobody to credit, and a blank label would
          read as a missing person rather than missing history. */}
      {done && r.approved_by_name && (
        <div style={{ fontSize: 12, color: C.tl, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="check" size={13} color={C.green} />
          {hi ? 'पूरा किया:' : 'Completed by:'} {r.approved_by_name}
        </div>
      )}

      {/* What was actually done. Folded away by default — several of these run to
          a paragraph, and a dozen of them open at once is a wall to scroll past. */}
      {hasWork && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowWork((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: 'none', padding: 0,
              fontSize: 12.5, fontWeight: 700, color: C.maroon, cursor: 'pointer',
            }}
          >
            <Icon
              name="chevronRight"
              size={14}
              color={C.maroon}
              style={{ transform: showWork ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
            />
            {hi ? 'क्या किया गया' : 'What was done'}
          </button>
          {showWork && (
            <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: 11, marginTop: 7 }}>
              {r.resolution_note && (
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-line', margin: 0 }}>
                  {r.resolution_note}
                </p>
              )}
              {r.resolution_voice_url && (
                <audio
                  controls
                  src={r.resolution_voice_url}
                  style={{ width: '100%', marginTop: r.resolution_note ? 9 : 0 }}
                />
              )}
              {workPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: (r.resolution_note || r.resolution_voice_url) ? 9 : 0 }}>
                  {workPhotos.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img
                        src={u}
                        alt=""
                        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 9, border: `1px solid ${C.border}` }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- the Add Request form (name + phone required, phone capped at 10 digits) ----
function RequestForm({ C, hi, onBack, onSubmitted }) {
  const lang = hi ? 'hi' : 'en'
  const [form, setForm] = useState({
    name: '', phone: '', property: 'pp', location: '',
    title: '', titleHi: '', issue: '', descHi: '', category: 'other', priority: 'normal',
    department: '', assignee: '',
  })
  const [people, setPeople] = useState([])
  const [photos, setPhotos] = useState([])
  const [voice, setVoice] = useState('')
  // Can this device record at all? A phone with no microphone, or a browser where
  // permission was refused, cannot — and a required field nobody can fill is a
  // fault that never gets reported. Those fall back to typing it.
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Loaded once and filtered in the browser: switching department should not
  // cost a round trip on a phone at the gate.
  useEffect(() => { assigneesQuery().then(({ data }) => setPeople(data || [])) }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // By department, not by venue. The venue is already on the request; who fixes
  // a broken pipe is a trade, and the plumber may well be based elsewhere.
  const inDept = useMemo(
    () => (form.department ? people.filter((m) => m.department === form.department) : []),
    [people, form.department]
  )

  // Changing department must not leave the previous person selected — that is
  // how a request ends up assigned to someone the picker no longer even lists.
  const setDept = (e) => setForm((f) => ({ ...f, department: e.target.value, assignee: '' }))

  // A kitchen fault is a kitchen job, a wiring fault is the electrician's. The
  // kind of repair already names the team, so fill it in rather than making the
  // visitor say the same thing twice — they can still change it afterwards.
  // 'other' names no team, so it leaves the department alone.
  const CAT_DEPT = { kitchen: 'kt', ms: 'ms', el: 'el', pt: 'pt', cp: 'cp' }
  // A general repair is the only kind that leaves the team open, and the teams
  // it can go to are the four that do general work. Kitchen, Electrician and the
  // rest are their own kind of repair — offering them here as well would let a
  // request say "General repair" and "Electrician" at the same time.
  const GENERAL_DEPTS = ['a', 'h', 'k', 's']
  const deptChoices = CAT_DEPT[form.category] ? [CAT_DEPT[form.category]] : GENERAL_DEPTS

  const setCategory = (e) => {
    const cat = e.target.value
    const dept = CAT_DEPT[cat]
    setForm((f) => ({
      ...f,
      category: cat,
      // The kind of repair decides the team, so the previous answer never
      // survives the switch: a trade sets its own, and going back to General
      // clears it rather than leaving "Kitchen" sitting under "General repair".
      department: dept || '',
      assignee: '',
    }))
  }
  // phone: keep digits only, never longer than 10
  const setPhone = (e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))

  // The title is what the request IS; the description only elaborates. That
  // matches the admin form, where the description is optional too.
  const canSubmit = !!form.name.trim() && form.phone.length === 10 && !!form.title.trim() && !busy

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(hi ? 'नाम भरना ज़रूरी है।' : 'Name is required.'); return }
    if (form.phone.length !== 10) { setError(hi ? 'फ़ोन नंबर 10 अंकों का होना चाहिए।' : 'Phone number must be exactly 10 digits.'); return }
    if (!form.title.trim()) { setError(hi ? 'शीर्षक भरना ज़रूरी है।' : 'A title is required.'); return }
    // What is wrong, in the reporter's own words: recorded normally, typed only
    // where recording is impossible.
    const saidIt = voice || (!canRecord && form.issue.trim())
    if (!saidIt) {
      setError(canRecord
        ? (hi ? 'बोलकर बताएँ कि दिक्कत क्या है।' : 'Record a voice note saying what the problem is.')
        : (hi ? 'दिक्कत क्या है यह लिखें।' : 'Type what the problem is.'))
      return
    }

    setBusy(true); setError('')
    const issue = form.issue.trim()
    // the same block in either language — the labels are ours, only the reported
    // text has to be translated
    // the description is optional now, so it must not leave a blank first line
    const block = (issueText, inHindi) => [
      issueText ? issueText : null,
      issueText ? '' : null,
      inHindi ? '— सार्वजनिक लिंक से भेजा गया —' : '— Reported via public link —',
      `${inHindi ? 'नाम' : 'Name'}: ${form.name.trim()}`,
      `${inHindi ? 'फ़ोन' : 'Phone'}: ${form.phone}`,
      form.location.trim() ? `${inHindi ? 'स्थान' : 'Location'}: ${form.location.trim()}` : null,
    ].filter((l) => l !== null).join('\n')
    const description = block(issue, hi)
    const title = form.title.trim()
    // resolved from the loaded list, never trusted from the select's value alone
    const assignee = inDept.find((m) => m.id === form.assignee) || null

    // Whatever the reporter left in the Hindi boxes wins — those boxes show the
    // machine's attempt and let it be corrected, so overwriting it here would
    // throw away the only human judgement in the loop. Only what is still blank
    // gets translated. (hindiFor leaves Devanagari alone, so a form filled in
    // Hindi needs nothing either way.)
    const typedTitleHi = form.titleHi.trim()
    const typedDescHi = form.descHi.trim()
    let title_hi = typedTitleHi
    let hiDesc = typedDescHi
    if (!title_hi || (issue && !hiDesc)) {
      const auto = await hindiFor(title, issue)
      title_hi = title_hi || auto.hi
      hiDesc = hiDesc || auto.hiDesc
    }

    const { data, error: err } = await supabase.from('work_board').insert({
      title,
      title_hi,
      description,
      description_hi: hiDesc ? block(hiDesc, true) : null,
      category: form.category || 'other',
      property: form.property,
      // Without this a department-scoped admin never sees the request: the board
      // filters on department and a NULL matches nothing.
      department: form.department || null,
      posted_by: 'public',
      posted_by_name: `${form.name.trim()} · ${hi ? 'बाहरी' : 'External'}`,
      priority: form.priority,
      photos,
      voice_url: voice || null,
      assigned_to: assignee?.id || null,
      assigned_to_name: assignee?.name || null,
      // naming someone at submit skips the open -> assigned hop, same as the
      // admin form does
      status: assignee ? 'assigned' : 'open',
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
          {PROPERTIES.map((p) => (
            <option key={p.code} value={p.code}>
              {propName(p.code, lang)} · {hi && p.areaHi ? p.areaHi : p.area}
            </option>
          ))}
        </select>
      </div>

      {/* Same two fields the admin form opens with. The title used to be sliced
          off the first line of the description, which produced titles cut
          mid-word; and the Hindi was generated at submit where nobody could see
          it, let alone fix it. */}
      <Field label={hi ? 'शीर्षक' : 'Title'} required>
        <input
          style={inputStyle(C)}
          value={form.title}
          onChange={set('title')}
          placeholder={hi ? 'जैसे: गेट 2 की लाइट खराब' : 'e.g. Gate 2 light not working'}
        />
      </Field>

      <HindiInput
        label={hi ? 'शीर्षक हिंदी में' : 'Title in Hindi'}
        hint={hi ? 'स्टाफ यही पढ़ता है। अनुवाद गलत हो तो ठीक कर दें।' : 'This is what the staff read. Correct it if the translation is off.'}
        source={form.title}
        value={form.titleHi}
        onChange={(v) => setForm((f) => ({ ...f, titleHi: v }))}
      />

      {/* Kitchen faults go to a different person, so the visitor says which
          kind it is rather than an admin guessing from the description. */}
      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'किस चीज़ की मरम्मत?' : 'What kind of repair?'}</label>
        <select style={inputStyle(C)} value={form.category} onChange={setCategory}>
          <option value="other">{hi ? 'सामान्य मरम्मत' : 'General repair'}</option>
          <option value="kitchen">{hi ? 'रसोई / किचन' : 'Kitchen'}</option>
          {/* the trades, listed the same way Kitchen is. Codes match
              FIX_CATEGORIES in TaskBoard — a visitor and an admin have to be
              filing the same thing under the same name. */}
          {['ms', 'el', 'pt', 'cp'].map((c) => (
            <option key={c} value={c}>{deptName(c, lang)}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'किस डिपार्टमेंट का काम?' : 'Which department?'}</label>
        <select style={inputStyle(C)} value={form.department} onChange={setDept}>
          <option value="">{hi ? '— चुनें (वैकल्पिक) —' : '— Select (optional) —'}</option>
          {deptChoices.map((code) => <option key={code} value={code}>{deptName(code, lang)}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: C.faint, marginTop: 4, display: 'block' }}>
          {hi
            ? 'इससे तय होता है कि किस डिपार्टमेंट का एडमिन यह अनुरोध देखेगा।'
            : 'This decides which department\u2019s admin sees the request.'}
        </span>
      </div>

      {/* Only once a department is chosen — a list of every member of staff is
          not a choice, it is a scroll. */}
      {form.department && (
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>{hi ? 'किसे सौंपें (वैकल्पिक)' : 'Assign to (optional)'}</label>
          <select style={inputStyle(C)} value={form.assignee} onChange={set('assignee')}>
            <option value="">{hi ? '— कोई नहीं, एडमिन तय करेगा —' : '\u2014 Leave it to the admin \u2014'}</option>
            {inDept.map((m) => <option key={m.id} value={m.id}>{personName(m, lang)}</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: C.faint, marginTop: 4, display: 'block' }}>
            {inDept.length === 0
              ? (hi ? 'इस डिपार्टमेंट में अभी कोई नहीं है।' : 'Nobody is in this department yet.')
              : (hi ? 'जगह से नहीं, डिपार्टमेंट से नाम दिख रहे हैं।' : 'Names are listed by department, not by venue.')}
          </span>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'कितना ज़रूरी है?' : 'How urgent is it?'}</label>
        <select style={inputStyle(C)} value={form.priority} onChange={set('priority')}>
          <option value="normal">{hi ? 'सामान्य' : 'Normal'}</option>
          <option value="high">{hi ? 'ज़्यादा ज़रूरी' : 'High'}</option>
          <option value="urgent">{hi ? 'बहुत ज़रूरी' : 'Urgent'}</option>
        </select>
        <span style={{ fontSize: 11.5, color: C.faint, marginTop: 4, display: 'block' }}>
          {hi
            ? 'ज़रूरी तभी चुनें जब अभी ख़तरा हो या चीज़ इस्तेमाल लायक न हो।'
            : 'Urgent is for something unsafe or unusable right now.'}
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'जगह / एरिया (कहाँ है समस्या?)' : 'Location / area (where is it?)'}</label>
        <div style={{ position: 'relative' }}>
          <span style={leadIcon}><Icon name="pin" size={18} /></span>
          <input style={{ ...inputStyle(C), paddingLeft: 42 }} value={form.location} onChange={set('location')} placeholder={hi ? 'जैसे: लॉन, वॉशरूम, गेट 2' : 'e.g. Lawn, washroom, gate 2'} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>{hi ? 'ब्यौरा (वैकल्पिक)' : 'Description (optional)'}</label>
        <textarea rows={4} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.issue} onChange={set('issue')} placeholder={hi ? 'क्या ठीक करना है?' : 'What needs to be fixed?'} />
      </div>

      {/* only worth showing once there is something to translate */}
      {form.issue.trim() && (
        <HindiInput
          label={hi ? 'ब्यौरा हिंदी में' : 'Description in Hindi'}
          rows={3}
          source={form.issue}
          value={form.descHi}
          onChange={(v) => setForm((f) => ({ ...f, descHi: v }))}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabel}>
          {canRecord
            ? (hi ? 'बोलकर बताएँ कि दिक्कत क्या है' : 'Record what the problem is')
            : (hi ? 'लिखकर बताएँ (यह डिवाइस रिकॉर्ड नहीं कर सकता)' : 'Type it (this device cannot record)')}
        </label>
        <VoiceRecorder folder="work-voice" value={voice} onChange={setVoice} />
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
