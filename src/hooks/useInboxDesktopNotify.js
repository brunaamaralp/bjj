import { useCallback, useEffect, useRef, useState } from 'react';

function playNotificationSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => {
      try {
        ctx.close();
      } catch {
        void 0;
      }
    };
  } catch {
    void 0;
  }
}

/**
 * Preferência de notificações desktop do Inbox + helpers de alerta.
 */
export function useInboxDesktopNotify({ toast }) {
  const [desktopNotify, setDesktopNotify] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('inbox_desktop_notify') === '1';
    } catch {
      return false;
    }
  });
  const desktopNotifyRef = useRef(false);

  useEffect(() => {
    desktopNotifyRef.current = Boolean(desktopNotify);
  }, [desktopNotify]);

  const tryDesktopNotify = useCallback(({ phone, name, preview }) => {
    if (typeof window === 'undefined' || !desktopNotifyRef.current) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const label = String(name || phone || '').trim() || 'Contato';
    const pv = String(preview || '').trim();
    const body = (pv ? `${label}: ${pv}` : `${label} enviou uma mensagem`).slice(0, 180);
    try {
      new Notification('Nova mensagem no WhatsApp', { body, tag: `wa-inbox-${phone}` });
    } catch {
      void 0;
    }
  }, []);

  const toggleDesktopNotifyPreference = useCallback(async () => {
    if (desktopNotify) {
      try {
        window.localStorage.removeItem('inbox_desktop_notify');
      } catch {
        void 0;
      }
      setDesktopNotify(false);
      toast.info('Notificações do sistema desativadas.');
      return;
    }
    if (typeof Notification === 'undefined') {
      toast.warning('Este navegador não suporta notificações.');
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      toast.warning('Permissão necessária para notificações do sistema.');
      return;
    }
    try {
      window.localStorage.setItem('inbox_desktop_notify', '1');
    } catch {
      void 0;
    }
    setDesktopNotify(true);
    toast.success('Você receberá notificações quando chegar mensagem.');
  }, [desktopNotify, toast]);

  return {
    desktopNotify,
    desktopNotifyRef,
    toggleDesktopNotifyPreference,
    tryDesktopNotify,
    playNotificationSound,
  };
}
