// A tap ripple on every button in the app, from one listener.
//
// Delegated rather than per-component on purpose: buttons here are plain
// <button> elements with inline styles, written in forty different files. Adding
// a ripple to each would mean touching all of them and remembering to do it on
// the next one — this way a button written tomorrow gets it for free.
//
// The ripple is drawn in a throwaway layer pinned OVER the button, not inside
// it. Inside would need `position: relative; overflow: hidden` forced onto every
// button, which clips the things deliberately hanging outside one — the count on
// the notification bell, the little cross on a photo thumbnail. Over the top,
// nothing existing has to change.

const DURATION = 480 // keep in step with the rippleOut keyframes in index.css

// Buttons that should not take one:
//   * disabled — nothing happened, so nothing should say it did
//   * [data-no-ripple] — an opt-out for anything this gets wrong
//   * the tiny icon-only controls inside a text field (eye, clear), where a
//     ripple the size of the field reads as the field itself responding
const skip = (el) => el.disabled || el.hasAttribute('data-no-ripple')

function spawn(el, x, y) {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return

  const cs = getComputedStyle(el)

  const layer = document.createElement('div')
  layer.className = 'ripple-layer'
  layer.style.left = `${r.left}px`
  layer.style.top = `${r.top}px`
  layer.style.width = `${r.width}px`
  layer.style.height = `${r.height}px`
  // Follow the button's own corners, so a pill ripples as a pill and a square
  // as a square. Copied rather than guessed: these are set inline everywhere.
  layer.style.borderRadius = cs.borderRadius
  // The ripple paints in currentColor; inheriting the button's text colour is
  // what makes one tint work on a maroon button and on a plain white one.
  layer.style.color = cs.color

  // Big enough to reach the furthest corner from where the finger landed, so the
  // wave always finishes covering the button rather than stopping short.
  const dx = Math.max(x - r.left, r.right - x)
  const dy = Math.max(y - r.top, r.bottom - y)
  const size = Math.hypot(dx, dy) * 2

  const dot = document.createElement('span')
  dot.style.width = `${size}px`
  dot.style.height = `${size}px`
  dot.style.left = `${x - r.left - size / 2}px`
  dot.style.top = `${y - r.top - size / 2}px`

  layer.appendChild(dot)
  document.body.appendChild(layer)

  // animationend is not enough on its own: a layer whose animation never runs —
  // the tab backgrounded mid-press, reduced-motion hiding it — would stay in the
  // DOM for good. The timer is the one that always fires.
  const done = () => layer.remove()
  dot.addEventListener('animationend', done, { once: true })
  setTimeout(done, DURATION + 120)
}

let started = false

export function startRipples() {
  // Once, whatever calls it. A second listener would draw a second ripple over
  // the first on every press — twice the ink, and twice as slow on the phones
  // that can least afford it. Hot reload and a double-invoked mount both call
  // this again, and neither is a reason to have two.
  if (started) return
  started = true

  // pointerdown, not click: the ripple should start under the finger as it lands,
  // the way a physical button gives way, not after it is let go.
  document.addEventListener('pointerdown', (e) => {
    // Primary button / single touch only. A right-click opens a menu and a
    // second finger is a pinch; neither is a press of this button.
    if (e.button !== 0 || !e.isPrimary) return
    // Links count. The sidebar and the bottom tab bar are NavLinks — <a>, not
    // <button> — and they are the most-tapped controls in the app, so leaving
    // them out made the ripple look broken rather than absent. The call and
    // WhatsApp buttons on a vendor, and a photo thumbnail, are links too and
    // read the same way: something you press.
    const el = e.target.closest('button, [role="button"], a[href]')
    if (!el || skip(el)) return
    spawn(el, e.clientX, e.clientY)
  }, { passive: true })
}
