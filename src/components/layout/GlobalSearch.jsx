import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useColors } from '../../context/ThemeContext'
import { useT, useLang } from '../../context/LangContext'
import { useAuth } from '../../context/AuthContext'
import { navForUser } from '../../constants/nav'
import { PROPERTIES, propName, personName, deptName, MEASURED_ROLES } from '../../constants/org'
import { initials, avatarTint } from '../../lib/avatar'
import Icon from '../common/Icon'

// One box for the three things somebody arrives looking for: a person, a venue,
// or a screen.
//
// Deliberately NOT a task search. Tasks are the one thing here with no single
// place to land — a job exists once per venue per person, the boards each filter
// them differently, and "go to this task" would mean teaching every page to open
// on a row. People and venues already have that: Daily Task reads `member` and
// `property` off the navigation state and opens filtered. So the box does the
// three it can do properly rather than four with one of them pretending.
//
// Everything but the people list is known before the box is ever opened. The
// people are fetched once, on the first focus — not on mount, because most
// visits to most pages never touch this.

const MAX_PER_GROUP = 5

// Fold accents and case so "Sonu" finds "Sonu Mali" and a Hindi name matches
// what was typed in either script's spacing.
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()

export default function GlobalSearch({ onNavigate }) {
  const C = useColors()
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState(null)   // null = not fetched yet
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  // Once, on the first focus. A failure leaves an empty list rather than an
  // error: pages and venues still work, which is most of what this is for.
  const fetchPeople = async () => {
    if (people !== null) return
    setPeople([])
    const { data } = await supabase
      .from('users')
      .select('id, name, name_hi, role, property, department')
      .eq('is_active', true)
      .order('name')
    setPeople((data || []).filter((u) => MEASURED_ROLES.includes(u.role)))
  }

  // Click anywhere else, or press Escape, and it closes. Without the first one a
  // dropdown over a page of buttons eats the next click somebody makes.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const pages = useMemo(() => navForUser(user), [user])

  const groups = useMemo(() => {
    const needle = norm(q)
    if (needle.length < 1) return []
    const out = []

    const hits = (people || []).filter((p) => norm(personName(p, lang)).includes(needle)
      || norm(p.name).includes(needle))
    if (hits.length) {
      out.push({
        key: 'people',
        label: lang === 'hi' ? 'लोग' : 'People',
        items: hits.slice(0, MAX_PER_GROUP).map((p) => ({
          id: `u:${p.id}`,
          title: personName(p, lang),
          sub: [propName(p.property, lang), deptName(p.department, lang)].filter(Boolean).join(' · '),
          seed: p.id,
          // Daily Task already opens on a person when handed one — see the
          // `presetMember` it reads off the navigation state.
          go: () => navigate('/tasks', { state: { member: p.id } }),
        })),
      })
    }

    const venues = PROPERTIES.filter((p) => norm(propName(p.code, lang)).includes(needle)
      || norm(p.name).includes(needle))
    if (venues.length) {
      out.push({
        key: 'venues',
        label: lang === 'hi' ? 'जगह' : 'Venues',
        items: venues.slice(0, MAX_PER_GROUP).map((p) => ({
          id: `p:${p.code}`,
          title: propName(p.code, lang),
          sub: p.area || '',
          icon: 'pin',
          go: () => navigate('/tasks', { state: { property: p.code } }),
        })),
      })
    }

    const screens = pages.filter((it) => norm(t[it.key] || it.key).includes(needle))
    if (screens.length) {
      out.push({
        key: 'pages',
        label: lang === 'hi' ? 'पेज' : 'Pages',
        items: screens.slice(0, MAX_PER_GROUP).map((it) => ({
          id: `n:${it.path}`,
          title: t[it.key] || it.key,
          sub: '',
          icon: it.icon,
          go: () => navigate(it.path),
        })),
      })
    }
    return out
  }, [q, people, pages, lang, t, navigate])

  // One flat list behind the grouped display, because the arrow keys run down
  // the whole thing and do not care where a heading falls.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  useEffect(() => { setCursor(0) }, [q])

  const choose = (item) => {
    if (!item) return
    setQ('')
    setOpen(false)
    inputRef.current?.blur()
    onNavigate?.()
    item.go()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return }
    if (!flat.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % flat.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + flat.length) % flat.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[cursor]) }
  }

  const showPanel = open && q.trim().length > 0
  let n = -1   // running index across groups, to match `cursor`

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: 1, maxWidth: 420, minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        height: 40, padding: '0 14px', borderRadius: 999,
        background: C.card, border: `1px solid ${showPanel ? C.borderStrong : C.border}`,
      }}>
        <Icon name="search" size={16} color={C.faint} />
        <input
          ref={inputRef}
          value={q}
          onFocus={() => { setOpen(true); fetchPeople() }}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          style={{
            flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
            color: C.text, fontSize: 13.5,
          }}
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); inputRef.current?.focus() }}
                  aria-label={t.cancel} style={{ background: 'transparent', padding: 2, lineHeight: 0 }}>
            <Icon name="close" size={14} color={C.faint} />
          </button>
        )}
      </div>

      {showPanel && (
        <div style={{
          position: 'absolute', top: 46, left: 0, right: 0, zIndex: 500,
          background: C.card, border: `1px solid ${C.borderStrong}`,
          borderRadius: 14, boxShadow: C.shadowLg, overflow: 'hidden',
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          {flat.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: C.tl }}>{t.noMatches}</div>
          ) : groups.map((g) => (
            <div key={g.key}>
              <div style={{
                padding: '9px 14px 5px', fontSize: 10.5, fontWeight: 800,
                letterSpacing: '0.07em', textTransform: 'uppercase', color: C.faint,
              }}>
                {g.label}
              </div>
              {g.items.map((item) => {
                n += 1
                const active = n === cursor
                const tint = item.seed ? avatarTint(item.seed, C) : null
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setCursor(flat.indexOf(item))}
                    onClick={() => choose(item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      textAlign: 'left', padding: '9px 14px',
                      background: active ? C.cardAlt : 'transparent', border: 0,
                    }}
                  >
                    {tint ? (
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'grid', placeItems: 'center',
                        fontSize: 11.5, fontWeight: 800, ...tint,
                      }}>
                        {initials(item.title)}
                      </span>
                    ) : (
                      <span style={{
                        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                        display: 'grid', placeItems: 'center', background: C.cardAlt,
                      }}>
                        <Icon name={item.icon || 'search'} size={15} color={C.tl} />
                      </span>
                    )}
                    <span style={{ minWidth: 0 }}>
                      <span style={{
                        display: 'block', fontSize: 13.5, fontWeight: 700, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.title}
                      </span>
                      {item.sub && (
                        <span style={{ display: 'block', fontSize: 11.5, color: C.faint }}>{item.sub}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
