import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { isAdminRole } from '../../constants/org'
import { SectionTitle, Tabs } from '../../components/common/UI'
import Videos from './training/Videos'
import ChemicalUsage from './training/ChemicalUsage'
import FireSafety from './training/FireSafety'
import StaffProgress from './training/StaffProgress'

export default function Training() {
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const admin = isAdminRole(user?.role)

  const tabs = [
    { key: 'videos', label: t.videos },
    { key: 'chemical', label: t.chemicalUsage },
    ...(admin ? [
      { key: 'progress', label: lang === 'hi' ? 'स्टाफ़ प्रगति' : 'Staff Progress' },
      { key: 'fire', label: t.fireSafety },
    ] : []),
  ]
  // allow deep-linking to a tab (e.g. from the dashboard Fire Safety widget)
  const location = useLocation()
  const preset = location.state?.tab
  const [tab, setTab] = useState(tabs.some((x) => x.key === preset) ? preset : 'videos')

  return (
    <div>
      <SectionTitle>{t.training}</SectionTitle>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'videos' && <Videos />}
      {tab === 'chemical' && <ChemicalUsage />}
      {tab === 'progress' && admin && <StaffProgress />}
      {tab === 'fire' && admin && <FireSafety />}
    </div>
  )
}
