import { useEffect, useRef } from 'react';

/**
 * Fecha menu em click fora e Escape.
 * @param {boolean} open
 * @param {(open: boolean) => void} onOpenChange
 */
export function useDismissibleMenu(open, onOpenChange) {
  const rootRef = useRef(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        onOpenChangeRef.current(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') onOpenChangeRef.current(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return rootRef;
}
