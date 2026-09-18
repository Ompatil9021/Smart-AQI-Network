import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import './index.css'
import App from './App.jsx'

window.L = L

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
