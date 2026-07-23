import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { useIsMobile } from '../../hooks/useMediaQuery'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomTabBar from './BottomTabBar'

export default function AppLayout() {
  const C = useColors()
  const isMobile = useIsMobile()
  const { lang } = useLang()
  const { user } = useAuth()

  // keep the user's language in the DB so server-sent push can be localized
  useEffect(() => {
    if (user?.id) supabase.from('users').update({ lang }).eq('id', user.id).then(() => {})
  }, [lang, user?.id])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text }}>
      {!isMobile && <Sidebar />}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header showBrand={isMobile} />
        <main
          className="no-scrollbar"
          style={{
            flex: 1,
            padding: 16,
            paddingBottom: isMobile ? 84 : 24,
            maxWidth: 1100,
            width: '100%',
            margin: '0 auto',
          }}
        >
          <Outlet />
        </main>
        {isMobile && <BottomTabBar />}
      </div>
    </div>
  )
}
