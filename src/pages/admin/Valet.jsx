import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayISO, nowISO, fmtTime, to24h } from '../../lib/time'
import { useColors, useTheme } from '../../context/ThemeContext'
import { esc } from '../../lib/printable'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { PROPERTIES, PROPERTY_MAP, propName, canSeeAllProperties, canSeeGuestPhone } from '../../constants/org'
import { typedPhone } from '../../lib/phone'
import { allocateValet, MAX_GUESTS, VALET_MATRIX } from '../../constants/valetMatrix'
import { Card, Loader, Button, Badge, SectionTitle, Tabs, EmptyState, Field, FilterChip, inputStyle, filterStyle, FilterField, Spinner, wholeNumberField } from '../../components/common/UI'
import Modal from '../../components/common/Modal'
import Icon from '../../components/common/Icon'
import { useConfirm } from '../../components/common/ConfirmDialog'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { lmsVenueContracts, lmsDateToIso, LMS_VENUE_BY_PROP, PROP_BY_LMS_VENUE, LMS_ALL_VENUES, VENUE_COLORS, VENUE_DOT_RING } from '../../lib/lms'
import ValetAnalytics from './ValetAnalytics'
import ValetRecords from './ValetRecords'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAYS_HI = ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
const monthName = (i, lang) => (lang === 'hi' ? MONTHS_HI[i] : MONTHS[i])
// Four to a row, so the grid takes the short form. Hindi month names are already
// short enough to use whole.
const monthShort = (i, lang) => (lang === 'hi' ? MONTHS_HI[i] : MONTHS[i].slice(0, 3))
const weekdays = (lang) => (lang === 'hi' ? WEEKDAYS_HI : WEEKDAYS)

// digits only; '' stays '' so the field can be cleared
const digitsOnly = (v) => (v == null ? '' : String(v).replace(/\D/g, ''))
const overGuestLimit = (v) => Number(v) > MAX_GUESTS

// A heavy date puts two more drivers on. Drivers, because the pinch on a busy
// night is cars moving — a second key man or guard does not clear a queue at the
// gate.
//
// Applied to the MATRIX result, not to a manual override: an override is the
// admin stating the exact numbers, and quietly adding two to what they typed
// would make their own figure wrong.
const HEAVY_ROLE = 'Driver'
const HEAVY_EXTRA = 2
const withHeavy = (breakdown, heavy) => {
  if (!heavy || !breakdown) return breakdown
  // Only where that role exists. Restro and Janakpuri run no Rider; if a venue
  // ever runs no Driver this must add nothing rather than invent a role.
  if (!breakdown.some((b) => b.role === HEAVY_ROLE)) return breakdown
  return breakdown.map((b) => (b.role === HEAVY_ROLE ? { ...b, count: b.count + HEAVY_EXTRA } : b))
}

// A booked date carries the venue's own colour rather than one brand tint, so
// the month reads as "which venues are working" instead of "something is on".
// Several bookings become several bands across the tile — one booking per
// property per day is enforced on save, so a band is always a distinct venue.
//
// Translucent, and layered over the tile's own background rather than replacing
// it: VENUE_COLORS are chosen to be told apart at full strength on a dot, and at
// that strength behind a date number nothing is readable.
const BAND_ALPHA = { light: '2e', dark: '66' }   // ~18% and ~40%

