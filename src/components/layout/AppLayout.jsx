import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { useIsMobile } from '../../hooks/useMediaQuery'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppLayout() {
  const C = useColors()
  const isMobile = useIsMobile()
  const { lang } = useLang()
  const { user } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // keep the user's language in the DB so server-sent push can be localized
  useEffect(() => {
    if (user?.id) supabase.from('users').update({ lang }).eq('id', user.id).then(() => {})
  }, [lang, user?.id])

  // close the mobile drawer whenever the route changes
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text }}>
      {!isMobile && <Sidebar />}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header showBrand={isMobile} onMenu={isMobile ? () => setDrawerOpen(true) : undefined} />
        <main
          className="no-scrollbar"
          style={{
            flex: 1,
            padding: 16,
            paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom, 0px))' : 24,
            maxWidth: 1100,
            width: '100%',
            margin: '0 auto',
          }}
        >
          <Outlet />
        </main>
      </div>

      {/* mobile slide-out sidebar drawer (replaces the bottom tab bar) */}
      {isMobile && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600,
              opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
              transition: 'opacity .2s ease',
            }}
          />
          <div
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: '80%', maxWidth: 300, zIndex: 700,
              transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform .25s ease',
              boxShadow: drawerOpen ? C.shadowLg : 'none',
            }}
          >
            <Sidebar mobile onNavigate={() => setDrawerOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
