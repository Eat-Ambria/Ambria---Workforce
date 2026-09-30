// @vitest-environment jsdom
//
// The hover on these rows is a stylesheet rule, and a stylesheet rule loses to
// anything in the element's style attribute. The first version of it set
// `background: transparent` inline on every inactive row, so the hover could
// never apply — and jsdom cannot simulate :hover, so nothing caught it.
//
// What CAN be pinned is the cause: an inactive row must leave background and
// colour to the stylesheet, and only the active row may set them inline.

import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const C = {
  card: '#fff', cardAlt: '#f8fafc', border: '#eee', text: '#111', tl: '#64748b',
  faint: '#94a3b8', maroon: '#7b1e2f', maroonSoft: '#fbedf0', brandBg: '#8a2438',
  shadow: 'none', blue: '#2563eb', bBg: '#eff4ff', green: '#15803d', gBg: '#ecfdf3',
  pink: '#be185d', pkBg: '#fdf2f8', yellow: '#b45309', yBg: '#fef6e7',
}

vi.mock('../../context/ThemeContext', () => ({ useColors: () => C }))
vi.mock('../../context/LangContext', () => ({
  useT: () => new Proxy({}, { get: (_, k) => String(k) }),
  useLang: () => ({ lang: 'en', toggle: () => {} }),
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test User', role: 'sa' }, logout: () => {} }),
}))
vi.mock('../../hooks/useFixRequestCount', () => ({ useFixRequestCount: () => 0 }))
vi.mock('../../constants/nav', () => ({
  navForUser: () => [
    { path: '/dashboard', key: 'dashboard', icon: 'dashboard' },
    { path: '/tasks', key: 'tasks', icon: 'tasks' },
  ],
}))

const { default: Sidebar } = await import('./Sidebar')

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Sidebar />
  </MemoryRouter>
)

describe('Sidebar rows', () => {
  it('leave background and colour to the stylesheet when inactive', () => {
    const { container } = renderAt('/dashboard')
    const inactive = container.querySelector('a[href="/tasks"]')
    expect(inactive.className).toContain('side-link')
    expect(inactive.className).not.toContain('is-active')
    // The actual bug: either of these set inline and the hover is dead.
    expect(inactive.style.background).toBe('')
    expect(inactive.style.color).toBe('')
  })

  it('paint the active row inline, which is where it must win', () => {
    const { container } = renderAt('/dashboard')
    const active = container.querySelector('a[href="/dashboard"]')
    expect(active.className).toContain('is-active')
    expect(active.style.background).not.toBe('')
    expect(active.style.color).not.toBe('')
  })

  it('give the two footer buttons the same class and no inline colour', () => {
    const { container } = renderAt('/dashboard')
    const buttons = [...container.querySelectorAll('button.side-link')]
    // the language toggle and sign-out
    expect(buttons.length).toBe(2)
    buttons.forEach((b) => {
      expect(b.style.background).toBe('')
      expect(b.style.color).toBe('')
    })
  })

  it('put the hover colours on the sidebar itself, once', () => {
    const { container } = renderAt('/dashboard')
    const aside = container.querySelector('aside')
    expect(aside.style.getPropertyValue('--side-hover')).toBe(C.cardAlt)
    expect(aside.style.getPropertyValue('--side-ink')).toBe(C.tl)
  })
})
