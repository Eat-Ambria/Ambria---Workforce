import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizePhone, looksLikePhone } from '../lib/phone'
import { syncSubscription, releaseSubscription } from '../lib/push'

const AuthContext = createContext(null)
const STORAGE_KEY = 'ambria_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // restore session: localStorage = "remembered" (persists), sessionStorage = this tab only
  useEffect(() => {
    let saved = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY)
      if (raw) saved = JSON.parse(raw)
    } catch {
      /* ignore corrupt storage */
    }
    if (!saved) { setLoading(false); return }
    setUser(saved) // show immediately from cache
    syncSubscription(saved.id) // make sure this device is bound to the restored user

    // then refresh from the DB so admin-side changes (visible tabs, role,
    // active status, profile edits) take effect on the next app open
    ;(async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, username, name, role, property, department, phone, joining_date, is_active, left_date, designation, access, created_at')
          .eq('id', saved.id)
          .single()
        if (data) {
          if (data.is_active === false) { logout() }
          else {
            const { password: _pw, ...fresh } = data
            setUser(fresh)
            const store = localStorage.getItem(STORAGE_KEY) ? localStorage : sessionStorage
            store.setItem(STORAGE_KEY, JSON.stringify(fresh))
          }
        }
      } catch {
        /* offline / transient — keep the cached user */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // persist a logged-in user to state + the chosen storage
  function finishLogin(safeUser, remember) {
    setUser(safeUser)
    // claim this device's push subscription for the user just logged in, so a
    // shared device stops delivering the previous user's notifications
    syncSubscription(safeUser.id)
    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser))
      sessionStorage.removeItem(STORAGE_KEY)
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser))
      localStorage.removeItem(STORAGE_KEY)
    }
    return { ok: true, user: safeUser }
  }

  // Login works with EITHER auth setup, and accepts a username OR a phone number
  // as the identifier:
  //  1) Secure: the verify_login() RPC (present once SUPABASE-MIGRATION-AUTH-SECURITY
  //     is applied — passwords are bcrypt-hashed and the column is hidden).
  //     NOTE: the RPC matches by username only; phone login relies on path 2.
  //  2) Legacy: a direct plain-text query (before that migration is applied).
  async function login(identifier, password, remember = true) {
    const idRaw = (identifier || '').trim()
    const idLower = idRaw.toLowerCase()
    const pw = password || ''

    // 1) try the server-side verifier; trust it only when it returns a user,
    //    so a phone-number login still falls through to path 2 below.
    const rpc = await supabase.rpc('verify_login', { p_username: idLower, p_password: pw })
    if (!rpc.error && rpc.data) {
      if (rpc.data.is_active === false) return { ok: false, reason: 'inactive' }
      return finishLogin(rpc.data, remember) // RPC already omits the password
    }

    // 2) legacy plain-text check — match by username OR (normalized) phone
    let q = supabase.from('users').select('*')
    const phoneId = normalizePhone(idRaw)
    if (looksLikePhone(idRaw)) q = q.or(`username.eq.${idLower},phone.eq.${phoneId}`)
    else q = q.eq('username', idLower)
    const { data, error } = await q.eq('password', pw).limit(1)

    if (error) return { ok: false, reason: 'error', error }
    const row = data && data[0]
    if (!row) return { ok: false, reason: 'invalid' }
    if (row.is_active === false) return { ok: false, reason: 'inactive' }

    const { password: _pw, ...safeUser } = row
    return finishLogin(safeUser, remember)
  }

  function logout() {
    // stop this device from receiving the logged-out user's pushes
    releaseSubscription()
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
  }

  // Merge a patch into the current user + whichever storage holds them, so
  // self-service profile edits (phone) reflect immediately without a reload.
  function updateUser(patch) {
    setUser((u) => {
      if (!u) return u
      const next = { ...u, ...patch }
      const store = localStorage.getItem(STORAGE_KEY) ? localStorage
        : sessionStorage.getItem(STORAGE_KEY) ? sessionStorage : null
      store?.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const value = { user, loading, login, logout, updateUser, isAuthed: !!user }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
