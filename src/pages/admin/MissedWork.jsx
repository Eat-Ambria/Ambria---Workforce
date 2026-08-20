import { useMemo, useState } from 'react'
import { useColors } from '../../context/ThemeContext'
import {
  DEPARTMENT_MAP, deptName, propName, taskFrequency, frequencyLabel, FREQUENCY_MAP,
  scheduleText,
} from '../../constants/org'
import { Card, ProgressBar } from '../../components/common/UI'
import Icon from '../../components/common/Icon'

// What did NOT get done, split the way the roster is written.
//
// Every other figure on this page is built from task_completions, which gains a
// row only when work is finished — so the page could say what happened and never
// what did not. The gap has to be computed: what a job was OWED over the period
// (its own schedule) against what it was CREDITED. The difference is this.
//
// Grouped by frequency first, because a missed daily round and a missed monthly
// audit are not the same failure and should not be ranked against each other in
// one list. Then by person, because "who" is the part an admin can act on.
const BANDS = [
  { key: 'daily', match: (fk) => fk === 'daily' || fk === 'dailyMS' || fk === 'sunday' },
  { key: 'alternate', match: (fk) => fk === 'alternate' || fk === 'alternateMS' },
  { key: 'weekly', match: (fk) => fk === 'weekly' },
  { key: 'monthly', match: (fk) => fk === 'monthly' },
]

