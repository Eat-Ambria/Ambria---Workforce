// Weekly and monthly work leaves the All tasks list the moment it is done;
// daily and alternate work stays, ticked. This pins that rule — including the
// half-done case, where a job done at two of three venues must stay listed.

import { describe, expect, it } from 'vitest'
import { jobsStillShown } from './StaffProgress'

const row = (over) => ({
  id: Math.random().toString(36).slice(2), title: 'Deep clean', time_block: null,
  property: 'pp', status: 'pending', category: 'weekly', ...over,
})
const titles = (tasks) => jobsStillShown(tasks).map((j) => j.rows[0].title)

describe('jobsStillShown', () => {
  it('drops a weekly job once it is done', () => {
    expect(titles([row({ status: 'completed' })])).toEqual([])
  })

  it('drops a monthly job once it is done', () => {
    expect(titles([row({ category: 'monthly', status: 'completed' })])).toEqual([])
  })

  it('drops Sunday-only work too — it is weekly with day 7', () => {
    expect(titles([row({ week_day: 7, status: 'completed' })])).toEqual([])
  })

  it('keeps a daily job after it is done — it is back tomorrow', () => {
    expect(titles([row({ category: 'daily', status: 'completed' })])).toEqual(['Deep clean'])
  })

  it('keeps alternate-day work after it is done', () => {
    expect(titles([row({ category: 'alternate', status: 'completed' })])).toEqual(['Deep clean'])
  })

  it('keeps weekly work that is not done yet, in progress or pending', () => {
    expect(titles([row({ status: 'in_progress' })])).toEqual(['Deep clean'])
    expect(titles([row({ status: 'pending' })])).toEqual(['Deep clean'])
  })

  it('keeps a job done at some venues but not all', () => {
    const job = [
      row({ property: 'pp', status: 'completed' }),
      row({ property: 'ex', status: 'completed' }),
      row({ property: 'mk', status: 'pending' }),
    ]
    const shown = jobsStillShown(job)
    expect(shown.length).toBe(1)
    // with every venue still in it, so the ticked ones still show as ticked
    expect(shown[0].rows.length).toBe(3)
  })

  it('drops that job once the last venue is done', () => {
    const job = ['pp', 'ex', 'mk'].map((property) => row({ property, status: 'completed' }))
    expect(jobsStillShown(job)).toEqual([])
  })
})
