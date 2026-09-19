// @vitest-environment jsdom
//
// One listener serves every button in the app, so the things worth pinning are
// the ones that would go unnoticed: that it cleans up after itself, and that it
// stays off the presses that are not presses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startRipples } from './ripple'

// jsdom gives every element a zero-sized rect, which the module treats as "too
// small to ripple". Buttons are given a real one.
const sized = (el, box = { left: 10, top: 20, width: 120, height: 40 }) => {
  el.getBoundingClientRect = () => ({
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => {},
  })
  return el
}

const press = (el, { button = 0, isPrimary = true, x = 40, y = 30 } = {}) => {
  const e = new Event('pointerdown', { bubbles: true })
  Object.assign(e, { button, isPrimary, clientX: x, clientY: y })
  el.dispatchEvent(e)
}

const layers = () => document.querySelectorAll('.ripple-layer')

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  startRipples()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('tap ripple', () => {
  it('draws one over the button, and never inside it', () => {
    const btn = sized(document.createElement('button'))
    document.body.appendChild(btn)

    press(btn)

    expect(layers()).toHaveLength(1)
    // Inside the button it would have to clip, which would cut off the things
    // that hang outside one — a notification count, a thumbnail's remove cross.
    expect(btn.querySelector('.ripple-layer')).toBeNull()
    expect(layers()[0].parentElement).toBe(document.body)
  })

  it('clears itself up even if the animation never fires', () => {
    const btn = sized(document.createElement('button'))
    document.body.appendChild(btn)

    press(btn)
    expect(layers()).toHaveLength(1)

    // A backgrounded tab, or reduced-motion hiding the layer, means no
    // animationend ever arrives. Without the timer these would pile up in the
    // DOM for the life of the session.
    vi.advanceTimersByTime(1000)
    expect(layers()).toHaveLength(0)
  })

  it('stays off a disabled button', () => {
    const btn = sized(document.createElement('button'))
    btn.disabled = true
    document.body.appendChild(btn)

    press(btn)
    // Nothing happened, so nothing should say it did.
    expect(layers()).toHaveLength(0)
  })

  it('honours data-no-ripple', () => {
    const btn = sized(document.createElement('button'))
    btn.setAttribute('data-no-ripple', '')
    document.body.appendChild(btn)

    press(btn)
    expect(layers()).toHaveLength(0)
  })

  it('ignores a right-click and a second finger', () => {
    const btn = sized(document.createElement('button'))
    document.body.appendChild(btn)

    press(btn, { button: 2 })            // opens a menu, not a press
    press(btn, { isPrimary: false })     // the second finger of a pinch
    expect(layers()).toHaveLength(0)
  })

  it('reaches the far corner from wherever the finger landed', () => {
    const btn = sized(document.createElement('button'))
    document.body.appendChild(btn)

    // Pressed at the very left edge: the circle has to span the full width to
    // finish covering the button rather than stopping half way.
    press(btn, { x: 10, y: 40 })
    const dot = layers()[0].firstChild
    expect(parseFloat(dot.style.width)).toBeGreaterThanOrEqual(240)
  })

  it('follows a press on something only acting as a button', () => {
    const div = sized(document.createElement('div'))
    div.setAttribute('role', 'button')
    document.body.appendChild(div)

    press(div)
    expect(layers()).toHaveLength(1)
  })

  it('covers links, because the sidebar and tab bar are made of them', () => {
    // The two most-tapped controls in the app are NavLinks, so leaving <a> out
    // made the ripple look broken rather than absent.
    const a = sized(document.createElement('a'))
    a.href = '/dashboard'
    document.body.appendChild(a)

    press(a)
    expect(layers()).toHaveLength(1)
  })

  it('leaves an anchor with no href alone', () => {
    // Used as a scroll target or a label, not something to press.
    const a = sized(document.createElement('a'))
    document.body.appendChild(a)

    press(a)
    expect(layers()).toHaveLength(0)
  })
})
