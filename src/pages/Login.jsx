import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useColors } from '../context/ThemeContext'
import { useLang, useT } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useMediaQuery'
import { Spinner, inputStyle } from '../components/common/UI'
import Icon from '../components/common/Icon'

export default function Login() {
  const C = useColors()
  const t = useT()
  const { lang, toggle: toggleLang } = useLang()
  const { login } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const hi = lang === 'hi'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = !!username && !!password && !busy
  const gradient = `linear-gradient(150deg, ${C.maroon} 0%, ${C.maroonDark} 100%)`

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const res = await login(username, password, remember)
    setBusy(false)
    if (res.ok) navigate('/dashboard', { replace: true })
    else if (res.reason === 'inactive') setError(t.accountInactive)
    else if (res.reason === 'error') setError(hi ? 'कनेक्शन त्रुटि। इंटरनेट/सर्वर जाँचें।' : 'Connection error. Check internet / Supabase config.')
    else setError(t.invalidLogin)
  }

  const field = { ...inputStyle(C), paddingLeft: 42 }

  const features = hi
    ? ['हर प्रॉपर्टी के लिए रोल-आधारित एक्सेस', 'असेसमेंट के साथ ट्रेनिंग वीडियो', 'लाइव टास्क बोर्ड और स्टाफ़ प्रगति']
    : ['Role-based access for every property', 'Training videos with assessments', 'Live task board & staff progress']

  const langToggle = (onDark) => (
    <button
      onClick={toggleLang}
      style={{
        background: onDark ? 'rgba(255,255,255,0.16)' : C.card,
        border: `1px solid ${onDark ? 'rgba(255,255,255,0.3)' : C.border}`,
        color: onDark ? '#fff' : C.tl,
        borderRadius: 10, padding: '8px 14px', fontSize: 13.5, fontWeight: 600, backdropFilter: onDark ? 'blur(4px)' : undefined,
      }}
    >
      {hi ? 'English' : 'हिंदी'}
    </button>
  )

  // ---- the form itself (reused by both layouts) ----
  const form = (
    <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 400 }}>
      <div style={card(C)}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{hi ? 'वापसी पर स्वागत है' : 'Welcome back'}</h2>
          <p style={{ fontSize: 13.5, color: C.tl, marginTop: 3 }}>{hi ? 'जारी रखने के लिए साइन इन करें' : 'Sign in to your account to continue'}</p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel(C)}>{t.usernameOrPhone || t.username}</label>
          <div style={{ position: 'relative' }}>
            <span style={leadIcon(C)}><Icon name="user" size={18} /></span>
            <input style={field} placeholder={t.usernameOrPhone || t.username} value={username} autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel(C)}>{t.password}</label>
          <div style={{ position: 'relative' }}>
            <span style={leadIcon(C)}><Icon name="lock" size={18} /></span>
            <input
              style={{ ...field, paddingRight: 44 }}
              type={show ? 'text' : 'password'}
              placeholder={t.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', color: C.tl, display: 'inline-flex' }}>
              <Icon name={show ? 'eye' : 'eyeOff'} size={18} />
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: C.text, cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.maroon }} />
            {t.rememberMe}
          </label>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 5, marginLeft: 25 }}>{hi ? 'इस डिवाइस पर साइन इन रहें।' : 'Stay signed in on this device.'}</p>
        </div>

        {error && (
          <div style={{ background: C.rBg, color: C.red, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={16} color={C.red} /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: '100%', background: C.maroon, color: '#fff', border: 'none', borderRadius: 12,
            padding: '13px', fontSize: 15.5, fontWeight: 700, boxShadow: C.shadow,
            opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {busy ? <Spinner size={18} color="#fff" /> : null}
          {t.signIn}
        </button>
      </div>

      {/* how "Remember me" works */}
      <div style={infoBox(C)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 6 }}>
          <Icon name="info" size={15} color={C.maroon} /> {hi ? '"साइन इन रहें" कैसे काम करता है' : 'How “Remember me” works'}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: C.tl, lineHeight: 1.6 }}>
          <li>{hi ? 'चालू: ऐप बंद करने पर भी आप इस डिवाइस पर साइन इन रहेंगे।' : 'On: you stay signed in on this device, even after closing the app.'}</li>
          <li>{hi ? 'बंद: ब्राउज़र/टैब बंद करते ही आप अपने-आप साइन आउट हो जाएँगे।' : 'Off: you’re signed out automatically when you close the browser/tab.'}</li>
          <li>{hi ? 'साझा या सार्वजनिक डिवाइस पर इसे बंद रखें।' : 'Turn it off on shared or public devices.'}</li>
        </ul>
      </div>

      <p style={{ textAlign: 'center', color: C.faint, fontSize: 12, margin: '18px 0 8px' }}>Ambria Ops · Workforce Management</p>
    </form>
  )

  // ---------- MOBILE: brand band on top, form below ----------
  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: gradient, color: '#fff', padding: '40px 20px 34px', position: 'relative', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: 16, right: 16 }}>{langToggle(true)}</div>
          <div style={{ width: 60, height: 60, margin: '0 auto', borderRadius: 18, background: '#fff', color: C.maroon, display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 700, fontFamily: 'Georgia, serif', boxShadow: C.shadowLg }}>A</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 14 }}>{t.appName}</h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 4 }}>Ambria — Get Your Venue Events</p>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '24px 20px' }}>
          <div style={{ width: '100%', maxWidth: 400 }}>{form}</div>
        </div>
      </div>
    )
  }

  // ---------- DESKTOP: split screen ----------
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: C.bg }}>
      {/* left brand panel */}
      <div style={{ width: '44%', maxWidth: 560, background: gradient, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '56px 60px', position: 'relative', overflow: 'hidden' }}>
        {/* subtle decorative glow */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#fff', color: C.maroon, display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 700, fontFamily: 'Georgia, serif', boxShadow: C.shadowLg }}>A</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 24 }}>{t.appName}</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 10, maxWidth: 360, lineHeight: 1.55 }}>
            {hi ? 'Ambria के वेन्यू के लिए वर्कफोर्स मैनेजमेंट — टास्क, ट्रेनिंग और टीम, सब एक जगह।' : "Workforce management for Ambria's venues — tasks, training, and teams in one place."}
          </p>
          <div style={{ marginTop: 34, display: 'grid', gap: 14 }}>
            {features.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14.5, color: 'rgba(255,255,255,0.92)' }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.16)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name="check" size={15} color="#fff" />
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* right form panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', position: 'relative', overflowY: 'auto' }}>
        <div style={{ position: 'absolute', top: 24, right: 28 }}>{langToggle(false)}</div>
        {form}
      </div>
    </div>
  )
}

const card = (C) => ({
  background: C.card, borderRadius: 18, padding: 24, border: `1px solid ${C.border}`, boxShadow: C.shadowMd,
})

const infoBox = (C) => ({
  background: C.cardAlt, borderRadius: 14, padding: '13px 15px', border: `1px solid ${C.border}`, marginTop: 16,
})

const fieldLabel = (C) => ({ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.tl, marginBottom: 6 })

const leadIcon = (C) => ({ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: C.faint, display: 'inline-flex' })
