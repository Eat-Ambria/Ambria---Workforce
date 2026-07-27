import { useNavigate, useLocation } from 'react-router-dom'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { PROPERTY_MAP, propName, personName } from '../../constants/org'
import NotificationBell from './NotificationBell'
import Icon from '../common/Icon'
import BrandMark from '../common/BrandMark'

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A'
}

export default function Header({ showBrand, onMenu }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const prop = propName(user?.property, lang) || ''
  const onAccount = location.pathname === '/account'
  // toggle: open My Account, or if already there, close it (go back)
  const toggleAccount = () => (onAccount ? navigate(-1) : navigate('/account'))

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
        {onMenu && (
          <button onClick={onMenu} aria-label={t.menu} style={iconBtn(C)}>
            <Icon name="menu" size={20} />
          </button>
        )}
        {showBrand && <BrandMark size={32} radius={9} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
            {personName(user, lang) || t.appName}
          </div>
          {prop && <div style={{ fontSize: 12, color: C.tl }}>{prop}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NotificationBell />
        <button
          onClick={toggleAccount}
          title={t.myAccount || 'My Account'}
          aria-label={t.myAccount || 'My Account'}
          style={{ ...avatar(C), cursor: 'pointer', ...(onAccount ? { background: C.maroon, color: '#fff' } : {}) }}
        >{initials(user?.name)}</button>
      </div>
    </header>
  )
}


const iconBtn = (C) => ({
  width: 38, height: 38, borderRadius: 10, background: C.card,
  border: `1px solid ${C.border}`, color: C.tl, display: 'grid', placeItems: 'center',
})

const avatar = (C) => ({
  width: 38, height: 38, borderRadius: '50%', background: C.maroonSoft, color: C.maroon,
  display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, border: `1px solid ${C.border}`,
})
