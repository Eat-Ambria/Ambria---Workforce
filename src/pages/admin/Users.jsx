import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { newId } from '../../lib/id'
import { todayISO } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import {
  ROLES, DEPARTMENTS, DEPARTMENT_MAP, PROPERTIES, PROPERTY_MAP,
} from '../../constants/org'
import { navForRole, ALWAYS_VISIBLE } from '../../constants/nav'
import { normalizePhone } from '../../lib/phone'
import { Card, Loader, EmptyState, Button, Badge, SectionTitle, Field, inputStyle } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import MultiSelect from '../../components/common/MultiSelect'
import Icon from '../../components/common/Icon'

const ROLE_OPTIONS = [
  { value: ROLES.EMPLOYEE, label: 'Employee' },
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.SUPER_ADMIN, label: 'Super Admin' },
]
const ROLE_LABEL = ROLE_OPTIONS.reduce((m, r) => ({ ...m, [r.value]: r.label }), {})
const roleTone = (role, C) => (role === ROLES.SUPER_ADMIN ? C.maroon : role === ROLES.ADMIN ? C.indigo : C.blue)

// designation marker that identifies an Admin who is a department head
const DEPT_HEAD_TITLE = 'Department Head'

// default set of visible tab paths for a role
const seedAccess = (role) => new Set(navForRole(role).map((i) => i.path))

