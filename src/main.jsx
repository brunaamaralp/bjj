import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './styles/date-input.css'
import './styles/forms.css'
import App from './App.jsx'
import { queryClient } from './lib/queryClient'
import { registerSW } from 'virtual:pwa-register';
import { initStores } from './lib/initStores.js';
import { clearChunkReloadFlag, installChunkLoadRecovery } from './lib/lazyWithRetry.js';

import client from './lib/appwrite'

initStores();
clearChunkReloadFlag();
installChunkLoadRecovery();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true).then(() => window.location.reload());
  },
  onOfflineReady() {
    console.log('Nave pronto para uso.');
  },
  onRegisteredSW(_swUrl, registration) {
    registration?.update?.().catch(() => {});
    window.setInterval(() => {
      registration?.update?.().catch(() => {});
    }, 60 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </StrictMode>,
)

const scheduleIdleWork = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 1))
scheduleIdleWork(() => {
  client.ping().catch(() => {})
})
