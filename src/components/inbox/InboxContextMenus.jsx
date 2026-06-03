import React from 'react';
import InboxFloatingMenu from './InboxFloatingMenu.jsx';
import InboxMessageMenuContent from './InboxMessageMenuContent.jsx';

/**
 * Menu flutuante de mensagem (thread usa DropdownMenu no header).
 */
export default function InboxContextMenus({ menu, closeMenu, messageMenuProps }) {
  if (!menu || menu.kind !== 'message') return null;

  return (
    <InboxFloatingMenu
      open
      x={menu.x}
      y={menu.y}
      onClose={closeMenu}
      ariaLabel="Ações da mensagem"
    >
      <InboxMessageMenuContent payload={menu.payload} onClose={closeMenu} {...messageMenuProps} />
    </InboxFloatingMenu>
  );
}