export default function Users() {
  const C = useColors()
  const t = useT()
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

  // options for the multi-select dropdowns ({ value, label })
  const deptOptions = useMemo(() => DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })), [])
  const propOptions = useMemo(() => PROPERTIES.map((p) => ({ value: p.code, label: p.name })), [])
  const roleOptions = useMemo(() => ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })), [])

  // debounce the search box so we don't hit the DB on every keystroke
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedQ(q.trim()); setPage(0) }, 300)
    return () => clearTimeout(id)
  }, [q])

  const load = useCallback(async () => {
    setListLoading(true)
    let query = supabase
      .from('users')
      .select('id, username, name, role, property, department, phone, designation, is_active, access', { count: 'exact' })
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
    setListLoading(false)
    setLoading(false)
  }, [roleSel, deptSel, propSel, debouncedQ, page])

  useEffect(() => { load() }, [load])

  const changeRole = (v) => { setRoleSel(v); setPage(0) }
  const changeDept = (v) => { setDeptSel(v); setPage(0) }
  const changeProp = (v) => { setPropSel(v); setPage(0) }
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (loading) return <Loader label={t.loading} />

  return (
    <div>
      <SectionTitle
        right={<Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} style={{ marginRight: 4 }} />New</Button>}
      >
        {t.userManagement}
      </SectionTitle>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle(C), flex: 2, minWidth: 200 }}
          placeholder={`${t.search || 'Search'} — name, username`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <MultiSelect C={C} placeholder="All roles" options={roleOptions} selected={roleSel} onChange={changeRole} />
        <MultiSelect C={C} placeholder="All departments" options={deptOptions} selected={deptSel} onChange={changeDept} />
        <MultiSelect C={C} placeholder="All properties" options={propOptions} selected={propSel} onChange={changeProp} />
      </div>

      {listLoading && rows.length === 0 ? (
        <Loader label={t.loading} />
      ) : rows.length === 0 ? (
        <EmptyState icon="team" title={t.noData} />
      ) : (
        <div style={{ display: 'grid', gap: 12, opacity: listLoading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {rows.map((u) => {
            const tone = roleTone(u.role, C)
            return (
              <Card key={u.id} onClick={() => setEditing(u)} style={{ cursor: 'pointer', borderLeft: `4px solid ${tone}`, opacity: u.is_active === false ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{u.name}</span>
                      <span style={{ fontSize: 12, color: C.faint }}>@{u.username}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.tl, marginTop: 3 }}>
                      {u.designation ? `${u.designation} · ` : ''}
                      {DEPARTMENT_MAP[u.department]?.name || u.department || '—'}
                      {' · '}
                      {PROPERTY_MAP[u.property]?.name || u.property}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <Badge color={tone} bg={C.cardAlt}>{ROLE_LABEL[u.role] || u.role}</Badge>
                    {u.is_active === false && <Badge color={C.red} bg={C.rBg}>Inactive</Badge>}
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
  const isNew = !record
  const isSelf = !isNew && record.id === currentUserId

  const [form, setForm] = useState(() => ({
    name: record?.name || '',
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
  // a "Department Head" is a staff member given full Admin access (not super admin)
  const [deptHead, setDeptHead] = useState(() => record?.designation === DEPT_HEAD_TITLE)
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

  // toggling Department Head elevates the user to the Admin role (full admin tabs)
  function toggleDeptHead() {
    setDeptHead((prev) => {
      const next = !prev
      if (next) {
        // elevate to Admin with full admin tabs
        setForm((f) => ({ ...f, role: ROLES.ADMIN, designation: DEPT_HEAD_TITLE }))
        setAccess(seedAccess(ROLES.ADMIN))
      } else {
        // revert to a normal Employee with employee tabs
        setForm((f) => ({ ...f, role: ROLES.EMPLOYEE, designation: f.designation === DEPT_HEAD_TITLE ? '' : f.designation }))
        setAccess(seedAccess(ROLES.EMPLOYEE))
      }
      return next
    })
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
    if (!form.name.trim()) { setErr(t.required); return }
    if (!form.username.trim()) { setErr(t.required); return }
    if (!form.password) { setErr(t.pinRule || 'PIN must be exactly 4 digits'); return }
    // enforce a 4-digit PIN whenever it's newly set or changed (existing
    // non-PIN passwords keep working until the admin edits them)
    const pwChanged = isNew || form.password !== loadedPwRef.current
    if (pwChanged && !/^\d{4}$/.test(form.password)) { setErr(t.pinRule || 'PIN must be exactly 4 digits'); return }
    setBusy(true); setErr('')

    // always keep dashboard visible; store only tabs valid for the chosen role
    const validPaths = new Set(candidateTabs.map((i) => i.path))
    const accessList = [...new Set([...ALWAYS_VISIBLE, ...[...access].filter((p) => validPaths.has(p))])]

    const base = {
      name: form.name.trim(),
      username: form.username.trim().toLowerCase(),
      role: form.role,
      property: form.property,
      department: form.department || null,
      designation: form.designation || null,
      phone: normalizePhone(form.phone) || null, // canonical form so login matches any format
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
      open onClose={onClose} title={isNew ? 'New User' : form.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      <Field label="Name"><input style={inputStyle(C)} value={form.name} onChange={set('name')} /></Field>

      {/* fix-request history for this staff member */}
      {!isNew && fixStats && fixStats.total > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fixStats.total}</div>
            <div style={{ fontSize: 12, color: C.tl, fontWeight: 600 }}>Fixes completed</div>
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
        <div style={{ flex: 1 }}><Field label="Username" hint={t.usernameOrPhoneHint || 'Login: username or phone + 4-digit PIN'}><input style={inputStyle(C)} value={form.username} onChange={set('username')} autoCapitalize="none" /></Field></div>
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
          <Field label="Role" hint={deptHead ? 'Set by Department Head' : undefined}>
            <select style={inputStyle(C)} value={form.role} onChange={changeRole} disabled={isSelf || deptHead}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t.properties || 'Property'}>
            <select style={inputStyle(C)} value={form.property} onChange={set('property')}>
              {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              <option value="all">All Properties</option>
            </select>
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Department">
            <select style={inputStyle(C)} value={form.department} onChange={set('department')}>
              <option value="">—</option>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="Designation"><input style={inputStyle(C)} value={form.designation} onChange={set('designation')} disabled={deptHead} /></Field></div>
      </div>

      {/* elevate a staff member to Department Head → full Admin access */}
      <Field label="">
        <button
          type="button"
          onClick={() => !isSelf && toggleDeptHead()}
          disabled={isSelf}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            background: deptHead ? C.maroonSoft : C.cardAlt, color: deptHead ? C.maroon : C.tl,
            border: `1px solid ${deptHead ? C.maroon : C.border}`, borderRadius: 10, padding: '11px 13px',
            fontSize: 14, fontWeight: 600, opacity: isSelf ? 0.6 : 1, cursor: isSelf ? 'not-allowed' : 'pointer',
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${deptHead ? C.maroon : C.border}`, background: deptHead ? C.maroon : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {deptHead && <Icon name="check" size={13} color="#fff" />}
          </span>
          <span>
            Department Head
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: deptHead ? C.maroon : C.faint }}>Grants full Admin access (not super admin)</span>
          </span>
        </button>
      </Field>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><Field label="Phone"><input style={inputStyle(C)} value={form.phone} onChange={set('phone')} /></Field></div>
        <div style={{ flex: 1 }}>
          <Field label="Active">
            <button
              type="button"
              onClick={() => !isSelf && setForm((f) => ({ ...f, is_active: !f.is_active }))}
              disabled={isSelf}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: form.is_active ? C.gBg : C.cardAlt, color: form.is_active ? C.green : C.tl,
                border: `1px solid ${form.is_active ? C.green : C.border}`, borderRadius: 10, padding: '11px 13px',
                fontSize: 14, fontWeight: 600, opacity: isSelf ? 0.6 : 1, cursor: isSelf ? 'not-allowed' : 'pointer',
              }}
            >
              <Icon name={form.is_active ? 'check' : 'close'} size={16} color={form.is_active ? C.green : C.tl} />
              {form.is_active ? 'Can log in' : 'Disabled'}
            </button>
          </Field>
        </div>
      </div>

      {/* which left-side tabs this user can see */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tl, marginBottom: 8 }}>Visible tabs</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {candidateTabs.map((item) => {
            const fixed = ALWAYS_VISIBLE.includes(item.path)
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
                <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${on ? C.maroon : C.border}`, background: on ? C.maroon : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
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