const venueBands = (codes, theme) => {
  if (!codes.length) return undefined
  const a = BAND_ALPHA[theme === 'dark' ? 'dark' : 'light']
  const step = 100 / codes.length
  // Hard stops, so the bands are blocks rather than a blur nobody can count.
  const stops = codes.map((c, i) => `${VENUE_COLORS[c]}${a} ${i * step}% ${(i + 1) * step}%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
function fmtLong(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${monthName(m - 1, lang)} ${y}`
}

export default function Valet() {
  const C = useColors()
  const { theme } = useTheme()
  const confirm = useConfirm()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()

  const scopeAll = canSeeAllProperties(user)
  const visibleProps = scopeAll ? PROPERTIES : PROPERTIES.filter((p) => p.code === user?.property)
  const defaultProp = user?.property && user.property !== 'all' ? user.property : (visibleProps[0]?.code || 'pp')

  // desktop shows every venue at once; the dropdown is kept for narrow screens
  const wide = useMediaQuery('(min-width: 900px)')

  const [view, setView] = useState('calendar')
  const today = todayISO()
  const [ty, tmn, td] = today.split('-').map(Number) // tmn is 1-based
  // bookings are allowed from today up to exactly one year ahead
  const maxDate = `${ty + 1}-${pad(tmn)}-${pad(td)}`
  // The calendar roams freely — no floor and no ceiling on which month can be
  // looked at. It was pinned to a year either side, which is a rule about
  // BOOKING applied to LOOKING, and the two are not the same thing: an event a
  // year and a half out is worth seeing even though it cannot be booked yet.
  //
  // Nothing here lets you book outside the window. Four guards stand in the way
  // and none of them depend on how far the calendar can be scrolled: an empty
  // out-of-window tile does not open, its modal offers no New Booking and says
  // why, and the form refuses the date on save.
  const [month, setMonth] = useState(() => ({ y: ty, m: tmn - 1 }))
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [propFilter, setPropFilter] = useState(scopeAll ? 'all' : defaultProp)
  const [selectedDate, setSelectedDate] = useState(null) // ISO -> day modal
  const [creatingDate, setCreatingDate] = useState(null) // ISO -> create modal
  const [createPrefill, setCreatePrefill] = useState(null) // prefill from an LMS event
  const [editingBooking, setEditingBooking] = useState(null) // existing booking being edited

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
  const [lmsLoading, setLmsLoading] = useState(true)
  useEffect(() => {
    let alive = true
    // Cached in lms.js — this is 88 pages and about twelve seconds cold, so the
    // second visit to this page should not pay for it again. `onFresh` is the
    // other half: past the cache's TTL the stale contracts arrive instantly and
    // the newer ones replace them here when the background refresh lands.
    lmsVenueContracts({}, { onFresh: (rows) => { if (alive) setLms(rows) } })
      .then((rows) => { if (alive) setLms(rows) })
      .catch((e) => { if (alive) setLmsError(e.message || 'Could not reach LMS') })
      .finally(() => { if (alive) setLmsLoading(false) })
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
      // venue 20 = the CRM's "All Venues" catch-all; it belongs to every property
      // rather than none, so it must survive the property filter (LMS_API_Mapping.md)
      if (vid && vid !== LMS_ALL_VENUES && allowedVenues.size && !allowedVenues.has(vid)) return // other venue
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

  const canPrev = true
  const canNext = true
  const shiftMonth = (delta) => {
    setMonth(({ y, m }) => {
      const nm = m + delta
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }
    })
  }

  const openCreate = (iso, prefill = null) => { setSelectedDate(null); setCreatePrefill(prefill); setCreatingDate(iso || today) }
  const openEdit = (booking) => { setSelectedDate(null); setEditingBooking(booking); setCreatingDate(booking.event_date) }

  // Back to the day it was opened from, not out to the calendar.
  //
  // Every route into the booking form comes from the day view — the New Booking
  // button, an event's "+ Valet Booking", and editing a booking card — and
  // saving dropped the reader onto the month grid, from where getting back to
  // that day is another tap. It matters more now that a booked event disappears
  // from the day's event list: the next thing after saving is usually the next
  // event on the same day, on the list that just got shorter.
  //
  // `creatingDate` is the day in all three cases, including an edit, where it
  // was set from the booking's own date.
  const closeCreate = () => {
    setSelectedDate(creatingDate)
    setCreatingDate(null)
    setCreatePrefill(null)
    setEditingBooking(null)
  }

  // The same sheet the Bookings tab exports, from the same query — so the two
  // buttons can never disagree about what "the next seven dates" means.
  const [exporting, setExporting] = useState(false)
  const exportUpcoming = async () => {
    setExporting(true)
    try {
      const sections = await upcomingBookingSections({ scopeAll, user, property: propFilter })
      if (!sections.length) {
        confirm({ message: t.noBookings, danger: false, hideCancel: true, confirmLabel: t.ok })
        return
      }
      if (!exportBookingsPdf(sections, lang, canSeeGuestPhone(user?.role))) {
        confirm({ message: t.popupBlocked, danger: false, hideCancel: true, confirmLabel: t.ok })
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <SectionTitle>{t.valet}</SectionTitle>

      <Tabs
        tabs={[
          { key: 'calendar', label: t.calendar },
          { key: 'calculator', label: t.calculator },
          // These two read the LIVE valet parking system — a different
          // Supabase project. Everything above them is our own bookings table.
          { key: 'analytics', label: t.analytics },
          { key: 'records', label: t.records },
        ]}
        active={view}
        onChange={setView}
      />

      {view === 'records' ? (
        <ValetRecords visibleProps={visibleProps} scopeAll={scopeAll} />
      ) : view === 'analytics' ? (
        <ValetAnalytics visibleProps={visibleProps} scopeAll={scopeAll} />
      ) : view === 'calculator' ? (
        <Calculator C={C} t={t} lang={lang} visibleProps={visibleProps} defaultProp={defaultProp} matrix={matrix} canEdit={scopeAll} onMatrixSaved={loadMatrix} />
      ) : (
        <>
          {/* property filter — only for admins who oversee all properties */}
          {scopeAll && (wide ? (
            // each chip carries the venue's own dot colour, so the filter reads
            // as the same language as the dots on the grid below it
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <FilterChip active={propFilter === 'all'} onClick={() => setPropFilter('all')}>{t.all}</FilterChip>
              {PROPERTIES.map((p) => (
                <FilterChip
                  key={p.code}
                  dot={VENUE_COLORS[p.code]}
                  dotRing={VENUE_DOT_RING}
                  active={propFilter === p.code}
                  onClick={() => setPropFilter(p.code)}
                >
                  {propName(p.code, lang)}
                </FilterChip>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 14, maxWidth: 320 }}>
              <FilterField label={t.properties}>
                <select style={filterStyle(C)} value={propFilter} onChange={(e) => setPropFilter(e.target.value)}>
                  <option value="all">{t.all}</option>
                  {PROPERTIES.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
                </select>
              </FilterField>
            </div>
          ))}

          {/* The Bookings tab's sheet, reachable without leaving the calendar.
              Its own row rather than tucked into the filter chips: an admin
              posted to one venue has no chip row at all, and the button must
              still be there. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button variant="primary" onClick={exportUpcoming} disabled={exporting} style={{ padding: '8px 13px', fontSize: 13 }}>
              <Icon name="download" size={15} color="#fff" style={{ marginRight: 5 }} />
              {t.exportPdf}
            </Button>
          </div>

          {/* month navigator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => shiftMonth(-1)} disabled={!canPrev} style={navBtn(C, !canPrev)} aria-label={t.prevMonth}>
              <Icon name="chevronLeft" size={18} color={canPrev ? C.text : C.faint} />
            </button>
            <MonthPicker C={C} lang={lang} month={month} onPick={setMonth} />
            <button onClick={() => shiftMonth(1)} disabled={!canNext} style={navBtn(C, !canNext)} aria-label={t.nextMonth}>
              <Icon name="chevronRight" size={18} color={canNext ? C.text : C.faint} />
            </button>
          </div>

          {/* one strip, three states: loading -> legend, or the failure */}
          {lmsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '2px 2px 0', fontSize: 12.5, color: C.tl }}>
              <Spinner size={14} /> {t.loadingEvents}
            </div>
          ) : lmsError ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '2px 2px 0', fontSize: 12.5, color: C.red }}>
              <Icon name="warning" size={14} color={C.red} /> {t.eventsLoadFailed}
            </div>
          ) : null}

          {/* which colour is which venue — dots alone would be a guessing game */}
          {!lmsLoading && Object.keys(lmsByDate).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', marginBottom: 10, padding: '2px 2px 0' }}>
              {/* only venues that have their own colour — a venue the CRM does not
                  know (no LMS id) would otherwise borrow another venue's hue */}
              {visibleProps.filter((pr) => VENUE_COLORS[pr.code]).map((pr) => (
                <span key={pr.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.tl }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: VENUE_COLORS[pr.code], boxShadow: `inset 0 0 0 1px ${VENUE_DOT_RING}`, flexShrink: 0 }} />
                  {propName(pr.code, lang)}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <Loader label={t.loading} />
          ) : (
            <Card style={{ padding: 10 }}>
              {/* weekday header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 5 }}>
                {weekdays(lang).map((w, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: C.tl }}>{w}</div>
                ))}
              </div>
              {/* day grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                {cells.map((d, i) => {
                  if (d == null) return <div key={i} />
                  const iso = ymd(month.y, month.m, d)
                  const list = byDate[iso] || []
                  const dayEvents = lmsByDate[iso] || []
                  const lmsCount = dayEvents.length
                  // one dot per VENUE, not per event — four venues at most, in a
                  // fixed order so a venue keeps its position from day to day
                  const venueCounts = visibleProps
                    .map((pr) => ({
                      code: pr.code,
                      name: propName(pr.code, lang),
                      n: dayEvents.filter((e) => PROP_BY_LMS_VENUE[Number(e.venueId)] === pr.code).length,
                    }))
                    .filter((v) => v.n > 0)
                  // Booked venues in PROPERTIES order, so a venue keeps the
                  // same side of the tile from one day to the next.
                  const bookedVenues = visibleProps
                    .filter((pr) => list.some((b) => b.property === pr.code))
                    .map((pr) => pr.code)
                  const isToday = iso === today
                  const isPast = iso < today // past dates can't be booked...
                  const hasItems = list.length > 0 || lmsCount > 0
                  const canOpen = !isPast || hasItems // ...but past dates with bookings/events open for viewing & deleting
                  return (
                    <button
                      key={i}
                      onClick={() => canOpen && setSelectedDate(iso)}
                      disabled={!canOpen}
                      // Colour is never the only thing that says which venue —
                      // the legend above names them and this names them here.
                      title={bookedVenues.length
                        ? bookedVenues.map((c) => propName(c, lang)).join(', ')
                        : undefined}
                      style={{
                        position: 'relative', height: 'clamp(42px, 8.5vh, 68px)', borderRadius: 10,
                        border: `1px solid ${isToday ? C.maroon : C.border}`,
                        // The bands go on backgroundImage over a solid base, so
                        // the translucency reads against the tile rather than
                        // against whatever is behind the card.
                        background: isPast ? C.cardAlt : C.card,
                        backgroundImage: venueBands(bookedVenues, theme),
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                        cursor: canOpen ? 'pointer' : 'not-allowed',
                        opacity: isPast ? (hasItems ? 0.75 : 0.45) : 1,
                      }}
                    >
                      {/* Today is normally maroon, but MEASURED against the
                          bands it drops to 2.5:1 in dark — so on a banded tile
                          the number takes the ordinary ink, which clears 6.3:1
                          on every venue colour in both themes. Today is still
                          marked: it keeps the maroon border and the bold weight. */}
                      <span style={{
                        fontSize: 14,
                        fontWeight: isToday ? 800 : 600,
                        color: isToday && !bookedVenues.length ? C.maroon : C.text,
                      }}>
                        {d}
                      </span>
                      {/* The count pill is gone above one booking: the bands are
                          the count, and a maroon pill sitting on top of blue and
                          yellow bands fought the colours it was labelling. Two
                          bookings still say so, in ink rather than brand fill. */}
                      {list.length > 1 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.tl, lineHeight: 1.4 }}>
                          {list.length}
                        </span>
                      )}
                      {/* one dot per venue with an event on this date */}
                      {lmsCount > 0 && (
                        <span
                          title={venueCounts.length
                            ? venueCounts.map((v) => `${v.name} · ${v.n}`).join(', ')
                            : `${lmsCount} venue event(s)`}
                          style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 2 }}
                        >
                          {(venueCounts.length ? venueCounts : [{ code: null, n: lmsCount }]).map((v, vi) => (
                            <span
                              key={v.code || vi}
                              style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: VENUE_COLORS[v.code] || C.tl,
                                // inner ring keeps a pale hue visible on white;
                                // outer white ring keeps touching dots countable
                                boxShadow: `inset 0 0 0 1px ${VENUE_DOT_RING}, 0 0 0 1px ${C.card}`,
                              }}
                            />
                          ))}
                        </span>
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
          lmsList={lmsByDate[selectedDate] || []} lmsError={lmsError} lmsCount={lms.length}
          visibleProps={visibleProps} monthBookings={bookings} maxDate={maxDate}
          onClose={() => setSelectedDate(null)}
          onAdd={() => openCreate(selectedDate)}
          onCreateFrom={(prefill) => openCreate(selectedDate, prefill)}
          onEdit={openEdit}
          onChanged={load}
        />
      )}

      {creatingDate && (
        <CreateModal
          C={C} t={t} lang={lang} user={user} visibleProps={visibleProps} defaultProp={defaultProp} matrix={matrix}
          date={creatingDate} minDate={today} maxDate={maxDate} existing={bookings} prefill={createPrefill} editing={editingBooking}
          onClose={closeCreate}
          onSaved={() => { closeCreate(); load() }}
        />
      )}
    </div>
  )
}

