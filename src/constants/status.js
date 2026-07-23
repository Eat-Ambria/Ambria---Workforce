import { TASK_STATUS } from './org'

// status -> {labelKey, color-key, bg-key} for badges. color/bg resolved against C.
export const STATUS_META = {
  [TASK_STATUS.PENDING]: { key: 'pending', color: 'tl', bg: 'bg' },
  [TASK_STATUS.IN_PROGRESS]: { key: 'inProgress', color: 'blue', bg: 'bBg' },
  [TASK_STATUS.COMPLETION_REQUESTED]: { key: 'completionRequested', color: 'yellow', bg: 'yBg' },
  [TASK_STATUS.COMPLETED]: { key: 'completed', color: 'green', bg: 'gBg' },
  [TASK_STATUS.ISSUE]: { key: 'issue', color: 'red', bg: 'rBg' },
}

export function statusColors(status, C) {
  const m = STATUS_META[status] || STATUS_META.pending
  return { color: C[m.color], bg: C[m.bg], key: m.key }
}
