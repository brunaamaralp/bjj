import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Focus trap + Escape para diálogos modais.
 * @param {boolean} open
 * @param {() => void} onClose
 */
export default function useDialogFocus(open, onClose) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    const prevFocus = document.activeElement;

    const focusFirst = () => {
      const root = dialogRef.current;
      const els = getFocusableElements(root);
      if (els.length) els[0].focus();
      else root?.focus?.();
    };

    const timer = setTimeout(focusFirst, 0);

    const onKeyDown = (e) => {
      const root = dialogRef.current;
      if (!root) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const els = getFocusableElements(root);
      if (els.length === 0) {
        e.preventDefault();
        return;
      }

      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown, true);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try {
          prevFocus.focus();
        } catch {
          void 0;
        }
      }
    };
  }, [open, onClose]);

  return dialogRef;
}
