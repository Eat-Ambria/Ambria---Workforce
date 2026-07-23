import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { LangProvider } from './context/LangContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

// Register service worker — auto-updates in background, prompts nothing
registerSW({ immediate: true })

// base path for GitHub Pages (must match vite.config base)
const BASENAME = '/Ambria---Workforce'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={BASENAME}>
        <ThemeProvider>
          <LangProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
