import { useEffect } from 'react';

function isTextInput(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return Boolean(el.isContentEditable);
  const type = String(el.type || 'text').toLowerCase();
  return type !== 'button' && type !== 'checkbox' && type !== 'radio' && type !== 'submit';
}

/**
 * Atalhos do PDV na aba Nova venda.
 */
export default function useSalesPosHotkeys({
  enabled,
  modalOpen,
  onFocusSku,
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

      const inText = isTextInput(e.target);

      if (e.key === 'F1') {
        e.preventDefault();
        onFocusSku?.();
        return;
      }
      if (e.key === '/' && !inText) {
        e.preventDefault();
        onFocusSku?.();
        return;
      }
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
  }, [
    enabled,
    modalOpen,
    onFocusSku,
    onQuickPix,
    onQuickCash,
    onQuickDebit,
    onSubmit,
    onEscape,
    canSubmit,
  ]);
}
