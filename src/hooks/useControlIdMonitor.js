import { useEffect, useRef } from 'react';
import { pollControlIdMonitor } from '../lib/controlidApi';
import { useUiStore } from '../store/useUiStore';

/**
 * Polling de eventos da catraca (long-poll no servidor, intervalo ~30s no cliente).
 */
export function useControlIdMonitor(academyId, enabled) {
  const addToast = useUiStore((s) => s.addToast);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !academyId) return undefined;

    const tick = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const data = await pollControlIdMonitor(academyId);
        if (data.sucesso && Array.isArray(data.events) && data.events.length > 0) {
          const names = data.events.map((e) => e.name).filter(Boolean).join(', ');
          addToast({
            type: 'success',
            message: names
              ? `Presença registrada: ${names}`
              : `${data.events.length} presença(s) pela catraca`,
          });
        }
      } catch (e) {
        console.warn('[controlid monitor]', e?.message || e);
      } finally {
        busyRef.current = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 30_000);
    return () => clearInterval(id);
  }, [academyId, enabled, addToast]);
}