// Jump to a month, without a 25-row scrolling list.
//
// A native <select> was tried and is wrong here for a reason worth writing down:
// the browser paints the dropdown itself, so `background: transparent` never
// reaches it while `color` does — in dark theme that is near-white option text
// on the browser's own light popup, unreadable. `color-scheme: dark` patches it,
// but a 25-item scroll to reach March is a poor control either way.
//
// A year-grouped grid of short month names instead: every month the arrows can
// reach, visible at once, three rows of four. Nothing to scroll and nothing that
// depends on the browser's own styling.
// Jump to a month: one year at a time, twelve months in a grid.
//
// A native <select> was tried first and is wrong here twice over. The browser
// paints the dropdown itself, so `background: transparent` never reaches it
// while `color` does — in dark theme that is near-white option text on the
// browser's own light popup, unreadable. And a 25-item scroll to reach March is
// a poor control even where it renders.
//
// A grid shows every month of a year at once, so any month is at most one year
// step plus one tap away, and the year arrows are not bounded — looking at a
// month is not the same act as booking in it, and an event eighteen months out
// is worth seeing before it can be booked.
function MonthPicker({ C, lang, month, onPick }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(month.y)
  const boxRef = useRef(null)

  // Opening always starts on the month being shown, however far the year was
  // wandered last time.
  useEffect(() => { if (open) setYear(month.y) }, [open, month.y])

  // A panel that covers the grid must close on a click anywhere else and on Esc
  // — the second because a keyboard user who opened it has no other way out.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const now = new Date()

  return (
    <span ref={boxRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={lang === 'hi' ? 'महीना चुनें' : 'Pick a month'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
          background: open ? C.cardAlt : 'transparent',
          border: `1px solid ${open ? C.borderStrong : 'transparent'}`,
          fontSize: 16, fontWeight: 800, color: C.text,
        }}
      >
        {monthName(month.m, lang)} {month.y}
        <Icon name="chevronRight" size={13} color={C.tl} style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, width: 290, padding: 14,
            background: C.card, border: `1px solid ${C.borderStrong}`,
            borderRadius: 16, boxShadow: C.shadowLg || C.shadow,
          }}
        >
          {/* the year, with its own arrows — the months below never scroll */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label={lang === 'hi' ? 'पिछला साल' : 'Previous year'}
              style={arrowBtn(C, false)}
            >
              <Icon name="chevronLeft" size={16} color={C.text} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label={lang === 'hi' ? 'अगला साल' : 'Next year'}
              style={arrowBtn(C, false)}
            >
              <Icon name="chevronRight" size={16} color={C.text} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {Array.from({ length: 12 }, (_, m) => {
              const on = month.y === year && month.m === m
              const today = year === now.getFullYear() && m === now.getMonth()
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onPick({ y: year, m }); setOpen(false) }}
                  style={{
                    padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                    fontSize: 13, fontWeight: on ? 800 : 600,
                    background: on ? C.brandBg : 'transparent',
                    color: on ? '#fff' : C.text,
                    // The current month keeps a ring when it is not the selected
                    // one, so "where am I" and "where is now" stay two readable
                    // states rather than one.
                    border: `1px solid ${on ? C.brandBg : (today ? C.maroon : 'transparent')}`,
                  }}
                >
                  {monthShort(m, lang)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </span>
  )
}

const arrowBtn = (C, off) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 9,
  background: 'transparent', border: `1px solid ${off ? C.border : C.borderStrong}`,
  cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1,
})


