import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { publicAsset } from './paths'

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(publicAsset('sw.js')))

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
