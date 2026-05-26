import React, { useState, useEffect } from 'react';

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: '#f59e0b',
        color: '#fff',
        padding: '8px 16px',
        textAlign: 'center',
        zIndex: 11000,
        fontSize: 14,
      }}
    >
      Sem conexão com a internet. Algumas funções podem não funcionar.
    </div>
  );
}
