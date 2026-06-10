import { useLayoutEffect, useMemo, useState } from 'react';

const VIEWPORT_PAD = 8;
const FLIP_BELOW_THRESHOLD = 220;
const MIN_PANEL_HEIGHT = 120;

function collectScrollContainers(el) {
  const nodes = [];
  let node = el?.parentElement;
  while (node && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflow = `${style.overflow}${style.overflowX}${style.overflowY}`;
    if (/(auto|scroll|overlay)/.test(overflow)) {
      nodes.push(node);
    }
    node = node.parentElement;
  }
  return nodes;
}

/**
 * Calcula estilo fixed para painel ancorado ao trigger (viewport coords).
 * Exportado para testes.
 */
export function computeAnchoredMenuStyle(
  rect,
  { viewportW, viewportH },
  { align = 'end', gap = 8, maxHeight = 520, zIndex = 'var(--menu-z-elevated, 9000)' } = {},
) {
  const panelMaxH = Math.min(maxHeight, Math.floor(viewportH * 0.72));
  const spaceBelow = viewportH - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const preferAbove = spaceBelow < FLIP_BELOW_THRESHOLD && spaceAbove > spaceBelow;

  const minWidth = 280;
  const next = {
    position: 'fixed',
    overflowY: 'auto',
    overflowX: 'hidden',
    zIndex,
    minWidth,
  };

  if (preferAbove && spaceAbove >= MIN_PANEL_HEIGHT) {
    next.bottom = viewportH - rect.top + gap;
    next.top = 'auto';
    next.maxHeight = Math.min(panelMaxH, Math.max(MIN_PANEL_HEIGHT, spaceAbove - VIEWPORT_PAD));
  } else {
    next.top = Math.max(VIEWPORT_PAD, Math.min(rect.bottom + gap, viewportH - VIEWPORT_PAD - MIN_PANEL_HEIGHT));
    next.bottom = 'auto';
    next.maxHeight = Math.min(panelMaxH, Math.max(MIN_PANEL_HEIGHT, spaceBelow - VIEWPORT_PAD));
  }

  if (align === 'end') {
    next.right = Math.max(VIEWPORT_PAD, viewportW - rect.right);
    next.left = 'auto';
    next.maxWidth = Math.min(360, viewportW - VIEWPORT_PAD * 2);
  } else {
    next.left = Math.max(VIEWPORT_PAD, Math.min(rect.left, viewportW - minWidth - VIEWPORT_PAD));
    next.right = 'auto';
    next.maxWidth = Math.min(360, viewportW - next.left - VIEWPORT_PAD);
  }

  return next;
}

/**
 * Posiciona painel fixed abaixo (ou acima) do trigger, escapando de overflow:hidden dos pais.
 */
export function useAnchoredMenuPosition(
  triggerRef,
  open,
  { align = 'end', gap = 8, maxHeight = 520, zIndex = 'var(--menu-z-elevated, 9000)' } = {},
) {
  const [positionTick, setPositionTick] = useState(0);

  const style = useMemo(() => {
    if (!open || !triggerRef?.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    return computeAnchoredMenuStyle(
      rect,
      { viewportW: window.innerWidth, viewportH: window.innerHeight },
      { align, gap, maxHeight, zIndex },
    );
  }, [open, align, gap, maxHeight, zIndex, positionTick, triggerRef]);

  useLayoutEffect(() => {
    if (!open || !triggerRef?.current) return undefined;

    const update = () => setPositionTick((tick) => tick + 1);
    const scrollTargets = collectScrollContainers(triggerRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    for (const node of scrollTargets) {
      node.addEventListener('scroll', update, { passive: true });
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      for (const node of scrollTargets) {
        node.removeEventListener('scroll', update);
      }
    };
  }, [open, align, gap, maxHeight, zIndex, triggerRef]);

  return style;
}
