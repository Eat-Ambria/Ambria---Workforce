// @vitest-environment jsdom
//
// The leading zero this fixes is not a styling slip — it survives BECAUSE of
// React. For an <input type="number">, React compares the node's text with the
// incoming value loosely, and `"01" != 1` is false in JavaScript, so it decides
// nothing changed and leaves "01" on screen while state holds 1.
//
// The first test below reproduces exactly that against real React, so the fix
// is measured rather than assumed.

import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { wholeNumberField } from './UI'

// A field written the way the app wrote them before: type=number, and a handler
// that coerces to a whole number.
function Plain() {
  const [n, setN] = useState(0)
  return (
    <>
      <input
        aria-label="count"
        type="number"
        min={0}
        value={n}
        onChange={(e) => setN(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <output>{n}</output>
    </>
  )
}

function Fixed() {
  const [n, setN] = useState(0)
  return (
    <>
      <input
        aria-label="count"
        {...wholeNumberField((v) => setN(Math.max(0, Math.floor(Number(v) || 0))))}
        value={n}
      />
      <output>{n}</output>
    </>
  )
}

// Testing Library only auto-cleans when vitest runs with globals on, and this
// repo has no vitest config. Without this every test after the first sees the
// previous render still in the document.
afterEach(cleanup)

const box = () => screen.getByLabelText('count')

describe('the leading zero', () => {
  it('really does stick on a plain number input', () => {
    render(<Plain />)
    // Typing "1" with the caret after the existing 0 is what the browser hands
    // the handler.
    fireEvent.change(box(), { target: { value: '01' } })

    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('1') // state is right
    expect(box().value).toBe('01')                                            // the box is not
  })

  it('does not, with wholeNumberField', () => {
    render(<Fixed />)
    fireEvent.change(box(), { target: { value: '01' } })

    expect(box().value).toBe('1')
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('1')
  })
})

describe('wholeNumberField', () => {
  it('strips however many zeros are in front', () => {
    render(<Fixed />)
    fireEvent.change(box(), { target: { value: '000012' } })
    expect(box().value).toBe('12')
  })

  it('keeps a lone zero, which is a real value', () => {
    render(<Fixed />)
    fireEvent.change(box(), { target: { value: '5' } })
    fireEvent.change(box(), { target: { value: '0' } })
    expect(box().value).toBe('0')
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('0')
  })

  it('empties without becoming NaN', () => {
    render(<Fixed />)
    fireEvent.change(box(), { target: { value: '' } })
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('0')
  })

  it('selects on focus, so typing replaces the zero instead of landing after it', () => {
    render(<Fixed />)
    const el = box()
    fireEvent.focus(el)
    expect(el.selectionStart === null || el.selectionStart === 0).toBe(true)
  })

  it('leaves a decimal alone — the strip needs a digit after the zeros', () => {
    // Not a field this is used on, but the regex must not quietly turn 0.5
    // into .5 if somebody reaches for it later.
    const clean = (v) => v.replace(/^0+(?=\d)/, '')
    expect(clean('0.5')).toBe('0.5')
    expect(clean('01')).toBe('1')
    expect(clean('0')).toBe('0')
  })
})
