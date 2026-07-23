import { useNavigate } from 'react-router-dom'
import { useColors } from '../../context/ThemeContext'
import { useLang, useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { PROPERTY_MAP } from '../../constants/org'
import NotificationBell from './NotificationBell'
import Icon from '../common/Icon'

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A'
}

export default function Header({ showBrand }) {
  const C = useColors()
  const t = useT()
  const { toggle: toggleLang, lang } = useLang()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const prop = PROPERTY_MAP[user?.property]?.name || ''

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 400,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(8px)',
        WebkitBackdropFilter: 'saturate(180%) blur(8px)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        {showBrand && (
          <div style={brandMark(C)}>A</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
            {user?.name || t.appName}
          </div>
          {prop && <div style={{ fontSize: 12, color: C.tl }}>{prop}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NotificationBell />
        <button onClick={toggleLang} aria-label="Language" style={langBtn(C)}>
          {lang === 'en' ? 'हिं' : 'EN'}
        </button>
        <button onClick={logout} aria-label={t.logout} title={t.logout} style={iconBtn(C)}>
          <Icon name="power" size={18} />
        </button>
        <button onClick={() => navigate('/account')} title={t.myAccount || 'My Account'} aria-label={t.myAccount || 'My Account'} style={{ ...avatar(C), cursor: 'pointer' }}>{initials(user?.name)}</button>
      </div>
    </header>
  )
}

const brandMark = (C) => ({
  width: 32, height: 32, borderRadius: 9, background: C.maroon, color: '#fff',
  display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'Georgia, serif', fontSize: 18,
})

const langBtn = (C) => ({
  minWidth: 40, height: 38, padding: '0 10px', borderRadius: 10,
  background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 700,
})

const iconBtn = (C) => ({
  width: 38, height: 38, borderRadius: 10, background: C.card,
  border: `1px solid ${C.border}`, color: C.tl, display: 'grid', placeItems: 'center',
})

const avatar = (C) => ({
  width: 38, height: 38, borderRadius: '50%', background: C.maroonSoft, color: C.maroon,
  display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, border: `1px solid ${C.border}`,
})
