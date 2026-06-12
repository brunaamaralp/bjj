import { useEffect, useMemo, useRef, useState } from 'react';
import { humanHandoffUntilToMs } from '../../lib/humanHandoffUntil.js';
import { getHumanHandoffHoursForClient } from '../../lib/constants.js';

/**
 * Handoff humano: hint de liberação, frase de duração e toast ao expirar.
 */
export function useInboxHandoff({ selectedPhone, selected, toast, agentIaActive = false }) {
  const [handoffReleaseHint, setHandoffReleaseHint] = useState(false);
  const handoffExpiryToastRef = useRef('');

  const handoffHours = useMemo(() => getHumanHandoffHoursForClient(), []);
  const handoffDurationPhrase = useMemo(
    () => (handoffHours === 1 ? '1 hora' : `${handoffHours} horas`),
    [handoffHours]
  );

  useEffect(() => {
    const phone = String(selectedPhone || '').trim();
    const untilMs = humanHandoffUntilToMs(selected?.human_handoff_until);
    if (!phone || !selected?.need_human || untilMs <= 0) {
      handoffExpiryToastRef.current = '';
      return;
    }
    const showExpiryToast = () => {
      if (!agentIaActive) return;
      const key = `${phone}:${untilMs}`;
      if (handoffExpiryToastRef.current === key) return;
      handoffExpiryToastRef.current = key;
      toast.warning('Tempo do atendimento manual acabou. A IA pode retomar neste atendimento.');
    };
    const delay = untilMs - Date.now();
    if (delay <= 0) {
      showExpiryToast();
      return;
    }
    const id = setTimeout(showExpiryToast, delay);
    return () => clearTimeout(id);
  }, [toast, agentIaActive, selected?.human_handoff_until, selected?.need_human, selectedPhone]);

  return {
    handoffReleaseHint,
    setHandoffReleaseHint,
    handoffDurationPhrase,
    handoffHours,
  };
}
