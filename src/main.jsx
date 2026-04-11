import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register';

import client from './lib/appwrite'

client.ping();

registerSW({
  onNeedRefresh() {
    // Nova versão disponível — atualiza automaticamente
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
