import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/**
 * main.jsx
 *
 * Entry point for React.
 * StrictMode renders components twice in development to catch side effects.
 * This is intentional — it helps find bugs early.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
