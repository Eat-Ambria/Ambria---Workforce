import { NavLink } from 'react-router-dom'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { navForUser } from '../../constants/nav'
import { ROLES, DEPARTMENT_MAP, deptName, isAdminRole, personName } from '../../constants/org'
import { useFixRequestCount } from '../../hooks/useFixRequestCount'
import { initials, avatarTint } from '../../lib/avatar'
import Icon from '../common/Icon'
import BrandMark from '../common/BrandMark'

const roleLabels = (t) => ({ [ROLES.SUPER_ADMIN]: t.roleSuperAdmin, [ROLES.ADMIN]: t.roleAdmin, [ROLES.EMPLOYEE]: t.roleEmployee })

export default function Sidebar({ mobile = false, onNavigate }) {
  const C = useColors()
  const t = useT()
  const { toggle: toggleLang, lang } = useLang()
  const { user, logout } = useAuth()
  const items = navForUser(user)
  const fixCount = useFixRequestCount()

  return (
    <aside
      className={mobile ? 'no-scrollbar' : undefined}
      style={{
        width: mobile ? '100%' : 244,
        background: C.card,
        borderRight: mobile ? 'none' : `1px solid ${C.border}`,
        height: mobile ? '100%' : '100vh',
        position: mobile ? 'static' : 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px',
        overflowY: 'auto',
        // Read by .side-link in index.css. Set here rather than on each row so
        // there is one place the hover colour comes from, and so it follows the
        // theme without any row knowing about it.
        '--side-ink': C.tl,
        '--side-hover': C.cardAlt,
        '--side-hover-ink': C.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '2px 8px 22px' }}>
        <BrandMark size={36} radius={10} />
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text, letterSpacing: '-0.02em' }}>{t.appName}</div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}`}
            style={({ isActive }) => ({
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 13px',
              borderRadius: 11,
              fontSize: 14.5,
              fontWeight: isActive ? 700 : 600,
              // Filled, not tinted. The tint plus a separate left bar was two
              // markers saying one thing, and neither of them loudly.
              ...(isActive ? { color: '#fff', background: C.brandBg } : null),
              boxShadow: isActive ? C.shadow : 'none',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} size={20} />
                {/* Its own element so it can move with the icon on hover — a bare
                    text node cannot be transformed. */}
                <span className="side-label">{t[item.key] || item.key}</span>
                {item.path === '/task-board' && fixCount > 0 && (
                  <span style={{
                    marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
                    // On the filled row the brand background would be the same
                    // colour as the row it sits on, so the badge disappears.
                    background: isActive ? 'rgba(255,255,255,0.24)' : C.brandBg,
                    color: '#fff', fontSize: 11.5, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  }}>
                    {fixCount > 99 ? '99+' : fixCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        {/* language toggle */}
        <button
          onClick={toggleLang}
          className="side-link"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            padding: '11px 13px', borderRadius: 11, fontSize: 14.5, fontWeight: 600,
            border: 'none', cursor: 'pointer',
          }}
        >
          <Icon name="globe" size={20} />
          <span className="side-label">{lang === 'en' ? 'हिंदी में देखें' : 'View in English'}</span>
        </button>

        {/* Who is signed in, and the way out. The way out used to be on the
            Account page only, which is two taps and a screen away from a
            question people ask at the door. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 8px 2px', borderTop: `1px solid ${C.border}`,
        }}>
          <span style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 800,
            ...avatarTint(user?.id || user?.name, C),
          }}>
            {initials(personName(user, lang) || user?.name)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 700, color: C.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {personName(user, lang)}
            </div>
            <div style={{ fontSize: 12, color: C.faint }}>{roleLabels(t)[user?.role] || ''}</div>
            {/* the team they head — repair requests for this department route to them */}
            {user?.department && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: DEPARTMENT_MAP[user.department]?.color || C.brandBg,
                }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.tl }}>
                  {deptName(user.department, lang)}
                  {isAdminRole(user?.role) ? ` · ${t.headLabel}` : ''}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            title={t.logout}
            aria-label={t.logout}
            className="side-link"
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 9,
              display: 'grid', placeItems: 'center',
              border: `1px solid ${C.border}`, cursor: 'pointer',
            }}
          >
            <Icon name="power" size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
