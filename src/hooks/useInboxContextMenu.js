import { useCallback, useState } from 'react';
import { computeInboxMenuPosition } from '../lib/inboxMenuPosition.js';

/**
 * Menu contextual flutuante (mensagem) ancorado em coordenadas da viewport.
 */
export function useInboxContextMenu() {
  const [menu, setMenu] = useState(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((kind, anchorEl, payload) => {
    const menuKind = String(kind || '').trim();
    const { x, y } = computeInboxMenuPosition({ kind: menuKind, anchorEl });
    setMenu({ kind: menuKind, x, y, payload: payload || null });
  }, []);

  return { menu, openMenu, closeMenu };
}
