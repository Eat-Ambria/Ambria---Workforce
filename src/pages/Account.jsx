import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getPushState, enablePush, disablePush } from '../lib/push'
import { useColors } from '../context/ThemeContext'
import { useT } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { ROLES, PROPERTY_MAP } from '../constants/org'
import { normalizePhone } from '../lib/phone'
import { Card, Button, SectionTitle, Field, inputStyle } from '../components/common/UI'
import Icon from '../components/common/Icon'

const roleLabels = (t) => ({ [ROLES.SUPER_ADMIN]: t.roleSuperAdmin, [ROLES.ADMIN]: t.roleAdmin, [ROLES.EMPLOYEE]: t.roleEmployee })
const isPin = (v) => /^\d{4}$/.test(v)

export default function Account() {
  const C = useColors()
  const t = useT()
  const { user, updateUser, logout } = useAuth()

  const [phone, setPhone] = useState(user?.phone || '')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  // Web Push toggle state for this device
  const [pushState, setPushState] = useState('off') // unsupported | unconfigured | denied | on | off
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => { getPushState().then(setPushState) }, [])

  async function togglePush() {
    setPushBusy(true)
    try {
      if (pushState === 'on') { await disablePush(); setPushState('off') }
      else { await enablePush(user.id); setPushState('on') }
    } catch (e) {
      setPushState(e.message === 'denied' ? 'denied' : await getPushState())
    } finally {
      setPushBusy(false)
    }
  }

  const normPhone = normalizePhone(phone)
  const phoneChanged = normPhone !== (user?.phone || '')

  async function save() {
    setErr(''); setOk(false)

    // build only the fields that actually changed (phone stored normalized)
    const patch = {}
    if (phoneChanged) patch.phone = normPhone || null

    if (pin || pin2) {
      if (!isPin(pin)) { setErr(t.pinRule || 'PIN must be exactly 4 digits'); return }
      if (pin !== pin2) { setErr(t.pinMismatch || 'PINs do not match'); return }
      patch.password = pin
    }

    if (Object.keys(patch).length === 0) { setErr(t.nothingToSave || 'Nothing to update'); return }

    setBusy(true)
    // friendly pre-check so a taken phone shows a clear message
    if (patch.phone) {
      const { data: clash } = await supabase
        .from('users').select('id').eq('phone', patch.phone).neq('id', user.id).limit(1)
      if (clash && clash.length) { setBusy(false); setErr(t.phoneInUse || 'That phone number is already in use'); return }
    }

    const { error } = await supabase.from('users').update(patch).eq('id', user.id)
    setBusy(false)
    if (error) {
      setErr(/duplicate|unique/i.test(error.message) ? (t.phoneInUse || 'That phone number is already in use') : error.message)
      return
    }
    if (patch.phone !== undefined) updateUser({ phone: patch.phone })
    setPin(''); setPin2(''); setOk(true)
  }

  const prop = PROPERTY_MAP[user?.property]?.name

  return (
    <div>
      <SectionTitle>{t.myAccount || 'My Account'}</SectionTitle>

      {/* identity (read-only) */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: C.maroonSoft, color: C.maroon, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 17 }}>
            {(user?.name || 'A').trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: C.tl }}>{roleLabels(t)[user?.role] || user?.role}{prop ? ` · ${prop}` : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5 }}>
          <Icon name="info" size={16} color={C.maroon} />
          <span>{t.loginIdHint || 'You can sign in with your username or your phone number.'}</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.tl, marginTop: 10 }}>
          {t.username}: <b style={{ color: C.text }}>@{user?.username}</b>
        </div>
      </Card>

      {/* push notifications for this device */}
      {pushState !== 'unsupported' && pushState !== 'unconfigured' && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: C.maroonSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name="bell" size={20} color={C.maroon} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{t.pushTitle || 'Push notifications'}</div>
              <div style={{ fontSize: 12.5, color: C.tl, marginTop: 1 }}>
                {pushState === 'denied'
                  ? (t.pushDenied || 'Blocked in browser settings — allow notifications to enable.')
                  : (t.pushHint || 'Get alerts on this device even when the app is closed.')}
              </div>
            </div>
            <Button
              variant={pushState === 'on' ? 'ghost' : 'primary'}
              onClick={togglePush}
              disabled={pushBusy || pushState === 'denied'}
              style={{ flexShrink: 0 }}
            >
              {pushState === 'on' ? (t.pushOff || 'Turn off') : (t.pushOn || 'Enable')}
            </Button>
          </div>
        </Card>
      )}

      {/* editable: phone + PIN */}
      <Card>
        <Field label={t.phoneLoginLabel || 'Phone (you can log in with this)'}>
          <input style={inputStyle(C)} value={phone} inputMode="tel" autoComplete="tel"
            onChange={(e) => { setPhone(e.target.value); setOk(false) }} />
        </Field>

        <div style={{ fontSize: 13, fontWeight: 700, color: C.tl, margin: '6px 0 8px' }}>{t.changePin || 'Change PIN'}</div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label={t.newPin || 'New PIN'}>
              <input
                style={inputStyle(C)} value={pin} type={showPin ? 'text' : 'password'}
                inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="new-password"
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setOk(false) }}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label={t.confirmPin || 'Confirm PIN'}>
              <input
                style={inputStyle(C)} value={pin2} type={showPin ? 'text' : 'password'}
                inputMode="numeric" maxLength={4} placeholder="••••" autoComplete="new-password"
                onChange={(e) => { setPin2(e.target.value.replace(/\D/g, '').slice(0, 4)); setOk(false) }}
              />
            </Field>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.tl, marginBottom: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPin} onChange={(e) => setShowPin(e.target.checked)} style={{ accentColor: C.maroon }} />
          {t.showPin || 'Show PIN'}
        </label>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 12 }}>{t.pinKeepHint || 'Leave the PIN fields blank to keep your current PIN.'}</div>

        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        {ok && <div style={{ color: C.green, fontSize: 13.5, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={16} color={C.green} /> {t.saved || 'Saved'}</div>}

        <Button variant="primary" onClick={save} disabled={busy} full>{t.save}</Button>
      </Card>

      {/* logout lives here, under My Account */}
      <Button variant="danger" onClick={logout} full style={{ marginTop: 14 }}>
        <Icon name="power" size={16} color="#fff" style={{ marginRight: 6 }} /> {t.logout}
      </Button>
    </div>
  )
}
