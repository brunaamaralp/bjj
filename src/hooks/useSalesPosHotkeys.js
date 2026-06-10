import { useEffect } from 'react';

/**
 * Atalhos do PDV na aba Nova venda.
 */
export default function useSalesPosHotkeys({
  enabled,
  modalOpen,
  onQuickPix,
  onQuickCash,
  onQuickDebit,
  onSubmit,
  onEscape,
  canSubmit,
}) {
  useEffect(() => {
    if (!enabled || modalOpen) return undefined;

    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (e.metaKey && e.key.toLowerCase() === 'k') return;

      if (e.key === 'F2') {
        e.preventDefault();
        onQuickPix?.();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        onQuickCash?.();
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        onQuickDebit?.();
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (!canSubmit) return;
        e.preventDefault();
        onSubmit?.();
        return;
      }
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, modalOpen, onQuickPix, onQuickCash, onQuickDebit, onSubmit, onEscape, canSubmit]);
}