/* ------------------------------- day view ------------------------------- */
function DayModal({ C, t, date, list, lmsList = [], lmsError = '', lmsCount, scopeAll, matrix, visibleProps, monthBookings, maxDate, onClose, onAdd, onCreateFrom, onEdit, onChanged }) {
  const { lang } = useLang()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

  // one booking per property per day: only offer "New Booking" while at least
  // one bookable property is still free on this date.
  const bookedCodes = new Set(monthBookings.filter((b) => b.event_date === date).map((b) => b.property))
  const allBooked = visibleProps.every((p) => bookedCodes.has(p.code))
  const isPast = date < todayISO() // past dates: view/delete only, no new bookings
  // The mirror of isPast at the other end. The calendar can now be scrolled as
  // far ahead as anyone likes, but a booking is still only allowed a year out —
  // so past that, this behaves exactly as a past date does: look, do not book.
  // Without it the New Booking button would open a form that refuses to save,
  // which is a worse way to learn the rule than being told it here.
  const tooFar = !!maxDate && date > maxDate
  const noNewBookings = isPast || tooFar

  async function del(id) {
    if (!(await confirm({ message: t.deleteBookingConfirm }))) return
    setBusy(true)
    await supabase.from('valet_bookings').delete().eq('id', id)
    setBusy(false)
    onChanged()
  }

  return (
    <Modal
      open onClose={onClose} title={fmtLong(date, lang)}
      footer={
        noNewBookings
          ? (
            <div style={{ fontSize: 13, color: C.tl, textAlign: 'center', width: '100%' }}>
              {isPast
                ? (t.pastDateNoBooking || "Past date — bookings can't be added.")
                : (lang === 'hi'
                  ? 'बुकिंग सिर्फ़ एक साल आगे तक हो सकती है।'
                  : 'Bookings can only be made up to a year ahead.')}
            </div>
          )
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
              <BookingCard key={b.id} C={C} t={t} lang={lang} b={b} scopeAll={scopeAll} matrix={matrix} busy={busy} onEdit={() => onEdit?.(b)} onDelete={() => del(b.id)} />
            ))}
          </div>
        </>
      )}

      {/* confirmed venue events + contract details from the LMS for this date */}
      {/* `list` is this date's bookings — what the panel checks each event
          against. Deleting a booking reloads the day, so the event comes back
          on its own; nothing has to remember to put it there. */}
      <LmsVenuePanel C={C} t={t} date={date} list={lmsList} booked={list} error={lmsError} isPast={noNewBookings} loadedCount={lmsCount} onCreateFrom={onCreateFrom} />
    </Modal>
  )
}

