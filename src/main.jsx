import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register';

import client from './lib/appwrite'

client.ping();

const updateSW = registerSW({
  onNeedRefresh() {
    // Garante troca imediata do SW para evitar ficar preso em bundle antigo.
    void updateSW(true);
  },
  onOfflineReady() {
    console.log('Nave pronto para uso.');
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
