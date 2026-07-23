// Valet staff allocation matrices (from management data).
// Each tier: max guest count it covers + role breakdown.
// Calculator picks the first tier whose `max` >= guest count.

export const VALET_MATRIX = {
  pp: {
    name: 'Pushpanjali',
    roles: ['Key Man', 'Driver', 'Guard', 'Rider'],
    tiers: [
      { max: 150, values: [1, 2, 0, 0] },
      { max: 250, values: [1, 4, 0, 0] },
      { max: 350, values: [1, 5, 1, 0] },
      { max: 500, values: [1, 7, 1, 0] },
      { max: 800, values: [1, 10, 2, 1] },
      { max: 1000, values: [1, 13, 2, 1] },
    ],
  },
  ex: {
    name: 'Exotica',
    roles: ['Key Man', 'Driver', 'Guard', 'Rider'],
    tiers: [
      { max: 100, values: [1, 2, 0, 0] },
      { max: 200, values: [1, 3, 0, 0] },
      { max: 300, values: [1, 5, 1, 0] },
      { max: 400, values: [1, 6, 2, 0] },
      { max: 500, values: [1, 8, 2, 0] },
      { max: 600, values: [1, 10, 2, 1] },
      { max: 700, values: [2, 12, 2, 1] },
      { max: 800, values: [2, 14, 2, 1] },
      { max: 900, values: [2, 17, 3, 1] },
      { max: 1000, values: [2, 19, 3, 1] },
    ],
  },
  mk: {
    name: 'Manaktala',
    roles: ['Key Man', 'Driver', 'Guard', 'Rider'],
    tiers: [
      { max: 150, values: [1, 2, 0, 0] },
      { max: 250, values: [1, 4, 0, 0] },
      { max: 350, values: [1, 5, 0, 0] },
      { max: 450, values: [1, 6, 1, 0] },
      { max: 550, values: [1, 8, 1, 0] },
      { max: 700, values: [1, 9, 1, 1] },
      { max: 900, values: [1, 11, 3, 1] },
    ],
  },
  rs: {
    name: 'Restro',
    roles: ['Key Man', 'Driver', 'Guard'],
    tiers: [
      { max: 100, values: [1, 3, 0] },
      { max: 150, values: [1, 4, 0] },
      { max: 200, values: [1, 5, 1] },
    ],
  },
}

// Hard cap on guest count for staffing/bookings.
export const MAX_GUESTS = 1600

// `matrix` lets callers pass a live (admin-edited, DB-loaded) matrix; falls back
// to the built-in defaults when a property isn't present in the override.
export function allocateValet(propertyCode, guests, matrix = VALET_MATRIX) {
  const m = (matrix && matrix[propertyCode]) || VALET_MATRIX[propertyCode]
  if (!m || !Array.isArray(m.tiers) || m.tiers.length === 0) return null
  const g = Math.max(0, Math.floor(Number(guests) || 0))
  const tiers = m.tiers
  const top = tiers[tiers.length - 1]

  let values
  let extrapolated = false
  let tierMax = top.max

  if (g <= top.max) {
    // within the table: first tier whose max covers the guest count
    const tier = tiers.find((tr) => g <= tr.max)
    values = tier.values
    tierMax = tier.max
  } else {
    // beyond the table: extend each role along the slope of the last two tiers,
    // rounding UP so we never under-staff a larger event than the matrix covers.
    extrapolated = true
    tierMax = null
    const prev = tiers[tiers.length - 2] || top
    const span = (top.max - prev.max) || 1
    const overflow = g - top.max
    values = top.values.map((v, i) => {
      const perGuest = (v - (prev.values[i] || 0)) / span // extra staff per extra guest
      return v + Math.ceil(overflow * Math.max(0, perGuest))
    })
  }

  const breakdown = m.roles.map((role, i) => ({ role, count: Math.max(0, values[i] || 0) }))
  const total = breakdown.reduce((s, b) => s + b.count, 0)
  return { property: m.name, roles: m.roles, breakdown, total, tierMax, extrapolated }
}
