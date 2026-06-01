import { useLayoutEffect, useState } from 'react';

/**
 * Posiciona painel fixed abaixo (ou acima) do trigger, escapando de overflow:hidden dos pais.
 */
export function useAnchoredMenuPosition(
  triggerRef,
  open,
  { align = 'end', gap = 8, maxHeight = 520, zIndex = 'var(--menu-z-elevated, 9000)' } = {},
) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef?.current) {
      setStyle(null);
      return undefined;
    }

    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const panelMaxH = Math.min(maxHeight, Math.floor(viewportH * 0.72));
      const spaceBelow = viewportH - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

      let top = placeAbove ? rect.top - gap - panelMaxH : rect.bottom + gap;
      top = Math.max(8, Math.min(top, viewportH - panelMaxH - 8));

      const next = {
        position: 'fixed',
        top,
        maxHeight: panelMaxH,
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex,
      };

      const minWidth = 280;
      if (align === 'end') {
        const right = Math.max(8, viewportW - rect.right);
        next.right = right;
        next.left = 'auto';
        next.minWidth = minWidth;
        next.maxWidth = Math.min(360, viewportW - 16);
      } else {
        next.left = Math.max(8, Math.min(rect.left, viewportW - minWidth - 8));
        next.right = 'auto';
        next.minWidth = minWidth;
        next.maxWidth = Math.min(360, viewportW - next.left - 8);
      }

      setStyle(next);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, align, gap, maxHeight, zIndex, triggerRef]);

  return style;
}
