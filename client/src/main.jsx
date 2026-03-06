import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {BrowserRouter} from 'react-router-dom'
import App from './App.jsx'
import "./index.css";
import { AppContextProvider } from './context/AppContext.jsx'

const preventZoom = () => {
  const zoomKeys = ['+', '-', '=', '0']
  let lastTouchEnd = 0

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && zoomKeys.includes(event.key)) {
      event.preventDefault()
    }
  })

  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    },
    { passive: false },
  )

  document.addEventListener('gesturestart', (event) => event.preventDefault())
  document.addEventListener('gesturechange', (event) => event.preventDefault())
  document.addEventListener('gestureend', (event) => event.preventDefault())

  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false },
  )

  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        event.preventDefault()
      }
      lastTouchEnd = now
    },
    { passive: false },
  )
}

preventZoom()


createRoot(document.getElementById('root')).render(
    <BrowserRouter>
    <AppContextProvider>
      <App />
    </AppContextProvider>
    </BrowserRouter>,
)
