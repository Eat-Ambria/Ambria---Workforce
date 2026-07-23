import { Component } from 'react'

// Catches render/runtime errors anywhere below it so a single thrown error
// shows a friendly recovery screen instead of a blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[Ambria Ops] Uncaught error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#F5F6F8',
          color: '#1E293B',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#7B1E2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }} aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 1.5 }}>
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening,
            let the admin know.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#7B1E2F',
              color: '#fff',
              border: 'none',
              borderRadius: 11,
              padding: '11px 20px',
              fontSize: 14.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