/* ---- LMS confirmed venue events + contract details for one date ---- */
// An event that already has a booking drops out of this list.
//
// It used to sit here after being booked, looking like work still to do — and
// that is not only untidy. On 15 Feb 2027 the same event was booked twice: the
// first took Exotica, which is the venue the event names, and the second fell
// through to firstFree(date) and landed on Manaktala, a venue with no such event
// at all. With the event gone after the first booking, the second could not have
// happened.
//
// Matched on CUSTOMER NAME + TIME, not on the entry number. Two events can share
// an entry number and be different bookings — this same date carries 00631
// twice, at 10:00 for 150 people and 19:00 for 300 — so keying on it would hide
// the evening event the moment somebody booked the morning one.
//
// Name and time are what the booking form copies off the event and what the
// booking stores, so they match exactly. That also makes this work for bookings
// made BEFORE this existed, which a stored id could never have done.
//
// If somebody edits the name or the time afterwards, the event comes back into
// the list. That is the safe direction to fail: showing an event that is already
// booked costs a second look, hiding one that is not costs the booking.
function LmsVenuePanel({ C, t, date, list = [], booked = [], error = '', isPast = false, loadedCount, onCreateFrom }) {
  // Read here rather than threaded down, the same way DayModal above does it.
  const { lang } = useLang()
  // Read here rather than threaded down from Valet: this is three levels below
  // it, and a prop passed through two components that do not use it is two
  // chances to forget it on the next panel somebody adds.
  const { user: viewer } = useAuth()
  const showPhone = canSeeGuestPhone(viewer?.role)
  // build a valet-booking prefill from an LMS venue event
  // One key both sides can produce. to24h() so "10:00" and "10:00 AM" are the
  // same slot however either side happens to write it.
  const slot = (name, time) => `${String(name || '').trim().toLowerCase()}|${to24h(String(time || '')) || String(time || '').trim()}`
  const takenSlots = new Set(booked.map((b) => slot(b.customer_name, b.event_time)))
  const open = list.filter((c) => !takenSlots.has(slot(c.customer, c.time)))
  const hidden = list.length - open.length

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
      ) : open.length === 0 && hidden > 0 ? (
        // Not "no events" — every one of them has a booking, which is a
        // different thing and the thing somebody wants to know.
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.green }}>
          <Icon name="check" size={15} color={C.green} />
          {lang === 'hi'
            ? `सभी ${hidden} इवेंट की बुकिंग हो चुकी है`
            : `All ${hidden} event${hidden === 1 ? '' : 's'} booked`}
        </div>
      ) : list.length === 0 ? (
        <div>
          <div style={{ fontSize: 13, color: C.tl }}>{t.noLmsEvents}</div>
          {typeof loadedCount === 'number' && loadedCount > 0 && (
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5, lineHeight: 1.45 }}>
              {t.lmsLoadedNote.replace('{n}', loadedCount)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* A quiet line, not a badge: it explains why the list is shorter than
              the CRM's own count without competing with the events themselves. */}
          {hidden > 0 && (
            <div style={{ fontSize: 11.5, color: C.faint }}>
              {lang === 'hi'
                ? `${hidden} इवेंट की बुकिंग हो चुकी है, इसलिए यहाँ नहीं दिख रहे`
                : `${hidden} already booked, so not listed here`}
            </div>
          )}
          {open.map((c) => (
            <div key={c.rowId} style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.customer || c.functionType || 'Venue event'}</div>
              <div style={{ fontSize: 12.5, color: C.tl, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {c.time && <Meta C={C} icon="clock" text={fmtTime(c.time)} />}
                {c.guests != null && <Meta C={C} icon="team" text={`${c.guests} pax`} />}
                {c.functionType && <Meta C={C} icon="star" text={String(c.functionType)} />}
                {c.location && <Meta C={C} icon="pin" text={String(c.location)} />}
                {showPhone && c.phone && <Meta C={C} icon="phone" text={String(c.phone)} />}
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

function BookingCard({ C, t, lang, b, scopeAll, matrix, busy, onEdit, onDelete }) {
  const { user: viewer } = useAuth()
  const showPhone = canSeeGuestPhone(viewer?.role)
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
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.tl, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="pin" size={13} color={C.tl} /> {propName(b.property, lang)}
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
        {b.event_time && <Meta C={C} icon="clock" text={fmtTime(b.event_time)} />}
        <Meta C={C} icon="team" text={`${b.guests || 0} ${t.guestCount.toLowerCase()}`} />
        {showPhone && b.phone && <Meta C={C} icon="phone" text={b.phone} />}
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
              <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: C.brandBg, opacity: on ? 1 : 0.15 }} />
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
function CreateModal({ C, t, lang, user, visibleProps, defaultProp, date, minDate, maxDate, matrix, existing = [], prefill = null, editing = null, onClose, onSaved }) {
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
  // A fact about the DATE, not about the staffing — a wedding night against a
  // quiet weekday. Stored on the booking so reopening it does not silently drop
  // the two extra drivers on the next save.
  const [heavy, setHeavy] = useState(() => !!editing?.heavy_date)
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
  // What the matrix says for this many guests, before the heavy-date uplift —
  // kept so the note below can show the two numbers rather than just the total.
  const baseDrivers = alloc?.breakdown?.find((b) => b.role === HEAVY_ROLE)?.count
  const autoBreakdown = withHeavy(alloc ? alloc.breakdown : null, heavy)
  // effective staffing = admin override if set, else the matrix result
  const effBreakdown = manual || autoBreakdown
  const effTotal = effBreakdown ? effBreakdown.reduce((s, x) => s + (Number(x.count) || 0), 0) : null

  // Seeded from the EFFECTIVE numbers, so a heavy date's two extra drivers are
  // already in the boxes when the admin starts editing rather than being lost.
  const startEdit = () => { if (!manual) setManual((effBreakdown || []).map((x) => ({ ...x }))); setEditStaff(true) }
  const setRoleCount = (i, v) => setManual((m) => (m || []).map((x, idx) => (idx === i ? { ...x, count: Math.max(0, Math.floor(Number(v) || 0)) } : x)))
  const useAuto = () => { setManual(null); setEditStaff(false) }

  async function save() {
    if (!form.event_date) { setErr(`${t.dateLabel} ${t.isRequired}`); return }
    // when editing, keeping the booking's original (possibly past) date is allowed
    const dateChanged = !editing || form.event_date !== editing.event_date
    if (dateChanged && form.event_date < minDate) { setErr('Bookings cannot be made for past dates'); return }
    if (form.event_date > maxDate) { setErr('Bookings can only be made up to one year ahead'); return }
    if (overGuestLimit(form.guests)) { setErr(t.guestLimitExceeded); return }
    if (!/^\d{10}$/.test(form.phone)) { setErr(t.phoneRule); return }
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
      setErr(`${propName(form.property, lang)} already has a booking on ${form.event_date}`)
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
      heavy_date: heavy,
      notes: form.notes || null,
    }
    const { error } = editing
      ? await supabase.from('valet_bookings').update(payload).eq('id', editing.id)
      : await supabase.from('valet_bookings').insert({ id: `v_${Date.now()}_${Math.round(performance.now())}`, ...payload, created_by: user.id })
    setBusy(false)
    if (error) {
      setErr(error.code === '23505'
        ? `${propName(form.property, lang)} already has a booking on ${form.event_date}`
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
          <Field label={t.properties}>
            <select style={inputStyle(C)} value={form.property} onChange={set('property')} disabled={availableProps.length <= 1}>
              {availableProps.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
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
          <Field label={t.dateLabel}>
            <input type="date" min={minDate} max={maxDate} style={inputStyle(C)} value={form.event_date} onChange={onDate} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label={`${t.eventTime} (${t.optional})`}>
            <input type="time" style={inputStyle(C)} value={to24h(form.event_time)} onChange={set('event_time')} />
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
          onChange={(e) => setForm((f) => ({ ...f, phone: typedPhone(e.target.value) }))}
          placeholder={t.phonePlaceholder}
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

          {/* What kind of night this is. Two named choices rather than an
              unlabelled switch: "heavy" alone does not say what the other
              position means, and this one changes the staffing below it. */}
          <div style={{ display: 'flex', gap: 3, padding: 3, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, marginBottom: 12 }}>
            {[
              { key: false, label: lang === 'hi' ? 'सामान्य तारीख़' : 'Light date' },
              { key: true, label: lang === 'hi' ? 'भारी तारीख़' : 'Heavy date' },
            ].map((o) => {
              const on = heavy === o.key
              return (
                <button
                  key={String(o.key)}
                  type="button"
                  onClick={() => setHeavy(o.key)}
                  aria-pressed={on}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 999, whiteSpace: 'nowrap',
                    fontSize: 12.5, fontWeight: on ? 700 : 600,
                    background: on ? C.brandBg : 'transparent',
                    color: on ? '#fff' : C.tl,
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>

          {editStaff ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10, marginBottom: 12 }}>
                {(manual || []).map((x, i) => (
                  <div key={x.role} style={{ background: C.bg, borderRadius: 10, padding: 10, textAlign: 'center' }}>
                    <input
                      {...wholeNumberField((v) => setRoleCount(i, v))}
                      value={x.count}
                      style={{ ...inputStyle(C), textAlign: 'center', fontSize: 20, fontWeight: 800, padding: '6px 4px' }}
                    />
                    <div style={{ fontSize: 13, color: C.tl, fontWeight: 600, marginTop: 6 }}>{x.role}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 4px 0', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontWeight: 700 }}>{t.totalStaff}</span>
                <span style={{ fontWeight: 800, color: C.maroon, fontSize: 20 }}>{effTotal ?? 0}</span>
              </div>
            </>
          ) : (
            <StaffBreakdown C={C} result={{ breakdown: effBreakdown || [], total: effTotal ?? 0 }} />
          )}

          {/* Why the number moved. A count that changes when you press a button
              and does not say why is a count nobody trusts. */}
          {heavy && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10,
              fontSize: 11.5, lineHeight: 1.5,
              color: manual ? C.faint : C.tl,
              background: manual ? 'transparent' : C.yBg,
              border: `1px solid ${manual ? 'transparent' : `${C.yellow}55`}`,
              borderRadius: 10, padding: manual ? 0 : '8px 10px',
            }}>
              <Icon name="info" size={13} color={manual ? C.faint : C.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {manual
                  // The admin has typed their own numbers, so nothing is being
                  // added on top — saying "+2 added" here would be a lie about
                  // the figures on screen.
                  ? (lang === 'hi'
                    ? 'भारी तारीख़ चुनी है, पर स्टाफ़ आपने खुद भरा है — ऊपर से कुछ नहीं जोड़ा जा रहा।'
                    : 'Heavy date is on, but these are your own numbers — nothing is being added on top.')
                  : (lang === 'hi'
                    ? `भारी तारीख़ — ${HEAVY_EXTRA} ड्राइवर ज़्यादा${baseDrivers != null ? ` (${baseDrivers} की जगह ${baseDrivers + HEAVY_EXTRA})` : ''}`
                    : `Heavy date — ${HEAVY_EXTRA} extra drivers${baseDrivers != null ? ` (${baseDrivers} becomes ${baseDrivers + HEAVY_EXTRA})` : ''}`)}
              </span>
            </div>
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
// Shared with the analytics export. Two copies of an HTML escaper is how one
// of them quietly stops escaping quotes.
const escapeHtml = esc

// Build a printable page of the given date-grouped bookings and open the browser
// print dialog (user picks "Save as PDF"). No external library needed.
// `showPhone` is a parameter rather than something read inside, because this is
// a plain function, not a component. A printed sheet is the easiest place for a
// hidden column to leak back: the screen hides it and the paper does not.
function exportBookingsPdf(sections, lang, showPhone = true) {
  const genDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const body = sections.map((sec) => {
    const rows = sec.items.map((b) => `
      <tr>
        <td>${escapeHtml(propName(b.property, lang))}</td>
        <td>${escapeHtml(b.customer_name || '—')}</td>
        ${showPhone ? `<td>${escapeHtml(b.phone || '—')}</td>` : ''}
        <td>${escapeHtml(b.event_time ? fmtTime(b.event_time) : '—')}</td>
        <td class="num">${b.guests || 0}</td>
        <td class="num">${b.staff_total ?? '—'}</td>
      </tr>`).join('')
    return `
      <h2>${escapeHtml(fmtLong(sec.date))}</h2>
      <table>
        <thead><tr><th>Venue</th><th>Customer</th>${showPhone ? '<th>Phone</th>' : ''}<th>Time</th><th class="num">Guests</th><th class="num">Staff</th></tr></thead>
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
      .toolbar { position: sticky; top: 0; display: flex; gap: 10px; padding: 12px 0 14px; background: #fff; z-index: 10; }
      .toolbar button { font: inherit; font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 8px; border: 1px solid #7B1E2F; cursor: pointer; }
      .toolbar .close { background: #fff; color: #7B1E2F; }
      .toolbar .print { background: #7B1E2F; color: #fff; }
      @media print { .toolbar { display: none !important; } }
    </style></head><body>
      <div class="toolbar">
        <button class="close" onclick="if(window.history.length>1){history.back()}else{window.close()}">‹ Back</button>
        <button class="print" onclick="window.print()">Print / Save PDF</button>
      </div>
      <div class="head">
        <h1>Ambria Admin — Valet Bookings</h1>
        <p>Next ${sections.length} booking day(s) from today · Generated ${escapeHtml(genDate)}</p>
      </div>
      ${body}
    </body></html>`

  const w = window.open('', '_blank')
  if (!w) return false   // caller shows the in-app notice
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
  return true
}

// The next seven DISTINCT dates that have bookings — seven dates, not seven
// bookings, since a date can hold one per venue.
//
// QUERIED, not taken from a list the caller already holds. The Calendar only
// loads the month on screen, so an export built from its rows would quietly stop
// at the end of the month while still calling itself "the next seven dates".
// Both tabs come through here so they cannot produce two different files under
// one label.
async function upcomingBookingSections({ scopeAll, user, property = 'all' }) {
  let q = supabase
    .from('valet_bookings')
    .select('*')
    .gte('event_date', todayISO())
    .order('event_date', { ascending: true })
  if (!scopeAll) q = q.eq('property', user.property)
  else if (property !== 'all') q = q.eq('property', property)

  const { data } = await q
  const byDate = {}
  const days = []
  ;(data || []).forEach((b) => {
    if (!byDate[b.event_date]) { byDate[b.event_date] = []; days.push(b.event_date) }
    byDate[b.event_date].push(b)
  })
  return days.slice(0, 7).map((d) => ({ date: d, items: byDate[d] }))
}

/* --------------------------- staffing calculator --------------------------- */
function Calculator({ C, t, lang, visibleProps, defaultProp, matrix, canEdit, onMatrixSaved }) {
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
            <Field label={t.properties}>
              <select style={inputStyle(C)} value={property} onChange={(e) => { setProperty(e.target.value); setEditing(false) }} disabled={visibleProps.length <= 1}>
                {visibleProps.map((p) => <option key={p.code} value={p.code}>{propName(p.code, lang)}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label={t.guestCount}>
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
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.enterGuestCount}</div>
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
              <input {...wholeNumberField((v) => setMax(i, v))} value={tr.max} style={{ ...inputStyle(C), padding: '8px 8px', textAlign: 'center' }} />
              {roles.map((r, j) => (
                <input key={r} {...wholeNumberField((v) => setVal(i, j, v))} value={tr.values[j]} style={{ ...inputStyle(C), padding: '8px 6px', textAlign: 'center' }} />
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
