import React from 'react';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import { DropdownMenuBackdrop, DropdownMenuPanel } from '../shared/menu';

/**
 * Painel de menu fixo na viewport (mensagens) com backdrop e Escape.
 */
export default function InboxFloatingMenu({ open, x, y, onClose, ariaLabel, children }) {
  const panelRef = useDismissibleMenu(open, (next) => {
    if (!next) onClose();
  });

  if (!open) return null;

  return (
    <>
      <DropdownMenuBackdrop onClick={onClose} className="inbox-menu-overlay" />
      <div ref={panelRef} className="inbox-floating-menu-anchor">
        <DropdownMenuPanel
          fixed
          elevated
          role="menu"
          aria-label={ariaLabel}
          className="inbox-menu-panel navi-menu__panel navi-menu__panel--overlay"
          style={{ left: Number(x || 0), top: Number(y || 0) }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </DropdownMenuPanel>
      </div>
    </>
  );
}
