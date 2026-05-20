import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './lib/whatsappTemplates.css'
import './components/academy/agent-ia.css'
import App from './App.jsx'
import { queryClient } from './lib/queryClient'
import { registerSW } from 'virtual:pwa-register';
import { initStores } from './lib/initStores.js';
import { clearChunkReloadFlag, installChunkLoadRecovery } from './lib/lazyWithRetry.js';

import client from './lib/appwrite'

client.ping();

initStores();
clearChunkReloadFlag();
installChunkLoadRecovery();

const updateSW = registerSW({
  onNeedRefresh() {
    // Nova versão: ativa SW e recarrega para pegar index + chunks atuais.
    void updateSW(true).then(() => {
      window.location.reload();
    });
  },
  onOfflineReady() {
    console.log('Nave pronto para uso.');
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
