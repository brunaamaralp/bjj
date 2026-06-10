import React, { useEffect } from 'react';
import { Check } from 'lucide-react';

const TOAST_MS = 2500;

/**
 * Toast fixo no rodapé para feedback de follow-up concluído (somente UX).
 */
export default function FollowUpMicroToast({ open, message = 'Retorno registrado!', onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => onClose?.(), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fu-micro-toast fu-micro-toast--visible" role="status" aria-live="polite">
      <Check size={14} strokeWidth={2.5} aria-hidden />
      <span>{message}</span>
    </div>
  );
}
