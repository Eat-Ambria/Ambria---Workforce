import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import {
  ROLES, ASSIGNABLE_ROLES, DEPARTMENTS, DEPARTMENT_MAP, DESIGNATIONS, PROPERTIES, PROPERTY_MAP, propName, deptName, personName, shiftLabel,
} from '../../constants/org'
import { navForRole, alwaysVisibleFor } from '../../constants/nav'
import { normalizePhone, typedPhone, isValidPhone } from '../../lib/phone'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Field, inputStyle, filterStyle, FilterField } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import MultiSelect from '../../components/common/MultiSelect'
import Icon from '../../components/common/Icon'

// Straight off ASSIGNABLE_ROLES. This screen used to keep its own hardcoded
// list of three, so adding a fourth role to org.js left the picker showing three
// — the role existed everywhere except the one screen that assigns it.
const roleLabel = (role, t) => ({
  [ROLES.SUPER_ADMIN]: t.roleSuperAdmin,
  [ROLES.ADMIN]: t.roleAdmin,
  [ROLES.EMPLOYEE]: t.roleEmployee,
  [ROLES.VALET]: t.roleValet,
}[role] || role)
const roleTone = (role, C) => ({
  [ROLES.SUPER_ADMIN]: C.maroon,
  [ROLES.ADMIN]: C.indigo,
  [ROLES.VALET]: C.cyan || C.purple,
}[role] || C.blue)

// default set of visible tab paths for a role
const seedAccess = (role) => new Set(navForRole(role).map((i) => i.path))

