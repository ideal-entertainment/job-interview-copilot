import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import OverlayApp from './OverlayApp'
import RegionSelectApp from './RegionSelectApp'
import './App.css'
import './Professional.css'

const windowType = new URLSearchParams(window.location.search).get('window')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {windowType === 'overlay' ? (
      <OverlayApp />
    ) : windowType === 'region' ? (
      <RegionSelectApp />
    ) : (
      <App />
    )}
  </StrictMode>
)