export default function MissedWork({ lang, t, rows, periodLabel }) {
  const C = useColors()
  const hi = lang === 'hi'
  const [openKey, setOpenKey] = useState(null)
  // Two lenses on one set of numbers. "Who is behind" is the staffing question;
  // "is this job getting done" is the operations one, and a job three people
  // share can be half-done without any single person looking bad.
  const [view, setView] = useState('person')

  // Rows with nothing missed are kept in `rows` on purpose — the job lens has to
  // list everyone on a job, including whoever did their share.
  const missedOnly = useMemo(() => rows.filter((r) => r.missed > 0), [rows])

  const groups = useMemo(() => BANDS.map((band) => {
    const mine = missedOnly.filter((r) => band.match(taskFrequency(r.task)))
    // by person: the same job unassigned at three venues is three different
    // problems, but one person missing six rounds is one conversation
    const byPerson = new Map()
    mine.forEach((r) => {
      const key = r.task.assignee_name || '_none'
      if (!byPerson.has(key)) {
        byPerson.set(key, {
          key, name: r.task.assignee_name || t.unassigned,
          unassigned: !r.task.assignee_name,
          department: r.task.department, expected: 0, done: 0, missed: 0, tasks: [],
        })
      }
      const p = byPerson.get(key)
      p.expected += r.expected; p.done += r.done; p.missed += r.missed
      p.tasks.push(r)
    })
    const people = [...byPerson.values()].sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name))
    return {
      key: band.key,
      people,
      expected: mine.reduce((n, r) => n + r.expected, 0),
      missed: mine.reduce((n, r) => n + r.missed, 0),
      jobs: mine.length,
    }
  }).filter((g) => g.jobs > 0), [missedOnly, t])

  // One entry per JOB — the same title at the same venue, however many people
  // carry it. In this schema a task row IS one assignee, so three people sharing
  // the morning round are three rows that have to be put back together here.
  const jobGroups = useMemo(() => BANDS.map((band) => {
    const byJob = new Map()
    rows.filter((r) => band.match(taskFrequency(r.task))).forEach((r) => {
      const k = r.task.property + '|' + r.task.department + '|' + r.task.category + '|' + r.task.title
      if (!byJob.has(k)) byJob.set(k, { key: k, task: r.task, expected: 0, done: 0, missed: 0, people: [] })
      const j = byJob.get(k)
      j.expected += r.expected; j.done += r.done; j.missed += r.missed
      j.people.push({
        name: r.task.assignee_name || t.unassigned,
        unassigned: !r.task.assignee_name,
        expected: r.expected, done: r.done, missed: r.missed,
      })
    })
    const jobs = [...byJob.values()]
      .filter((j) => j.missed > 0)
      .sort((a, b) => b.missed - a.missed || (a.task.title || '').localeCompare(b.task.title || ''))
    jobs.forEach((j) => j.people.sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name)))
    return {
      key: band.key,
      jobs,
      missed: jobs.reduce((n, j) => n + j.missed, 0),
      expected: jobs.reduce((n, j) => n + j.expected, 0),
    }
  }).filter((g) => g.jobs.length > 0), [rows, t])

  const totalMissed = missedOnly.reduce((n, r) => n + r.missed, 0)
  const totalOwed = missedOnly.reduce((n, r) => n + r.expected, 0)

  return (
    <div>
      {/* the period is doing a lot of work in these numbers; name it */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: totalMissed ? C.red : C.green, fontVariantNumeric: 'tabular-nums' }}>
          {totalMissed}
        </span>
        <span style={{ fontSize: 13, color: C.tl }}>
          {hi
            ? `बार काम नहीं हुआ — ${totalOwed} बार होना था, ${missedOnly.length} अलग काम, ${periodLabel}`
            : `missed of ${totalOwed} due · ${missedOnly.length} different jobs · ${periodLabel}`}
        </span>
      </div>

      {/* same numbers, two ways in */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['person', hi ? 'बंदे के हिसाब से' : 'By person'], ['task', hi ? 'काम के हिसाब से' : 'By job']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setView(k); setOpenKey(null) }}
            style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
              background: view === k ? C.brandBg : C.card,
              color: view === k ? '#fff' : C.tl,
              border: '1px solid ' + (view === k ? C.maroon : C.border),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {view === 'person' && groups.map((g) => {
          const ink = FREQUENCY_MAP[g.key].ink
          return (
            <Card key={g.key} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, boxShadow: `inset 3px 0 0 ${ink}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink }}>
                    {frequencyLabel(g.key, lang)}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.tl, fontVariantNumeric: 'tabular-nums' }}>
                    {hi
                      ? `${g.expected} में से `
                      : `${g.expected} due · `}
                    <b style={{ color: C.red, fontSize: 14 }}>{g.missed}</b>
                    {hi ? ' नहीं हुए' : ' missed'}
                  </span>
                </div>
              </div>

              {/* header row, so the numbers below have names */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 76px 20px', gap: 10, padding: '8px 14px', background: C.cardAlt, fontSize: 9.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                <span>{hi ? 'किसका काम' : 'Whose work'}</span>
                <span style={{ textAlign: 'center' }}>{hi ? 'हुए' : 'Done'}</span>
                <span style={{ textAlign: 'right' }}>{hi ? 'नहीं हुए' : 'Missed'}</span>
                <span />
              </div>

              {g.people.map((p) => {
                const rowKey = `${g.key}:${p.key}`
                const open = openKey === rowKey
                const donePct = p.expected ? Math.round((p.done / p.expected) * 100) : 0
                return (
                  <div key={rowKey} style={{ borderTop: `1px solid ${C.border}` }}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : rowKey)}
                      aria-expanded={open}
                      style={{
                        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 76px 20px',
                        gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                        background: open ? C.cardAlt : 'transparent', padding: '11px 14px', cursor: 'pointer',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          {p.department && (
                            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: DEPARTMENT_MAP[p.department]?.color || C.tl }} />
                          )}
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: p.unassigned ? C.red : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </span>
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: C.faint, marginTop: 2, paddingLeft: 14 }}>
                          {p.tasks.length} {hi ? 'काम' : (p.tasks.length === 1 ? 'job' : 'jobs')}
                          {p.department ? ` · ${deptName(p.department, lang)}` : ''}
                        </span>
                      </span>
                      <span style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: 12.5, color: C.tl, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                          {p.done}/{p.expected}
                        </span>
                        <ProgressBar value={donePct} tone={donePct === 0 ? C.red : C.yellow} height={5} />
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: C.red, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {p.missed}
                      </span>
                      <Icon name="chevronRight" size={15} color={C.faint} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                    </button>

                    {open && (
                      <div style={{ padding: '2px 14px 12px', display: 'grid', gap: 7 }}>
                        {p.tasks.map((r) => (
                          <div key={r.task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, lineHeight: 1.45 }}>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ color: C.text }}>
                                {hi && r.task.title_hi ? r.task.title_hi : r.task.title}
                              </span>
                              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: C.faint, marginTop: 1 }}>
                                <span>{propName(r.task.property, lang)}</span>
                                {scheduleText(r.task, lang) && <span>{scheduleText(r.task, lang)}</span>}
                              </span>
                            </span>
                            <span style={{ flexShrink: 0, fontSize: 11.5, color: C.red, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {r.missed} {hi ? 'बार' : 'x'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>
          )
        })}

        {view === 'task' && jobGroups.map((g) => {
          const ink = FREQUENCY_MAP[g.key].ink
          return (
            <Card key={g.key} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, boxShadow: `inset 3px 0 0 ${ink}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink }}>
                    {frequencyLabel(g.key, lang)}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.tl, fontVariantNumeric: 'tabular-nums' }}>
                    {g.jobs.length}{hi ? ' काम · ' : ' jobs · '}
                    <b style={{ color: C.red, fontSize: 14 }}>{g.missed}</b>
                    {hi ? ' बार नहीं हुए' : ' missed'}
                  </span>
                </div>
              </div>

              {g.jobs.map((j) => {
                const rowKey = 'job:' + j.key
                const open = openKey === rowKey
                const donePct = j.expected ? Math.round((j.done / j.expected) * 100) : 0
                return (
                  <div key={rowKey} style={{ borderTop: `1px solid ${C.border}` }}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : rowKey)}
                      aria-expanded={open}
                      style={{
                        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 76px 20px',
                        gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                        background: open ? C.cardAlt : 'transparent', padding: '11px 14px', cursor: 'pointer',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                          {hi && j.task.title_hi ? j.task.title_hi : j.task.title}
                        </span>
                        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: C.faint, marginTop: 2 }}>
                          <span>{propName(j.task.property, lang)}</span>
                          {j.task.department && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DEPARTMENT_MAP[j.task.department]?.color || C.tl }} />
                              {deptName(j.task.department, lang)}
                            </span>
                          )}
                          <span>{j.people.length}{hi ? ' लोग' : (j.people.length === 1 ? ' person' : ' people')}</span>
                        </span>
                      </span>
                      <span style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: 12.5, color: C.tl, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                          {j.done}/{j.expected}
                        </span>
                        <ProgressBar value={donePct} tone={donePct === 0 ? C.red : C.yellow} height={5} />
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: C.red, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {j.missed}
                      </span>
                      <Icon name="chevronRight" size={15} color={C.faint} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                    </button>

                    {open && (
                      <div style={{ padding: '4px 14px 12px', display: 'grid', gap: 7 }}>
                        {j.people.map((pp, i) => (
                          <div key={pp.name + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, color: pp.unassigned ? C.red : C.text }}>
                              <Icon name={pp.missed === 0 ? 'check' : 'user'} size={13} color={pp.missed === 0 ? C.green : (pp.unassigned ? C.red : C.tl)} />
                              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pp.name}</span>
                            </span>
                            <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: C.tl }}>
                              {pp.done}/{pp.expected}
                              {pp.missed > 0 && (
                                <b style={{ color: C.red, marginLeft: 8 }}>
                                  {pp.missed}{hi ? ' नहीं हुए' : ' missed'}
                                </b>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