export default function Users() {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()

  const PAGE_SIZE = 25

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [q, setQ] = useState('')            // raw search input
  const [debouncedQ, setDebouncedQ] = useState('') // applied after typing settles
  const [deptSel, setDeptSel] = useState([])     // selected department codes
  const [propSel, setPropSel] = useState([])     // selected property codes
  const [roleSel, setRoleSel] = useState([])     // selected role codes
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState(null) // user object, or 'new'
  // Deactivated people are kept forever (their name is on old tasks) but they
  // are not staff any more, so they are a separate list rather than greyed-out
  // rows mixed into the working one.
  const [showInactive, setShowInactive] = useState(false)
  const [inactiveCount, setInactiveCount] = useState(0)

  // options for the multi-select dropdowns ({ value, label })
  const deptOptions = useMemo(() => DEPARTMENTS.map((d) => ({ value: d.code, label: deptName(d.code, lang) })), [lang])
  const propOptions = useMemo(() => PROPERTIES.map((p) => ({ value: p.code, label: p.name })), [])
  const roleOptions = useMemo(() => ASSIGNABLE_ROLES.map((r) => ({ value: r, label: roleLabel(r, t) })), [t])

  // debounce the search box so we don't hit the DB on every keystroke
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedQ(q.trim()); setPage(0) }, 300)
    return () => clearTimeout(id)
  }, [q])

  const load = useCallback(async () => {
    setListLoading(true)
    let query = supabase
      .from('users')
      .select('id, username, name, name_hi, role, property, department, shift, phone, designation, is_active, access', { count: 'exact' })
    // one list or the other, never both. is_active is NULL on rows created
    // before the column existed — those are working accounts, not disabled ones.
    query = showInactive
      ? query.eq('is_active', false)
      : query.or('is_active.is.null,is_active.eq.true')
    // filters combine (AND): role, department, property, search
    if (roleSel.length) query = query.in('role', roleSel)
    if (deptSel.length) query = query.in('department', deptSel)
    // an "All Properties" user (property='all') belongs to every property,
    // so always include them alongside the specifically-selected ones.
    if (propSel.length) query = query.or(`property.in.(${propSel.join(',')}),property.eq.all`)
    if (debouncedQ) {
      const like = `%${debouncedQ}%`
      query = query.or(`name.ilike.${like},username.ilike.${like},designation.ilike.${like}`)
    }
    const from = page * PAGE_SIZE
    const { data, count } = await query.order('name').range(from, from + PAGE_SIZE - 1)
    setRows(data || [])
    setTotal(count || 0)
    // the badge on the toggle — counted unfiltered, so it always answers "how
    // many disabled accounts are there", not "…that match the current search"
    const { count: off } = await supabase
      .from('users').select('id', { count: 'exact', head: true }).eq('is_active', false)
    setInactiveCount(off || 0)
    setListLoading(false)
    setLoading(false)
  }, [roleSel, deptSel, propSel, debouncedQ, page, showInactive])

  useEffect(() => { load() }, [load])

  const changeRole = (v) => { setRoleSel(v); setPage(0) }
  const changeDept = (v) => { setDeptSel(v); setPage(0) }
  const changeProp = (v) => { setPropSel(v); setPage(0) }
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // only offer Clear when something is actually filtering the list
  const filtered = !!(q || roleSel.length || deptSel.length || propSel.length)
  function clearFilters() {
    setQ('')
    setDebouncedQ('') // apply immediately instead of waiting out the 300ms debounce
    setRoleSel([])
    setDeptSel([])
    setPropSel([])
    setPage(0)
  }

  if (loading) return <Loader label={t.loading} />

  return (
    <div>
      <SectionTitle
        right={<Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} style={{ marginRight: 4 }} />{t.newLabel}</Button>}
      >
        {showInactive ? t.inactiveUsers : t.userManagement}
      </SectionTitle>

      {/* the two lists are exclusive — this switches between them */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => { setShowInactive((v) => !v); setPage(0) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '0 13px', height: 32, borderRadius: 999,
            background: showInactive ? C.rBg : C.card,
            border: `1px solid ${showInactive ? C.red : C.border}`,
            color: showInactive ? C.red : C.tl, fontSize: 12.5, fontWeight: 600,
          }}
        >
          {showInactive ? t.showActive : t.showInactive}
          {!showInactive && inactiveCount > 0 && (
            <span style={{ background: C.rBg, color: C.red, borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 800 }}>
              {inactiveCount}
            </span>
          )}
        </button>
        {showInactive && <span style={{ fontSize: 12.5, color: C.tl }}>{t.inactiveUsersHint}</span>}
      </div>

      {/* Search on its own line — it is typed into, and half a phone width is
          not enough to read back what you typed. The icon sits inside the
          field: a text box has no vocabulary of its own to announce itself
          with, which is why the three dropdowns below need no icons. */}
      <div style={{ position: 'relative', maxWidth: 380, marginBottom: 10 }}>
        <Icon
          name="search"
          size={15}
          color={C.faint}
          style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          style={{ ...filterStyle(C), paddingLeft: 34 }}
          placeholder={t.searchNameUser}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.searchNameUser}
        />
      </div>

      {/* Captioned, so each one still says what it controls after you have
          chosen something: "All roles" becomes "Site Head" and takes the word
          "roles" with it. Two columns on a phone, one row on a desktop. */}
      <div style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        <FilterField label={t.role}>
          <MultiSelect C={C} minWidth={0} placeholder={t.all} options={roleOptions} selected={roleSel} onChange={changeRole} />
        </FilterField>
        <FilterField label={t.department}>
          <MultiSelect C={C} minWidth={0} placeholder={t.all} options={deptOptions} selected={deptSel} onChange={changeDept} />
        </FilterField>
        <FilterField label={t.properties}>
          <MultiSelect C={C} minWidth={0} placeholder={t.all} options={propOptions} selected={propSel} onChange={changeProp} />
        </FilterField>
      </div>

      {/* Only once something is filtered, and on its own line at the right —
          in the row above it was a fourth cell with no caption, sitting a
          caption's height out of line with the three that had one. */}
      {filtered && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            onClick={clearFilters}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: C.card, border: `1px solid ${C.border}`,
              color: C.tl, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            <Icon name="close" size={14} color={C.tl} /> {t.clearFilters}
          </button>
        </div>
      )}

      {listLoading && rows.length === 0 ? (
        <Loader label={t.loading} />
      ) : rows.length === 0 ? (
        <EmptyState icon="team" title={showInactive ? t.noInactiveUsers : t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12, opacity: listLoading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {rows.map((u) => {
            const tone = roleTone(u.role, C)
            return (
              <Card key={u.id} onClick={() => setEditing(u)} style={{ cursor: 'pointer', borderLeft: `4px solid ${tone}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{personName(u, lang)}</span>
                      <span style={{ fontSize: 12, color: C.faint }}>@{u.username}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 3 }}>
                      {u.designation ? `${u.designation} · ` : ''}
                      {deptName(u.department, lang) || '—'}
                      {u.shift ? ` · ${shiftLabel(u.shift, lang)}` : ''}
                      {' · '}
                      {propName(u.property, lang)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <Badge color={tone} bg={C.cardAlt}>{roleLabel(u.role, t)}</Badge>
                    {u.is_active === false && <Badge color={C.red} bg={C.rBg}>{t.inactive}</Badge>}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 16 }}>
          <Button variant="ghost" disabled={page <= 0 || listLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <Icon name="chevronRight" size={16} style={{ transform: 'rotate(180deg)' }} /> {t.prev || 'Prev'}
          </Button>
          <span style={{ fontSize: 13, color: C.tl, fontWeight: 600 }}>{page + 1} / {pageCount}</span>
          <Button variant="ghost" disabled={page >= pageCount - 1 || listLoading} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            {t.next || 'Next'} <Icon name="chevronRight" size={16} />
          </Button>
        </div>
      )}

      {editing && (
        <UserModal
          key={editing === 'new' ? 'new' : editing.id}
          record={editing === 'new' ? null : editing}
          currentUserId={user.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function UserModal({ record, currentUserId, onClose, onSaved }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const isNew = !record
  const isSelf = !isNew && record.id === currentUserId

  const [form, setForm] = useState(() => ({
    name: record?.name || '',
    name_hi: record?.name_hi || '',
    username: record?.username || '',
    password: '',
    role: record?.role || ROLES.EMPLOYEE,
    property: record?.property || 'pp',
    department: record?.department || '',
    designation: record?.designation || '',
    phone: record?.phone || '',
    is_active: record?.is_active !== false,
  }))
  // visible tabs (paths). Seed from stored access, else the role's full default set.
  const [access, setAccess] = useState(() => {
    const stored = Array.isArray(record?.access) ? record.access : []
    if (stored.length) return new Set(stored)
    return seedAccess(record?.role || ROLES.EMPLOYEE)
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(!isNew) // fetching the current password
  const loadedPwRef = useRef('') // the stored PIN as loaded — used to detect changes
  const [fixStats, setFixStats] = useState(null)     // fix-request history for this staff
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // changing the role reseeds the default visible tabs for that role
  function changeRole(e) {
    const role = e.target.value
    setForm((f) => ({ ...f, role }))
    setAccess(seedAccess(role))
  }

  // load the existing password so the admin can view it / reset a forgotten one
  useEffect(() => {
    if (isNew) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('users').select('password').eq('id', record.id).single()
      if (alive) {
        loadedPwRef.current = data?.password || ''
        setForm((f) => ({ ...f, password: data?.password || '' }))
        setPwLoading(false)
      }
    })()
    return () => { alive = false }
  }, [isNew, record])

  // load this staff member's fix-request history (completed fixes + avg rating)
  useEffect(() => {
    if (isNew) return
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('work_board')
        .select('rating')
        .eq('assigned_to', record.id)
        .in('status', ['completed', 'approved'])
      if (!alive) return
      const rows = data || []
      const rated = rows.filter((r) => r.rating > 0)
      const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0
      setFixStats({ total: rows.length, rated: rated.length, avg })
    })()
    return () => { alive = false }
  }, [isNew, record])

  // candidate tabs depend on the selected role
  const candidateTabs = useMemo(() => navForRole(form.role), [form.role])

  const toggleTab = (path) => {
    setAccess((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function save() {
    if (!form.name.trim()) { setErr(`${t.fullName} ${t.isRequired}`); return }
    if (!form.username.trim()) { setErr(`${t.username} ${t.isRequired}`); return }
    // the phone IS a login credential (username or phone + PIN), so it is not
    // optional any more — an account without one can only be reached one way
    if (!form.phone.trim()) { setErr(`${t.phone} ${t.isRequired}`); return }
    if (!isValidPhone(form.phone)) { setErr(t.phoneRule); return }
    if (!form.password) { setErr(t.pinRule || 'PIN must be exactly 4 digits'); return }
    // enforce a 4-digit PIN whenever it's newly set or changed (existing
    // non-PIN passwords keep working until the admin edits them)
    const pwChanged = isNew || form.password !== loadedPwRef.current
    if (pwChanged && !/^\d{4}$/.test(form.password)) { setErr(t.pinRule || 'PIN must be exactly 4 digits'); return }
    setBusy(true); setErr('')

    // Keep the role's own un-removable tab visible, and store only tabs valid
    // for the chosen role. For the valet role that pinned tab is Valet, not
    // Dashboard — writing Dashboard into their access list would offer them a
    // page their role cannot open.
    const validPaths = new Set(candidateTabs.map((i) => i.path))
    const accessList = [...new Set([...alwaysVisibleFor(form.role), ...[...access].filter((p) => validPaths.has(p))])]

    const base = {
      name: form.name.trim(),
      name_hi: form.name_hi.trim() || null,
      username: form.username.trim().toLowerCase(),
      role: form.role,
      property: form.property,
      department: form.department || null,
      // shift is deliberately absent: the roster owns it, and sending it from
      // here would wipe it on every unrelated edit to a person's record
      designation: form.designation || null,
      phone: normalizePhone(form.phone), // canonical form so login matches any format
      is_active: form.is_active,
      access: accessList,
    }

    let error
    if (isNew) {
      const id = newId('u_')
      ;({ error } = await supabase.from('users').insert({ ...base, id, password: form.password, joining_date: todayISO() }))
    } else {
      ;({ error } = await supabase.from('users').update({ ...base, password: form.password }).eq('id', record.id))
    }

    setBusy(false)
    if (error) {
      const m = error.message || ''
      if (/(duplicate|unique)/i.test(m) && /phone/i.test(m)) setErr(t.phoneInUse || 'That phone number is already in use')
      else if (/(duplicate|unique)/i.test(m)) setErr('That username is already taken')
      else setErr(m)
      return
    }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={isNew ? t.newUser : form.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t.fullName}><input style={inputStyle(C)} value={form.name} onChange={set('name')} /></Field>
        </div>
        <div style={{ flex: 1 }}>
          {/* typed by hand — machine translation mangles names ("Mali" -> gardener) */}
          <Field label={`${t.fullName} (हिंदी)`} hint={t.nameHiHint}>
            <input style={inputStyle(C)} value={form.name_hi} onChange={set('name_hi')} placeholder="जैसे सोनू माली" />
          </Field>
        </div>
      </div>

      {/* fix-request history for this staff member */}
      {!isNew && fixStats && fixStats.total > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fixStats.total}</div>
            <div style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>{t.fixesCompleted}</div>
          </div>
          <div style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="star" size={18} color={C.yellow} fill={fixStats.rated ? C.yellow : 'none'} />
              <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fixStats.rated ? fixStats.avg.toFixed(1) : '—'}</span>
            </div>
            <div style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>Avg rating ({fixStats.rated} rated)</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label={t.username} hint={t.usernameOrPhoneHint || 'Login: username or phone + 4-digit PIN'}><input style={inputStyle(C)} value={form.username} onChange={set('username')} autoCapitalize="none" /></Field></div>
        <div style={{ flex: 1 }}>
          <Field label={t.pinLabel || 'PIN (4 digits)'} hint={isNew ? undefined : (t.pinResetHint || 'Current PIN — edit to reset')}>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                style={{ ...inputStyle(C), paddingRight: 42 }}
                value={form.password}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder={pwLoading ? 'Loading…' : '••••'}
                disabled={pwLoading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', color: C.tl, display: 'grid', placeItems: 'center', padding: 6, lineHeight: 0 }}
              >
                <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} color={C.tl} />
              </button>
            </div>
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t.role}>
            <select style={inputStyle(C)} value={form.role} onChange={changeRole} disabled={isSelf}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, t)}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t.properties || 'Property'}>
            <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
              {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
              <option value="all">{t.allProps}</option>
            </select>
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label={t.department}>
            <select style={inputStyle(C)} value={form.department} onChange={set('department')}>
              <option value="">—</option>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{deptName(d.code, lang)}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label={t.designation} hint={t.designationHeadHint}>
            <input
              style={inputStyle(C)}
              value={form.designation}
              onChange={set('designation')}
              list="designation-options"
              placeholder={t.designationPlaceholder}
            />
            {/* suggestions, not a fixed list — an unusual title can still be typed */}
            <datalist id="designation-options">
              {DESIGNATIONS.map((d) => <option key={d} value={d} />)}
            </datalist>
          </Field></div>
      </div>

      {/* Top-aligned, like every other pair on this form: the phone's hint sits
          below its own input instead of pushing the Active toggle out of line. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label={t.phone} required hint={t.phoneRule}>
            <input
              style={inputStyle(C)}
              value={form.phone}
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder={t.phonePlaceholder}
              onChange={(e) => setForm((f) => ({ ...f, phone: typedPhone(e.target.value) }))}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t.active} hint={form.is_active ? t.canLogInHint : t.cannotLogInHint}>
            <button
              type="button"
              onClick={() => !isSelf && setForm((f) => ({ ...f, is_active: !f.is_active }))}
              disabled={isSelf}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: form.is_active ? C.gBg : C.cardAlt, color: form.is_active ? C.green : C.tl,
                border: `1px solid ${form.is_active ? C.green : C.border}`, borderRadius: 10, padding: '11px 13px',
                // matches inputStyle so the control lines up with the phone box
                fontSize: 15, fontWeight: 600, opacity: isSelf ? 0.6 : 1, cursor: isSelf ? 'not-allowed' : 'pointer',
              }}
            >
              <Icon name={form.is_active ? 'check' : 'close'} size={16} color={form.is_active ? C.green : C.tl} />
              {form.is_active ? t.canLogIn : t.loginDisabled}
            </button>
          </Field>
        </div>
      </div>

      {/* which left-side tabs this user can see */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: 8 }}>{t.visibleTabs}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {candidateTabs.map((item) => {
            const fixed = alwaysVisibleFor(form.role).includes(item.path)
            const on = fixed || access.has(item.path)
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => !fixed && toggleTab(item.path)}
                disabled={fixed}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  background: on ? C.maroonSoft : C.cardAlt, color: on ? C.maroon : C.tl,
                  border: `1px solid ${on ? C.maroon : C.border}`, borderRadius: 10, padding: '10px 12px',
                  fontSize: 14, fontWeight: 600, cursor: fixed ? 'default' : 'pointer', opacity: fixed ? 0.75 : 1,
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${on ? C.brandBg : C.border}`, background: on ? C.brandBg : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {on && <Icon name="check" size={13} color="#fff" />}
                </span>
                <Icon name={item.icon} size={17} />
                {t[item.key] || item.key}
                {fixed && <span style={{ fontSize: 11, color: C.faint, marginLeft: 'auto' }}>always on</span>}
              </button>
            )
          })}
        </div>
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{err}</div>}
    </Modal>
  )
}
