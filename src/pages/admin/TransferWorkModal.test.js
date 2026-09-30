// The rule that decides what moves when one person's work is handed to another.
// Two kinds of job stay put — one the new person already holds at that venue
// (it would be a duplicate), and one at a venue they do not work at. Everything
// else moves, open repairs included.

import { describe, expect, it } from 'vitest'
import { planTransfer } from './TransferWorkModal'

const task = (over) => ({ id: Math.random().toString(36).slice(2), title: 'Morning round', property: 'pp', category: 'daily', assigned_to: 'old', ...over })
const ids = (rows) => rows.map((r) => r.id)

const ravi = { id: 'new', property: 'pp' }        // posted at Pushpanjali
const vicky = { id: 'new', property: 'all' }      // an all-venue admin

describe('planTransfer', () => {
  it('moves a job at the new person\'s own venue', () => {
    const t = task({ id: 't1' })
    const plan = planTransfer({ tasks: [t], repairs: [], fromId: 'old', to: ravi })
    expect(ids(plan.move)).toEqual(['t1'])
  })

  it('leaves a job at a venue the new person does not work at', () => {
    const t = task({ id: 't1', property: 'ex' })
    const plan = planTransfer({ tasks: [t], repairs: [], fromId: 'old', to: ravi })
    expect(ids(plan.move)).toEqual([])
    expect(ids(plan.venue)).toEqual(['t1'])
  })

  it('moves anything to somebody on every venue', () => {
    const rows = [task({ id: 'a', property: 'ex' }), task({ id: 'b', property: 'mk' })]
    const plan = planTransfer({ tasks: rows, repairs: [], fromId: 'old', to: vicky })
    expect(ids(plan.move)).toEqual(['a', 'b'])
  })

  it('leaves a job the new person already holds at that venue — no duplicates', () => {
    const theirs = task({ id: 'mine', assigned_to: 'new' })
    const leaving = task({ id: 'dup' })
    const plan = planTransfer({ tasks: [theirs, leaving], repairs: [], fromId: 'old', to: ravi })
    expect(ids(plan.dup)).toEqual(['dup'])
    expect(ids(plan.move)).toEqual([])
  })

  it('treats a title differing only in case or spaces as the same job', () => {
    const theirs = task({ id: 'mine', assigned_to: 'new', title: 'morning round ' })
    const plan = planTransfer({ tasks: [theirs, task({ id: 'dup' })], repairs: [], fromId: 'old', to: ravi })
    expect(ids(plan.dup)).toEqual(['dup'])
  })

  it('still moves the same title at a different venue or frequency', () => {
    const theirs = task({ id: 'mine', assigned_to: 'new' })
    const weekly = task({ id: 'w', category: 'weekly' })
    const plan = planTransfer({ tasks: [theirs, weekly], repairs: [], fromId: 'old', to: vicky })
    expect(ids(plan.move)).toEqual(['w'])
  })

  it('never touches anybody else\'s work', () => {
    const other = task({ id: 'x', assigned_to: 'someone-else' })
    const plan = planTransfer({ tasks: [other], repairs: [], fromId: 'old', to: ravi })
    expect(plan.move.length + plan.dup.length + plan.venue.length).toBe(0)
  })

  it('moves open repairs at the new person\'s venue and leaves the rest', () => {
    const repairs = [
      { id: 'r1', property: 'pp', assigned_to: 'old' },
      { id: 'r2', property: 'ex', assigned_to: 'old' },
    ]
    const plan = planTransfer({ tasks: [], repairs, fromId: 'old', to: ravi })
    expect(ids(plan.fixMove)).toEqual(['r1'])
    expect(ids(plan.fixVenue)).toEqual(['r2'])
  })
})
