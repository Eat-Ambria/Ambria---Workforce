import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayISO, nowISO } from '../../lib/time'
import { useColors } from '../../context/ThemeContext'
import { useT } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { PROPERTIES, PROPERTY_MAP, canSeeAllProperties } from '../../constants/org'
import { allocateValet, MAX_GUESTS, VALET_MATRIX } from '../../constants/valetMatrix'
import { Card, Loader, Button, Badge, SectionTitle, Tabs, EmptyState, Field, inputStyle, Spinner } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { lmsVenueContracts, lmsDateToIso, LMS_VENUE_BY_PROP, PROP_BY_LMS_VENUE } from '../../lib/lms'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// digits only; '' stays '' so the field can be cleared
const digitsOnly = (v) => (v == null ? '' : String(v).replace(/\D/g, ''))
const overGuestLimit = (v) => Number(v) > MAX_GUESTS

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
function fmtLong(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export default function Valet() {
  const C = useColors()
  const t = useT()
  const { user } = useAuth()

  const scopeAll = canSeeAllProperties(user)
  const visibleProps = scopeAll ? PROPERTIES : PROPERTIES.filter((p) => p.code === user?.property)
  const defaultProp = user?.property && user.property !== 'all' ? user.property : (visibleProps[0]?.code || 'pp')

  const [view, setView] = useState('calendar')
  const today = todayISO()
  const [ty, tmn, td] = today.split('-').map(Number) // tmn is 1-based
  // bookings are allowed from today up to exactly one year ahead
  const maxDate = `${ty + 1}-${pad(tmn)}-${pad(td)}`
  const minMonth = { y: ty, m: tmn - 1 }
  const maxMonth = { y: ty + 1, m: tmn - 1 }
  const [month, setMonth] = useState(() => ({ y: ty, m: tmn - 1 }))
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [propFilter, setPropFilter] = useState(scopeAll ? 'all' : defaultProp)
  const [selectedDate, setSelectedDate] = useState(null) // ISO -> day modal
  const [creatingDate, setCreatingDate] = useState(null) // ISO -> create modal
  const [createPrefill, setCreatePrefill] = useState(null) // prefill from an LMS event
  const [editingBooking, setEditingBooking] = useState(null) // existing booking being edited
  const [bump, setBump] = useState(0) // bumps to re-fetch the Bookings list after a save

  // admin-editable staffing matrix (DB overrides the built-in defaults)
  const [matrix, setMatrix] = useState(VALET_MATRIX)
  const loadMatrix = useCallback(async () => {
    const { data } = await supabase.from('valet_matrix').select('*')
    if (data && data.length) {
      const m = {}
      data.forEach((r) => { m[r.property] = { name: r.name, roles: r.roles, tiers: r.tiers } })
      setMatrix({ ...VALET_MATRIX, ...m })
    }
  }, [])
  useEffect(() => { loadMatrix() }, [loadMatrix])

  const load = useCallback(async () => {
    setLoading(true)
    const first = ymd(month.y, month.m, 1)
    const last = ymd(month.y, month.m, new Date(month.y, month.m + 1, 0).getDate())
    let q = supabase.from('valet_bookings').select('*').gte('event_date', first).lte('event_date', last).order('event_time', { ascending: true })
    if (!scopeAll) q = q.eq('property', user.property)
    const { data } = await q
    setBookings(data || [])
    setLoading(false)
  }, [month, scopeAll, user])

  useEffect(() => { load() }, [load])

  // LMS confirmed venue events (contracts). Fetched once; grouped by date and
  // scoped to the venues this admin can see + the active property filter.
  const [lms, setLms] = useState([])
  const [lmsError, setLmsError] = useState('')
  useEffect(() => {
    let alive = true
    lmsVenueContracts()
      .then((rows) => { if (alive) setLms(rows) })
      .catch((e) => { if (alive) setLmsError(e.message || 'Could not reach LMS') })
    return () => { alive = false }
  }, [])

  const allowedVenues = useMemo(() => {
    const props = propFilter === 'all' ? visibleProps : visibleProps.filter((p) => p.code === propFilter)
    return new Set(props.map((p) => LMS_VENUE_BY_PROP[p.code]).filter(Boolean))
  }, [propFilter, visibleProps])

  const lmsByDate = useMemo(() => {
    const m = {}
    lms.forEach((c) => {
      const iso = lmsDateToIso(c.date)
      if (!iso) return
      const vid = Number(c.venueId)
      if (vid && allowedVenues.size && !allowedVenues.has(vid)) return // other venue
      if (!vid && propFilter !== 'all') return                        // unknown venue, hide when filtered
      ;(m[iso] ||= []).push(c)
    })
    return m
  }, [lms, allowedVenues, propFilter])

  const shown = useMemo(
    () => (propFilter === 'all' ? bookings : bookings.filter((b) => b.property === propFilter)),
    [bookings, propFilter]
  )

  // event_date -> bookings[]
  const byDate = useMemo(() => {
    const m = {}
    shown.forEach((b) => { (m[b.event_date] ||= []).push(b) })
    return m
  }, [shown])

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate()
  const firstDow = new Date(month.y, month.m, 1).getDay()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const canPrev = month.y > minMonth.y || (month.y === minMonth.y && month.m > minMonth.m)
  const canNext = month.y < maxMonth.y || (month.y === maxMonth.y && month.m < maxMonth.m)
  const shiftMonth = (delta) => {
    if (delta < 0 ? !canPrev : !canNext) return
    setMonth(({ y, m }) => {
      const nm = m + delta
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }
    })
  }

  const openCreate = (iso, prefill = null) => { setSelectedDate(null); setCreatePrefill(prefill); setCreatingDate(iso || today) }
  const openEdit = (booking) => { setSelectedDate(null); setEditingBooking(booking); setCreatingDate(booking.event_date) }

  return (
    <div>
      <SectionTitle>{t.valet}</SectionTitle>

      <Tabs
        tabs={[{ key: 'calendar', label: t.calendar }, { key: 'bookings', label: t.bookings }, { key: 'calculator', label: t.calculator }]}
        active={view}
        onChange={setView}
      />

      {view === 'calculator' ? (
        <Calculator C={C} t={t} visibleProps={visibleProps} defaultProp={defaultProp} matrix={matrix} canEdit={scopeAll} onMatrixSaved={loadMatrix} />
      ) : view === 'bookings' ? (
        <BookingsList C={C} t={t} user={user} scopeAll={scopeAll} reloadSignal={bump} onEdit={openEdit} />
      ) : (
        <>
          {/* property filter — dropdown, only for admins who oversee all properties */}
          {scopeAll && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, maxWidth: 320 }}>
              <Icon name="pin" size={16} color={C.tl} />
              <select style={inputStyle(C)} value={propFilter} onChange={(e) => setPropFilter(e.target.value)} aria-label={t.properties}>
                <option value="all">{t.properties} — {t.all}</option>
                {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* month navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => shiftMonth(-1)} disabled={!canPrev} style={navBtn(C, !canPrev)} aria-label="Previous month">
              <Icon name="chevronLeft" size={18} color={canPrev ? C.text : C.faint} />
            </button>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{MONTHS[month.m]} {month.y}</div>
            <button onClick={() => shiftMonth(1)} disabled={!canNext} style={navBtn(C, !canNext)} aria-label="Next month">
              <Icon name="chevronRight" size={18} color={canNext ? C.text : C.faint} />
            </button>
          </div>

          {loading ? (
            <Loader label={t.loading} />
          ) : (
            <Card style={{ padding: 10 }}>
              {/* weekday header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 5 }}>
                {WEEKDAYS.map((w, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: C.tl }}>{w}</div>
                ))}
              </div>
              {/* day grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                {cells.map((d, i) => {
                  if (d == null) return <div key={i} />
                  const iso = ymd(month.y, month.m, d)
                  const list = byDate[iso] || []
                  const lmsCount = (lmsByDate[iso] || []).length
                  const isToday = iso === today
                  const isPast = iso < today // past dates can't be booked...
                  const hasItems = list.length > 0 || lmsCount > 0
                  const canOpen = !isPast || hasItems // ...but past dates with bookings/events open for viewing & deleting
                  return (
                    <button
                      key={i}
                      onClick={() => canOpen && setSelectedDate(iso)}
                      disabled={!canOpen}
                      style={{
                        position: 'relative', height: 'clamp(42px, 8.5vh, 68px)', borderRadius: 10,
                        border: `1px solid ${isToday ? C.maroon : C.border}`,
                        background: isPast ? C.cardAlt : (list.length ? C.maroonSoft : C.card),
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                        cursor: canOpen ? 'pointer' : 'not-allowed',
                        opacity: isPast ? (hasItems ? 0.75 : 0.45) : 1,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: isToday ? 800 : 600, color: isToday ? C.maroon : C.text }}>{d}</span>
                      {list.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: C.maroon, borderRadius: 999, padding: '1px 6px', lineHeight: 1.5 }}>
                          {list.length}
                        </span>
                      )}
                      {/* blue dot = confirmed venue events from LMS on this date */}
                      {lmsCount > 0 && (
                        <span
                          title={`${lmsCount} venue event(s)`}
                          style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', background: C.blue }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {selectedDate && (
        <DayModal
          C={C} t={t} date={selectedDate} scopeAll={scopeAll} matrix={matrix}
          list={byDate[selectedDate] || []}
          lmsList={lmsByDate[selectedDate] || []} lmsError={lmsError}
          visibleProps={visibleProps} monthBookings={bookings}
          onClose={() => setSelectedDate(null)}
          onAdd={() => openCreate(selectedDate)}
          onCreateFrom={(prefill) => openCreate(selectedDate, prefill)}
          onEdit={openEdit}
          onChanged={load}
        />
      )}

      {creatingDate && (
        <CreateModal
          C={C} t={t} user={user} visibleProps={visibleProps} defaultProp={defaultProp} matrix={matrix}
          date={creatingDate} minDate={today} maxDate={maxDate} existing={bookings} prefill={createPrefill} editing={editingBooking}
          onClose={() => { setCreatingDate(null); setCreatePrefill(null); setEditingBooking(null) }}
          onSaved={() => { setCreatingDate(null); setCreatePrefill(null); setEditingBooking(null); setBump((b) => b + 1); load() }}
        />
      )}
    </div>
  )
}

/* ------------------------------- day view ------------------------------- */
function DayModal({ C, t, date, list, lmsList = [], lmsError = '', scopeAll, matrix, visibleProps, monthBookings, onClose, onAdd, onCreateFrom, onEdit, onChanged }) {
  const [busy, setBusy] = useState(false)

  // one booking per property per day: only offer "New Booking" while at least
  // one bookable property is still free on this date.
  const bookedCodes = new Set(monthBookings.filter((b) => b.event_date === date).map((b) => b.property))
  const allBooked = visibleProps.every((p) => bookedCodes.has(p.code))
  const isPast = date < todayISO() // past dates: view/delete only, no new bookings

  async function del(id) {
    if (!window.confirm(t.deleteBookingConfirm)) return
    setBusy(true)
    await supabase.from('valet_bookings').delete().eq('id', id)
    setBusy(false)
    onChanged()
  }

  return (
    <Modal
      open onClose={onClose} title={fmtLong(date)}
      footer={
        isPast
          ? <div style={{ fontSize: 13, color: C.tl, textAlign: 'center', width: '100%' }}>{t.pastDateNoBooking || "Past date — bookings can't be added."}</div>
          : allBooked
            ? <div style={{ fontSize: 13, color: C.tl, textAlign: 'center', width: '100%' }}>{t.dateFullyBooked}</div>
            : null
      }
    >
      {list.length === 0 ? (
        <EmptyState icon="calendar" title={t.noBookings} />
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>{t.valetBooking}</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {list.map((b) => (
              <BookingCard key={b.id} C={C} t={t} b={b} scopeAll={scopeAll} matrix={matrix} busy={busy} onEdit={() => onEdit?.(b)} onDelete={() => del(b.id)} />
            ))}
          </div>
        </>
      )}

      {/* confirmed venue events + contract details from the LMS for this date */}
      <LmsVenuePanel C={C} t={t} date={date} list={lmsList} error={lmsError} isPast={isPast} onCreateFrom={onCreateFrom} />
    </Modal>
  )
}

/* ---- LMS confirmed venue events + contract details for one date ---- */
function LmsVenuePanel({ C, t, date, list = [], error = '', isPast = false, onCreateFrom }) {
  // build a valet-booking prefill from an LMS venue event
  const prefillFrom = (c) => ({
    property: PROP_BY_LMS_VENUE[Number(c.venueId)] || undefined,
    event_date: date,
    event_time: c.time ? String(c.time) : '',
    customer_name: c.customer ? String(c.customer) : '',
    phone: c.phone,
    guests: c.guests,
  })

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="calendar" size={16} color={C.maroon} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Venue events (LMS)</span>
      </div>

      {error ? (
        <div style={{ background: C.rBg, color: C.red, fontSize: 12.5, borderRadius: 10, padding: '9px 12px' }}>
          {error}. Make sure the <b>lms-proxy</b> function is deployed.
        </div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: C.tl }}>No confirmed venue events (LMS) on this date.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((c) => (
            <div key={c.rowId} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.customer || c.functionType || 'Venue event'}</div>
              <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {c.time && <Meta C={C} icon="clock" text={String(c.time)} />}
                {c.guests != null && <Meta C={C} icon="team" text={`${c.guests} pax`} />}
                {c.functionType && <Meta C={C} icon="star" text={String(c.functionType)} />}
                {c.location && <Meta C={C} icon="pin" text={String(c.location)} />}
                {c.phone && <Meta C={C} icon="phone" text={String(c.phone)} />}
              </div>

              {!isPast && onCreateFrom && (
                <div style={{ marginTop: 10 }}>
                  <Button variant="soft" onClick={() => onCreateFrom(prefillFrom(c))} style={{ padding: '7px 12px', fontSize: 12.5 }}>
                    <Icon name="plus" size={14} color={C.maroon} style={{ marginRight: 4 }} /> {t.valetBooking}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BookingCard({ C, t, b, scopeAll, matrix, busy, onEdit, onDelete }) {
  // prefer the snapshot saved with the booking (may be an admin override);
  // fall back to computing from the current matrix, then to the stored total.
  const stored = Array.isArray(b.staff_breakdown) ? b.staff_breakdown : null
  const alloc = stored ? null : (b.guests ? allocateValet(b.property, b.guests, matrix) : null)
  const breakdown = stored || (alloc ? alloc.breakdown : null)
  const total = stored
    ? stored.reduce((s, x) => s + (Number(x.count) || 0), 0)
    : (alloc ? alloc.total : b.staff_total)
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{b.customer_name || '—'}</div>
          {scopeAll && (
            <div style={{ fontSize: 12.5, color: C.faint, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="pin" size={13} /> {PROPERTY_MAP[b.property]?.name || b.property}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {onEdit && (
            <button onClick={onEdit} disabled={busy} style={{ background: 'transparent', color: C.maroon }} aria-label={t.editBooking}>
              <Icon name="edit" size={18} color={C.maroon} />
            </button>
          )}
          <button onClick={onDelete} disabled={busy} style={{ background: 'transparent', color: C.red }} aria-label={t.delete}>
            <Icon name="trash" size={18} color={C.red} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {b.event_time && <Meta C={C} icon="clock" text={b.event_time} />}
        <Meta C={C} icon="team" text={`${b.guests || 0} ${t.guestCount.toLowerCase()}`} />
        {b.phone && <Meta C={C} icon="phone" text={b.phone} />}
      </div>

      {(breakdown || total != null) && (
        <div style={{ marginTop: 12, background: C.bg, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tl }}>{t.staffNeeded}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.maroon }}>{total ?? 0}</span>
          </div>
          {breakdown && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {breakdown.filter((x) => x.count > 0).map((x) => (
                <Badge key={x.role}>{x.role}: {x.count}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {b.notes && <p style={{ fontSize: 13.5, color: C.tl, marginTop: 10, lineHeight: 1.5 }}>{b.notes}</p>}
    </Card>
  )
}

function Meta({ C, icon, text }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: C.tl }}>
      <Icon name={icon} size={14} color={C.tl} /> {text}
    </span>
  )
}

// role tiles + total staff — shared by the calculator and the booking form
function StaffBreakdown({ C, result }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 10 }}>
        {result.breakdown.map((b) => {
          const on = b.count > 0
          return (
            <div key={b.role} style={{
              position: 'relative', overflow: 'hidden', background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '15px 10px 12px', textAlign: 'center',
            }}>
              <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: C.maroon, opacity: on ? 1 : 0.15 }} />
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: on ? C.text : C.faint, fontVariantNumeric: 'tabular-nums' }}>{b.count}</div>
              <div style={{ fontSize: 12.5, color: C.tl, fontWeight: 600, marginTop: 7 }}>{b.role}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, background: C.maroonSoft, borderRadius: 12, padding: '12px 16px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.maroon }}>
          <Icon name="team" size={18} color={C.maroon} /> Total staff
        </span>
        <span style={{ fontWeight: 800, color: C.maroon, fontSize: 24, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{result.total}</span>
      </div>
    </>
  )
}

/* ------------------------------ create form ----------------------------- */
function CreateModal({ C, t, user, visibleProps, defaultProp, date, minDate, maxDate, matrix, existing = [], prefill = null, editing = null, onClose, onSaved }) {
  // properties already booked on the chosen date can't be booked again
  // (when editing, the booking being edited doesn't count against itself)
  const bookedOn = (d) => new Set(existing.filter((b) => b.event_date === d && (!editing || b.id !== editing.id)).map((b) => b.property))
  const firstFree = (d) => (visibleProps.find((p) => !bookedOn(d).has(p.code)) || {}).code || defaultProp

  const [form, setForm] = useState(() => {
    if (editing) {
      return {
        property: editing.property,
        event_date: editing.event_date,
        event_time: editing.event_time || '',
        customer_name: editing.customer_name || '',
        phone: editing.phone || '',
        guests: editing.guests != null ? String(editing.guests) : '',
        notes: editing.notes || '',
      }
    }
    const p = prefill || {}
    // prefer the LMS event's venue if it's visible & still free on this date
    const wantProp = p.property && visibleProps.some((v) => v.code === p.property) && !bookedOn(date).has(p.property)
      ? p.property
      : firstFree(date)
    return {
      property: wantProp,
      event_date: date,
      event_time: p.event_time || '',
      customer_name: p.customer_name || '',
      phone: p.phone != null ? digitsOnly(String(p.phone)).slice(0, 10) : '',
      guests: p.guests != null ? digitsOnly(String(p.guests)) : '',
      notes: p.customer_name ? `LMS venue event: ${p.customer_name}` : '',
    }
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editStaff, setEditStaff] = useState(false)
  const [manual, setManual] = useState(null) // admin override [{role,count}]; null = use matrix
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const bookedCodes = bookedOn(form.event_date)
  const availableProps = visibleProps.filter((p) => !bookedCodes.has(p.code))
  const noneAvailable = availableProps.length === 0
  const guestsOver = overGuestLimit(form.guests)

  // when the date changes, keep the selected property valid for that date
  const onDate = (e) => {
    const d = e.target.value
    setForm((f) => {
      const stillFree = !bookedOn(d).has(f.property)
      return { ...f, event_date: d, property: stillFree ? f.property : firstFree(d) }
    })
  }

  const alloc = form.guests && !noneAvailable && !guestsOver ? allocateValet(form.property, form.guests, matrix) : null
  // effective staffing = admin override if set, else the matrix result
  const effBreakdown = manual || (alloc ? alloc.breakdown : null)
  const effTotal = effBreakdown ? effBreakdown.reduce((s, x) => s + (Number(x.count) || 0), 0) : null

  const startEdit = () => { if (!manual) setManual((effBreakdown || []).map((x) => ({ ...x }))); setEditStaff(true) }
  const setRoleCount = (i, v) => setManual((m) => (m || []).map((x, idx) => (idx === i ? { ...x, count: Math.max(0, Math.floor(Number(v) || 0)) } : x)))
  const useAuto = () => { setManual(null); setEditStaff(false) }

  async function save() {
    if (!form.event_date) { setErr(t.required || 'Date is required'); return }
    // when editing, keeping the booking's original (possibly past) date is allowed
    const dateChanged = !editing || form.event_date !== editing.event_date
    if (dateChanged && form.event_date < minDate) { setErr('Bookings cannot be made for past dates'); return }
    if (form.event_date > maxDate) { setErr('Bookings can only be made up to one year ahead'); return }
    if (overGuestLimit(form.guests)) { setErr(t.guestLimitExceeded); return }
    if (!/^\d{10}$/.test(form.phone)) { setErr('Enter a valid 10-digit phone number'); return }
    setBusy(true); setErr('')

    // one booking per property per day (ignore the booking being edited)
    const { data: clash } = await supabase
      .from('valet_bookings')
      .select('id')
      .eq('property', form.property)
      .eq('event_date', form.event_date)
      .limit(1)
    if (clash && clash.length && (!editing || clash[0].id !== editing.id)) {
      setBusy(false)
      setErr(`${PROPERTY_MAP[form.property]?.name || form.property} already has a booking on ${form.event_date}`)
      return
    }

    const payload = {
      property: form.property,
      event_date: form.event_date,
      event_time: form.event_time || null,
      customer_name: form.customer_name || null,
      phone: form.phone || null,
      guests: Number(form.guests) || 0,
      staff_total: effTotal,
      staff_breakdown: effBreakdown,
      notes: form.notes || null,
    }
    const { error } = editing
      ? await supabase.from('valet_bookings').update(payload).eq('id', editing.id)
      : await supabase.from('valet_bookings').insert({ id: `v_${Date.now()}_${Math.round(performance.now())}`, ...payload, created_by: user.id })
    setBusy(false)
    if (error) {
      setErr(error.code === '23505'
        ? `${PROPERTY_MAP[form.property]?.name || form.property} already has a booking on ${form.event_date}`
        : error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal
      open onClose={onClose} title={editing ? t.editBooking : t.newBooking}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>{t.cancel}</Button>
          <Button variant="primary" onClick={save} disabled={busy || noneAvailable} style={{ flex: 2 }}>{t.save}</Button>
        </>
      }
    >
      {noneAvailable && (
        <div style={{ background: C.rBg, color: C.red, fontSize: 13, fontWeight: 600, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          {t.dateFullyBooked}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Property">
            <select style={inputStyle(C)} value={form.property} onChange={set('property')} disabled={availableProps.length <= 1}>
              {availableProps.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={t.guestCount}>
            <input
              type="number" min={0} max={MAX_GUESTS} style={inputStyle(C)} value={form.guests}
              onChange={(e) => setForm((f) => ({ ...f, guests: digitsOnly(e.target.value) }))}
              placeholder={`max ${MAX_GUESTS}`}
            />
          </Field>
        </div>
      </div>

      {guestsOver && (
        <div style={{ color: C.red, fontSize: 12.5, fontWeight: 600, marginTop: -6, marginBottom: 12 }}>
          {t.guestLimitExceeded}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Date">
            <input type="date" min={minDate} max={maxDate} style={inputStyle(C)} value={form.event_date} onChange={onDate} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={`${t.eventTime} (${t.optional})`}>
            <input style={inputStyle(C)} value={form.event_time} onChange={set('event_time')} placeholder="e.g. 7 PM" />
          </Field>
        </div>
      </div>

      <Field label={t.customerName}>
        <input style={inputStyle(C)} value={form.customer_name} onChange={set('customer_name')} />
      </Field>
      <Field label={t.phone}>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          style={inputStyle(C)}
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
          placeholder="10-digit number"
        />
      </Field>

      {/* staffing breakdown from the matrix, with an admin edit/override option */}
      {(alloc || manual) && (
        <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="valet" size={18} color={C.maroon} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.staffNeeded}</span>
            </span>
            {editStaff ? (
              <button onClick={useAuto} style={{ background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 600 }}>{t.useAuto}</button>
            ) : (
              <button onClick={startEdit} style={{ background: 'transparent', color: C.maroon, fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="edit" size={14} color={C.maroon} /> {t.edit}
              </button>
            )}
          </div>

          {editStaff ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10, marginBottom: 12 }}>
                {(manual || []).map((x, i) => (
                  <div key={x.role} style={{ background: C.bg, borderRadius: 10, padding: 10, textAlign: 'center' }}>
                    <input
                      type="number" min={0} value={x.count}
                      onChange={(e) => setRoleCount(i, e.target.value)}
                      style={{ ...inputStyle(C), textAlign: 'center', fontSize: 20, fontWeight: 800, padding: '6px 4px' }}
                    />
                    <div style={{ fontSize: 13, color: C.tl, fontWeight: 600, marginTop: 6 }}>{x.role}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 4px 0', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontWeight: 700 }}>Total staff</span>
                <span style={{ fontWeight: 800, color: C.maroon, fontSize: 20 }}>{effTotal ?? 0}</span>
              </div>
            </>
          ) : (
            <StaffBreakdown C={C} result={{ breakdown: effBreakdown || [], total: effTotal ?? 0 }} />
          )}

          {manual && !editStaff && (
            <div style={{ fontSize: 11.5, color: C.maroon, fontWeight: 600, marginTop: 8 }}>{t.staffOverridden}</div>
          )}
          {!manual && alloc?.extrapolated && (
            <div style={{ fontSize: 11.5, color: C.tl, marginTop: 8 }}>
              Estimated — beyond the staffing table; numbers scaled up.
            </div>
          )}
        </div>
      )}

      <Field label={`Notes (${t.optional})`}>
        <textarea rows={2} style={{ ...inputStyle(C), resize: 'vertical' }} value={form.notes} onChange={set('notes')} />
      </Field>

      {err && <div style={{ color: C.red, fontSize: 13 }}>{err}</div>}
    </Modal>
  )
}

/* --------------------- PDF export (next 7 booking days) --------------------- */
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Build a printable page of the given date-grouped bookings and open the browser
// print dialog (user picks "Save as PDF"). No external library needed.
function exportBookingsPdf(sections) {
  const genDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const body = sections.map((sec) => {
    const rows = sec.items.map((b) => `
      <tr>
        <td>${escapeHtml(PROPERTY_MAP[b.property]?.name || b.property)}</td>
        <td>${escapeHtml(b.customer_name || '—')}</td>
        <td>${escapeHtml(b.phone || '—')}</td>
        <td>${escapeHtml(b.event_time || '—')}</td>
        <td class="num">${b.guests || 0}</td>
        <td class="num">${b.staff_total ?? '—'}</td>
      </tr>`).join('')
    return `
      <h2>${escapeHtml(fmtLong(sec.date))}</h2>
      <table>
        <thead><tr><th>Venue</th><th>Customer</th><th>Phone</th><th>Time</th><th class="num">Guests</th><th class="num">Staff</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  }).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ambria Valet Bookings</title>
    <style>
      * { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 28px; color: #1f2937; }
      .head { border-bottom: 3px solid #7B1E2F; padding-bottom: 12px; margin-bottom: 6px; }
      .head h1 { color: #7B1E2F; margin: 0; font-size: 22px; }
      .head p { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
      h2 { font-size: 15px; margin: 22px 0 8px; color: #7B1E2F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th, td { border: 1px solid #e5e7eb; padding: 7px 10px; font-size: 12.5px; text-align: left; }
      th { background: #f4eef0; color: #7B1E2F; }
      td.num, th.num { text-align: right; }
      tr { page-break-inside: avoid; }
    </style></head><body>
      <div class="head">
        <h1>Ambria Ops — Valet Bookings</h1>
        <p>Next ${sections.length} booking day(s) from today · Generated ${escapeHtml(genDate)}</p>
      </div>
      ${body}
    </body></html>`

  const w = window.open('', '_blank')
  if (!w) { window.alert('Please allow pop-ups to export the PDF.'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

/* --------------------- all valet bookings (list view) --------------------- */
function BookingsList({ C, t, user, scopeAll, reloadSignal, onEdit }) {
  const [rows, setRows] = useState(null)
  const [propFilter, setPropFilter] = useState('all')

  const load = useCallback(async () => {
    let q = supabase.from('valet_bookings').select('*').order('event_date', { ascending: false })
    if (!scopeAll) q = q.eq('property', user.property)
    const { data } = await q
    setRows(data || [])
  }, [scopeAll, user])

  useEffect(() => { load() }, [load, reloadSignal])

  const shown = useMemo(
    () => (propFilter === 'all' ? (rows || []) : (rows || []).filter((b) => b.property === propFilter)),
    [rows, propFilter]
  )

  async function del(id) {
    if (!window.confirm(t.deleteBookingConfirm)) return
    await supabase.from('valet_bookings').delete().eq('id', id)
    load()
  }

  if (rows === null) return <Loader label={t.loading} />

  const today = todayISO()
  const upcoming = shown.filter((b) => b.event_date >= today).sort((a, b) => (a.event_date < b.event_date ? -1 : 1)) // soonest first
  const past = shown.filter((b) => b.event_date < today).sort((a, b) => (a.event_date > b.event_date ? -1 : 1))       // most recent first

  const renderCard = (b) => (
    <Card key={b.id} style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{b.customer_name || '—'}</div>
          <div style={{ fontSize: 12.5, color: C.tl, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Meta C={C} icon="calendar" text={fmtLong(b.event_date)} />
            <Meta C={C} icon="pin" text={PROPERTY_MAP[b.property]?.name || b.property} />
            {b.event_time && <Meta C={C} icon="clock" text={b.event_time} />}
            <Meta C={C} icon="team" text={`${b.guests || 0} ${t.guestCount.toLowerCase()}`} />
            {b.staff_total != null && <Meta C={C} icon="valet" text={`${b.staff_total} staff`} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onEdit?.(b)} style={{ background: 'transparent', color: C.maroon }} aria-label={t.editBooking}>
            <Icon name="edit" size={18} color={C.maroon} />
          </button>
          <button onClick={() => del(b.id)} style={{ background: 'transparent', color: C.red }} aria-label={t.delete}>
            <Icon name="trash" size={18} color={C.red} />
          </button>
        </div>
      </div>
    </Card>
  )

  const groupHeader = (label, n) => (
    <div style={{ fontSize: 13, color: C.tl, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', margin: '2px 0 10px' }}>
      {label} · {n}
    </div>
  )

  // PDF = the next 7 DISTINCT upcoming dates (multiple bookings per day allowed)
  const onExport = () => {
    const byDate = {}
    const days = []
    upcoming.forEach((b) => {
      if (!byDate[b.event_date]) { byDate[b.event_date] = []; days.push(b.event_date) }
      byDate[b.event_date].push(b)
    })
    const sections = days.slice(0, 7).map((d) => ({ date: d, items: byDate[d] }))
    if (sections.length) exportBookingsPdf(sections)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {scopeAll && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 150 }}>
            <Icon name="pin" size={16} color={C.tl} />
            <select style={inputStyle(C)} value={propFilter} onChange={(e) => setPropFilter(e.target.value)} aria-label={t.properties}>
              <option value="all">{t.properties} — {t.all}</option>
              {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
        )}
        {upcoming.length > 0 && (
          <Button variant="primary" onClick={onExport} style={{ marginLeft: 'auto' }}>
            <Icon name="download" size={16} color="#fff" style={{ marginRight: 4 }} /> {t.exportPdf}
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="calendar" title={t.noBookings} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div style={{ marginBottom: past.length ? 22 : 0 }}>
              {groupHeader(t.upcoming, upcoming.length)}
              <div style={{ display: 'grid', gap: 10 }}>{upcoming.map(renderCard)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div style={{ opacity: 0.85 }}>
              {groupHeader(t.past, past.length)}
              <div style={{ display: 'grid', gap: 10 }}>{past.map(renderCard)}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* --------------------------- staffing calculator --------------------------- */
function Calculator({ C, t, visibleProps, defaultProp, matrix, canEdit, onMatrixSaved }) {
  const [property, setProperty] = useState(defaultProp)
  const [guests, setGuests] = useState('')
  const [editing, setEditing] = useState(false)
  const guestsOver = overGuestLimit(guests)
  const result = guests && !guestsOver ? allocateValet(property, guests, matrix) : null

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: C.maroonSoft, display: 'grid', placeItems: 'center' }}>
            <Icon name="valet" size={22} color={C.maroon} />
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text, letterSpacing: '-0.01em' }}>{t.calculator}</div>
            <div style={{ fontSize: 12.5, color: C.tl, marginTop: 1 }}>Estimate valet staff by property and guest count</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Property">
              <select style={inputStyle(C)} value={property} onChange={(e) => { setProperty(e.target.value); setEditing(false) }} disabled={visibleProps.length <= 1}>
                {visibleProps.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Guest count">
              <input type="number" min={0} max={MAX_GUESTS} style={inputStyle(C)} value={guests} onChange={(e) => setGuests(digitsOnly(e.target.value))} placeholder={`max ${MAX_GUESTS}`} />
            </Field>
          </div>
        </div>
        {guestsOver && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.red, fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>
            <Icon name="warning" size={14} color={C.red} /> {t.guestLimitExceeded}
          </div>
        )}
      </Card>

      {result ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{result.property}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: C.tl, background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 11px' }}>
              <Icon name="team" size={14} color={C.tl} /> {guests} guests
            </span>
          </div>

          {result.extrapolated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.yBg, color: C.text, fontSize: 12.5, borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
              <Icon name="info" size={15} color={C.yellow} />
              Estimated — guest count is beyond the staffing table; numbers are scaled up.
            </div>
          )}

          <StaffBreakdown C={C} result={result} />
        </Card>
      ) : !guestsOver && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ textAlign: 'center', padding: '26px 16px', color: C.tl }}>
            <div style={{ width: 52, height: 52, margin: '0 auto 12px', borderRadius: 14, background: C.cardAlt, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', color: C.faint }}>
              <Icon name="team" size={24} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Enter a guest count</div>
            <div style={{ fontSize: 13, marginTop: 3 }}>See the recommended valet staff for this property.</div>
          </div>
        </Card>
      )}

      {/* admins can edit the staffing logic (tier table) for the selected property */}
      {canEdit && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: editing ? 14 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="edit" size={18} color={C.maroon} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{t.editStaffingLogic}</span>
            </div>
            {!editing && (
              <Button variant="soft" onClick={() => setEditing(true)}>{t.edit}</Button>
            )}
          </div>
          {editing ? (
            <MatrixEditor
              C={C} t={t} property={property} matrix={matrix}
              onSaved={() => { setEditing(false); onMatrixSaved() }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <p style={{ fontSize: 13, color: C.tl, marginTop: 8 }}>
              {t.editStaffingHint} <b>{(matrix[property] || VALET_MATRIX[property])?.name}</b>.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

/* ---------------------- matrix (staffing logic) editor ---------------------- */
function MatrixEditor({ C, t, property, matrix, onSaved, onCancel }) {
  const base = matrix[property] || VALET_MATRIX[property]
  const roles = base.roles
  const [tiers, setTiers] = useState(() => base.tiers.map((tr) => ({ max: tr.max, values: roles.map((_, j) => tr.values[j] ?? 0) })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const num = (v) => Math.max(0, Math.floor(Number(v) || 0))
  const setMax = (i, v) => setTiers((ts) => ts.map((tr, idx) => (idx === i ? { ...tr, max: num(v) } : tr)))
  const setVal = (i, j, v) => setTiers((ts) => ts.map((tr, idx) => (idx === i ? { ...tr, values: tr.values.map((x, jdx) => (jdx === j ? num(v) : x)) } : tr)))
  const addTier = () => setTiers((ts) => [...ts, { max: (ts[ts.length - 1]?.max || 0) + 100, values: roles.map(() => 0) }])
  const removeTier = (i) => setTiers((ts) => ts.filter((_, idx) => idx !== i))

  async function save() {
    const clean = [...tiers].filter((tr) => tr.max > 0).sort((a, b) => a.max - b.max)
    if (!clean.length) { setErr('Add at least one tier with a guest limit.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('valet_matrix').upsert({
      property, name: base.name, roles, tiers: clean, updated_at: nowISO(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  // grid: "up to" column + one column per role + a remove column
  const cols = `90px repeat(${roles.length}, minmax(64px, 1fr)) 40px`

  return (
    <div>
      <div style={{ overflowX: 'auto' }} className="no-scrollbar">
        <div style={{ minWidth: 90 + roles.length * 72 + 40 }}>
          {/* header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'end', marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.tl }}>{t.upToGuests}</div>
            {roles.map((r) => <div key={r} style={{ fontSize: 11.5, fontWeight: 700, color: C.tl, textAlign: 'center' }}>{r}</div>)}
            <div />
          </div>
          {/* rows */}
          {tiers.map((tr, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input type="number" min={0} value={tr.max} onChange={(e) => setMax(i, e.target.value)} style={{ ...inputStyle(C), padding: '8px 8px', textAlign: 'center' }} />
              {roles.map((r, j) => (
                <input key={r} type="number" min={0} value={tr.values[j]} onChange={(e) => setVal(i, j, e.target.value)} style={{ ...inputStyle(C), padding: '8px 6px', textAlign: 'center' }} />
              ))}
              <button onClick={() => removeTier(i)} style={{ background: 'transparent', color: C.red }} aria-label={t.delete}>
                <Icon name="trash" size={16} color={C.red} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={addTier} style={{ background: 'transparent', color: C.maroon, fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
        <Icon name="plus" size={15} color={C.maroon} /> {t.addTier}
      </button>

      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>{t.cancel}</Button>
        <Button variant="primary" onClick={save} disabled={busy} style={{ flex: 2 }}>{t.save}</Button>
      </div>
    </div>
  )
}

/* ------------------------------- primitives ------------------------------- */
function navBtn(C, disabled) {
  return {
    width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card,
    display: 'grid', placeItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }
}
