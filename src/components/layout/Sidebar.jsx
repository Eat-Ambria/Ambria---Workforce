import { NavLink } from 'react-router-dom'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { navForUser } from '../../constants/nav'
import { ROLES } from '../../constants/org'
import { useFixRequestCount } from '../../hooks/useFixRequestCount'
import Icon from '../common/Icon'

const roleLabels = (t) => ({ [ROLES.SUPER_ADMIN]: t.roleSuperAdmin, [ROLES.ADMIN]: t.roleAdmin, [ROLES.EMPLOYEE]: t.roleEmployee })

export default function Sidebar() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()
  const items = navForUser(user)
  const fixCount = useFixRequestCount()

  return (
    <aside
      style={{
        width: 244,
        background: C.card,
        borderRight: `1px solid ${C.border}`,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '2px 8px 22px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.maroon}, ${C.maroonDark})`, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'Georgia, serif', fontSize: 21 }}>A</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text, letterSpacing: '-0.02em' }}>{t.appName}</div>
          <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>Workforce</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 13px',
              borderRadius: 11,
              fontSize: 14.5,
              fontWeight: 600,
              color: isActive ? C.maroon : C.tl,
              background: isActive ? C.maroonSoft : 'transparent',
            })}
          >
            {({ isActive }) => (
              <>
                {isActive && <span style={{ position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)', width: 4, height: 22, borderRadius: 4, background: C.maroon }} />}
                <Icon name={item.icon} size={20} />
                {t[item.key] || item.key}
                {item.path === '/task-board' && fixCount > 0 && (
                  <span style={{ marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: C.maroon, color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    {fixCount > 99 ? '99+' : fixCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', padding: '14px 8px 2px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{user?.name}</div>
        <div style={{ fontSize: 12, color: C.faint }}>{roleLabels(t)[user?.role] || ''}</div>
      </div>
    </aside>
  )
}
