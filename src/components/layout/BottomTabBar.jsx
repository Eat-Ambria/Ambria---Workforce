import { NavLink } from 'react-router-dom'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { bottomTabsForUser } from '../../constants/nav'
import { useFixRequestCount } from '../../hooks/useFixRequestCount'
import Icon from '../common/Icon'

export default function BottomTabBar() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()
  const items = bottomTabsForUser(user)
  const fixCount = useFixRequestCount()

  return (
    <nav
      className="safe-bottom no-scrollbar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: C.card,
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        overflowX: 'auto',       // scroll horizontally when items overflow (e.g. admin's Vendors/Users)
        WebkitOverflowScrolling: 'touch',
        zIndex: 500,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          style={({ isActive }) => ({
            flex: '1 0 auto',
            minWidth: 66,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 3,
            padding: '9px 8px 10px',
            fontSize: 'clamp(9px, 2.6vw, 10.5px)',
            fontWeight: 600,
            color: isActive ? C.maroon : C.faint,
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{ position: 'relative', padding: '4px 12px', borderRadius: 999, background: isActive ? C.maroonSoft : 'transparent', display: 'grid', placeItems: 'center' }}>
                <Icon name={item.icon} size={21} />
                {item.path === '/task-board' && fixCount > 0 && (
                  <span style={{ position: 'absolute', top: -1, right: 8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: C.maroon, color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: `1.5px solid ${C.card}` }}>
                    {fixCount > 99 ? '99+' : fixCount}
                  </span>
                )}
              </span>
              <span style={{ whiteSpace: 'nowrap', lineHeight: 1.15, textAlign: 'center' }}>
                {t[item.key] || item.key}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
