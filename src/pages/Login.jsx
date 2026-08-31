import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useColors, useTheme } from '../context/ThemeContext'
import { useLang, useT } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { homeFor } from '../constants/org'
import { useIsMobile } from '../hooks/useMediaQuery'
import { Spinner, inputStyle } from '../components/common/UI'
import PoweredBy from '../components/common/PoweredBy'
import Icon from '../components/common/Icon'

export default function Login() {
  const C = useColors()
  const t = useT()
  const { lang, toggle: toggleLang } = useLang()
  const { theme, toggle: toggleTheme } = useTheme()
  const { login } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const hi = lang === 'hi'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // This one field takes a username OR a phone number, so the rule has to be
  // conditional: all digits means they are entering a phone, and a phone here is
  // ten digits. A username like `test` must stay untouched — a blanket ten-digit
  // rule would lock out every non-numeric login.
  const looksLikePhone = /^\d+$/.test(username.trim())
  const phoneIncomplete = looksLikePhone && username.trim().length !== 10
  const canSubmit = !!username && !!password && !phoneIncomplete && !busy
  const gradient = `linear-gradient(150deg, ${C.brandBg} 0%, ${C.maroonDark} 100%)`

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const res = await login(username, password)
    setBusy(false)
    // Their own landing page: the valet team has no dashboard, and sending them
    // there only to be bounced back is a visible flash on every login.
    if (res.ok) navigate(homeFor(res.user?.role), { replace: true })
    else if (res.reason === 'inactive') setError(t.accountInactive)
    else if (res.reason === 'error') setError(hi ? 'कनेक्शन त्रुटि। इंटरनेट/सर्वर जाँचें।' : 'Connection error. Check internet / Supabase config.')
    else setError(t.invalidLogin)
  }

  const field = { ...inputStyle(C), paddingLeft: 42 }
  // the card is a touch wider on desktop so the page reads as one column
  const FORM_MAX = isMobile ? 400 : 440

  // always sits on the gradient band now, so it only needs the on-dark styling
  const langToggle = () => (
    <button
      onClick={toggleLang}
      style={{
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.3)',
        color: '#fff',
        borderRadius: 10, padding: '8px 14px', fontSize: 13.5, fontWeight: 600, backdropFilter: 'blur(4px)',
      }}
    >
      {hi ? 'English' : 'हिंदी'}
    </button>
  )

  // Icon only, in the same translucent treatment: the band is the brand gradient
  // in both themes, so nothing here needs a theme-aware colour of its own.
  const themeToggle = () => (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? (hi ? 'लाइट थीम' : 'Light theme') : (hi ? 'डार्क थीम' : 'Dark theme')}
      aria-label={theme === 'dark' ? (hi ? 'लाइट थीम' : 'Light theme') : (hi ? 'डार्क थीम' : 'Dark theme')}
      style={{
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 10, padding: '8px 10px', backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', lineHeight: 0,
      }}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} color="#fff" />
    </button>
  )

  // ---- the form itself (reused by both layouts) ----
  const form = (
    <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: FORM_MAX }}>
      <div style={card(C)}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{hi ? 'वापसी पर स्वागत है' : 'Welcome back'}</h2>
          <p style={{ fontSize: 13.5, color: C.tl, marginTop: 3 }}>{hi ? 'जारी रखने के लिए साइन इन करें' : 'Sign in to your account to continue'}</p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel(C)}>{t.usernameOrPhone || t.username}</label>
          <div style={{ position: 'relative' }}>
            <span style={leadIcon(C)}><Icon name="user" size={18} /></span>
            <input
              style={{ ...field, borderColor: phoneIncomplete ? C.red : field.borderColor }}
              placeholder={t.usernameOrPhone || t.username}
              value={username}
              autoCapitalize="none"
              autoCorrect="off"
              // Digits only: a phone keyboard on a phone, letters still typeable
              // on a keyboard, because this field takes usernames too.
              inputMode={looksLikePhone ? 'numeric' : 'text'}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          {/* Said as they type, not on submit. A wrong-length phone would
              otherwise cost a round trip and come back as "invalid login",
              which reads as a wrong PIN. */}
          {phoneIncomplete && (
            <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginTop: 5 }}>
              {t.phoneRule}
            </div>
          )}
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

        {error && (
          <div style={{ background: C.rBg, color: C.red, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={16} color={C.red} /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: '100%', background: C.brandBg, color: '#fff', border: 'none', borderRadius: 12,
            padding: '13px', fontSize: 15.5, fontWeight: 700, boxShadow: C.shadow,
            opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {busy ? <Spinner size={18} color="#fff" /> : null}
          {t.signIn}
        </button>
      </div>

      <PoweredBy style={{ paddingTop: 14, paddingBottom: 2 }} />
    </form>
  )

  // ---------- ONE LAYOUT: brand band on top, form centred below ----------
  // No split screen. Desktop is the same stack as mobile, just larger — the
  // wordmark is a white transparent PNG, so it has to sit on the gradient band
  // rather than on the light page background where it would be invisible.
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: gradient, color: '#fff', padding: isMobile ? '34px 20px 30px' : '38px 24px 34px', position: 'relative', textAlign: 'center', overflow: 'hidden' }}>
        {/* subtle decorative glow */}
        <div style={{ position: 'absolute', top: -110, right: -60, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -140, left: -40, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{
          position: 'absolute', top: isMobile ? 16 : 22, right: isMobile ? 16 : 26,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {themeToggle()}
          {langToggle()}
        </div>
        {/* the wordmark with "Admin" centred beneath it, as one lockup */}
        <div style={{ position: 'relative', width: isMobile ? 156 : 196, margin: '0 auto' }}>
          <img src={`${import.meta.env.BASE_URL}icons/logo-wordmark.png`} alt="Ambria"
               style={{ width: '100%', display: 'block' }} />
          <h1 style={{ fontSize: isMobile ? 22 : 27, fontWeight: 800, letterSpacing: '-0.02em', marginTop: isMobile ? 18 : 18 }}>
            {t.loginTitle}
          </h1>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: isMobile ? '22px 20px' : '28px 24px' }}>
        <div style={{ width: '100%', maxWidth: FORM_MAX }}>{form}</div>
      </div>
    </div>
  )
}

const card = (C) => ({
  background: C.card, borderRadius: 18, padding: 24, border: `1px solid ${C.border}`, boxShadow: C.shadowMd,
})

const fieldLabel = (C) => ({ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.tl, marginBottom: 6 })

const leadIcon = (C) => ({ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: C.faint, display: 'inline-flex' })
